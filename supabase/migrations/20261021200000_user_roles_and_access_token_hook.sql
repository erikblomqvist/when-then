-- Admin roles and the Custom Access Token hook (ADR 0002).
--
-- Players sign in anonymously and have no row here. Admins sign in with Google and get a
-- row with `admin` or `editor`; the hook copies that role into the JWT as `user_role`, so
-- server routes can gate /admin on the claim without a database round trip.
--
-- Production: enable the hook once in the dashboard, Authentication → Hooks →
-- Customize Access Token (JWT) Claims → Postgres function `public.custom_access_token_hook`.
-- Locally it is enabled in `supabase/config.toml`.

create type public.app_role as enum ('admin', 'editor');

create table public.user_roles (
    user_id uuid primary key references auth.users (id) on delete cascade,
    role public.app_role not null,
    created_at timestamptz not null default now()
);

comment on table public.user_roles is 'Admin roles for Google-authenticated users. Players have no row.';

-- The browser never reads or writes tables: RLS on, no policies for anon/authenticated.
-- The server uses the secret key, which bypasses RLS.
alter table public.user_roles enable row level security;

-- The hook runs as supabase_auth_admin and only needs to read roles.
grant usage on schema public to supabase_auth_admin;
grant select on table public.user_roles to supabase_auth_admin;
revoke all on table public.user_roles from anon, authenticated, public;

create policy "auth admin reads user roles"
    on public.user_roles
    as permissive
    for select
    to supabase_auth_admin
    using (true);

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
    claims jsonb;
    user_role public.app_role;
begin
    select role into user_role
    from public.user_roles
    where user_id = (event ->> 'user_id')::uuid;

    claims := event -> 'claims';

    if user_role is not null then
        claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
        claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
