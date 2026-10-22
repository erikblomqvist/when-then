-- People and roles (#45). Admins invite an email with a role on the People page; the role
-- attaches at that email's first Google sign-in. Admins change and revoke roles later, and
-- there is always at least one admin. Every role change is audited.
--
-- The server calls these functions with the service client, where `auth.uid()` is null, so
-- each one takes the acting admin explicitly (`actor`) and checks they are an admin with
-- `public.require_admin`.
-- Pending invites hold an email, which nobody but the server may read.

-- Invites --------------------------------------------------------------------------------

create table public.role_invites (
    email text primary key check (email = lower(btrim(email)) and email like '_%@_%'),
    role public.app_role not null,
    invited_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
);

comment on table public.role_invites is
    'Pending roles by email; attached and removed at that email''s first Google sign-in.';

alter table public.role_invites enable row level security;
revoke all on table public.role_invites from anon, authenticated, public;
grant select, insert, update, delete on table public.role_invites to service_role;

-- Audit ----------------------------------------------------------------------------------
--
-- Role changes only. Its columns match the general audit log (#37) — actor, entity, entity
-- id, action, before, after, at — and every write goes through `audit_role_change`, so
-- folding it into that log means repointing this one function and copying the rows over.

create table public.role_audit (
    id bigint generated always as identity primary key,
    actor_id uuid references auth.users (id) on delete set null,
    entity text not null check (entity in ('user_role', 'role_invite')),
    entity_id text not null,
    action text not null,
    before jsonb,
    after jsonb,
    at timestamptz not null default now()
);

comment on table public.role_audit is 'Append-only log of role and invite changes.';

alter table public.role_audit enable row level security;
revoke all on table public.role_audit from anon, authenticated, public;
grant select on table public.role_audit to service_role;

create function public.audit_role_change(
    actor uuid,
    entity text,
    entity_id text,
    action text,
    before jsonb,
    after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.role_audit (actor_id, entity, entity_id, action, before, after)
    values (actor, entity, entity_id, action, before, after);
$$;

revoke execute on function public.audit_role_change(uuid, text, text, text, jsonb, jsonb)
    from public, anon, authenticated;

-- Helpers --------------------------------------------------------------------------------

-- Whether this auth user signed in with Google (GoTrue keeps providers in app metadata).
-- Invites only attach to Google accounts: anyone could sign up by password with an email.
create function public.is_google_user(app_metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select coalesce(app_metadata -> 'providers', '[]'::jsonb) ? 'google'
        or app_metadata ->> 'provider' = 'google';
$$;

-- Roles ----------------------------------------------------------------------------------

-- Grant, change (`new_role`) or revoke (no `new_role`) a person's role.
create function public.set_person_role(
    actor uuid,
    person_id uuid,
    new_role public.app_role default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    old_role public.app_role;
    admins integer;
begin
    perform public.require_admin(actor, 'Only admins manage people.');

    -- Lock the admins so two admins stepping down at once can't leave none.
    select count(*) into admins
    from (select 1 from public.user_roles where role = 'admin' for update) as locked;

    select role into old_role from public.user_roles where user_id = person_id;

    if old_role is not distinct from new_role then
        return;
    end if;

    if old_role = 'admin' and admins <= 1 then
        raise exception 'last_admin' using detail = 'There must always be at least one admin.';
    end if;

    if new_role is null then
        delete from public.user_roles where user_id = person_id;
    else
        insert into public.user_roles (user_id, role) values (person_id, new_role)
        on conflict (user_id) do update set role = excluded.role;
    end if;

    perform public.audit_role_change(
        actor,
        'user_role',
        person_id::text,
        case when old_role is null then 'grant' when new_role is null then 'revoke' else 'change' end,
        case when old_role is null then null else jsonb_build_object('role', old_role) end,
        case when new_role is null then null else jsonb_build_object('role', new_role) end
    );
end;
$$;

-- Add an email with a role: granted at once when that email already signed in with Google,
-- otherwise kept as a pending invite. Returns 'granted' or 'invited'.
create function public.invite_person(actor uuid, email text, role public.app_role)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    normalised text := lower(btrim(email));
    person_id uuid;
begin
    perform public.require_admin(actor, 'Only admins manage people.');

    select u.id into person_id
    from auth.users u
    where lower(u.email) = normalised
        and not u.is_anonymous
        and public.is_google_user(u.raw_app_meta_data)
    order by u.created_at
    limit 1;

    if person_id is not null then
        perform public.set_person_role(actor, person_id, role);
        return 'granted';
    end if;

    perform public.set_invite_role(actor, normalised, role);
    return 'invited';
end;
$$;

-- Create, change (`new_role`) or withdraw (no `new_role`) a pending invite.
create function public.set_invite_role(
    actor uuid,
    invite_email text,
    new_role public.app_role default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    normalised text := lower(btrim(invite_email));
    old_role public.app_role;
begin
    perform public.require_admin(actor, 'Only admins manage people.');

    select i.role into old_role from public.role_invites i where i.email = normalised for update;

    if old_role is not distinct from new_role then
        return;
    end if;

    if new_role is null then
        delete from public.role_invites where email = normalised;
    else
        insert into public.role_invites (email, role, invited_by)
        values (normalised, new_role, actor)
        on conflict (email) do update set role = excluded.role;
    end if;

    perform public.audit_role_change(
        actor,
        'role_invite',
        normalised,
        case
            when old_role is null then 'invite'
            when new_role is null then 'withdraw_invite'
            else 'change_invite'
        end,
        case when old_role is null then null else jsonb_build_object('role', old_role) end,
        case when new_role is null then null else jsonb_build_object('role', new_role) end
    );
end;
$$;

-- Everyone with a role, with the email they sign in with.
create function public.list_people()
returns table (user_id uuid, email text, role public.app_role, granted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    select r.user_id, u.email::text, r.role, r.created_at
    from public.user_roles r
    join auth.users u on u.id = r.user_id
    order by u.email;
$$;

-- Attaching invites at the first Google sign-in -----------------------------------------
--
-- GoTrue creates the user (and later links identities) as supabase_auth_admin; this runs as
-- the function owner so it can move the invite into `user_roles`. The access token hook runs
-- after, so the very first token already carries the role.

create function public.attach_invited_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    invite public.role_invites;
begin
    if new.email is null or new.is_anonymous or not public.is_google_user(new.raw_app_meta_data) then
        return new;
    end if;

    delete from public.role_invites where email = lower(btrim(new.email)) returning * into invite;
    if invite.email is null then
        return new;
    end if;

    insert into public.user_roles (user_id, role) values (new.id, invite.role)
    on conflict (user_id) do nothing;

    perform public.audit_role_change(
        new.id,
        'user_role',
        new.id::text,
        'accept_invite',
        jsonb_build_object('invite', invite.email, 'invited_by', invite.invited_by),
        jsonb_build_object('role', invite.role)
    );
    return new;
end;
$$;

create trigger attach_invited_role
    after insert or update of email, raw_app_meta_data on auth.users
    for each row execute function public.attach_invited_role();

-- Only the server (service role) calls these.
revoke execute on function public.set_person_role(uuid, uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.invite_person(uuid, text, public.app_role) from public, anon, authenticated;
revoke execute on function public.set_invite_role(uuid, text, public.app_role) from public, anon, authenticated;
revoke execute on function public.list_people() from public, anon, authenticated;
revoke execute on function public.attach_invited_role() from public, anon, authenticated;
grant execute on function public.set_person_role(uuid, uuid, public.app_role) to service_role;
grant execute on function public.invite_person(uuid, text, public.app_role) to service_role;
grant execute on function public.set_invite_role(uuid, text, public.app_role) to service_role;
grant execute on function public.list_people() to service_role;
