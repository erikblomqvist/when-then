-- Cards, categories, their translations and the audit log (ADR 0001, ADR 0002, issues #9, #14).
--
-- Access: the browser never touches these tables. RLS is on with no policies, the Data API
-- roles anon/authenticated get nothing, and the server works through the service client
-- (service_role) after checking the admin's role.
--
-- Audit: triggers write every create, update and delete to `audit_log`. The actor comes from
-- the transaction setting `app.actor_id` (falling back to auth.uid()), because the service
-- client has no auth.uid(). So every audited write from the app is a Postgres function called
-- with `.rpc()` that takes the actor first and calls `public.set_actor(actor)` before writing,
-- like `public.save_card` below. A write through the Data API without an actor is refused;
-- migrations, the seed and the SQL editor may write without one (logged with a null actor).

create type public.card_status as enum ('draft', 'published', 'archived');
create type public.translation_status as enum ('machine', 'reviewed', 'stale');
create type public.card_locale as enum ('en', 'sv', 'nb');

-- ---------------------------------------------------------------------------------------------
-- Actor

create function public.set_actor(actor uuid)
returns void
language sql
volatile
set search_path = ''
as $$
    select set_config('app.actor_id', coalesce(actor::text, ''), true);
$$;

comment on function public.set_actor(uuid) is
    'Names who is writing, for the audit triggers, until the end of the current transaction.';

create function public.current_actor()
returns uuid
language sql
stable
set search_path = ''
as $$
    select coalesce(nullif(current_setting('app.actor_id', true), '')::uuid, auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Authoring metadata: created_* and updated_* are set here, never by the caller.

create function public.stamp_authoring()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        new.created_at := now();
        new.created_by := public.current_actor();
    else
        new.created_at := old.created_at;
        new.created_by := old.created_by;
    end if;
    new.updated_at := now();
    new.updated_by := public.current_actor();
    return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Audit log: append-only (actor, entity, entity_id, action, before, after, at).

create table public.audit_log (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    actor_id uuid references auth.users (id) on delete set null,
    -- 'card', 'card_translation', 'category', 'category_translation'; later also app-written
    -- actions such as AI requests on a card.
    entity text not null,
    -- The card or category the row is about (also for its translations), so a card's history
    -- is one indexed lookup. Text, so entities keyed otherwise (a role invite's email) fit.
    entity_id text not null,
    locale public.card_locale,
    -- 'create', 'update', 'delete' from the triggers; app-written rows add their own.
    action text not null,
    before jsonb,
    after jsonb,
    -- Extra facts for app-written rows (AI model, cost).
    details jsonb
);

comment on table public.audit_log is
    'Append-only history of admin changes, written by triggers and by the app. Read-only.';

create index audit_log_entity_idx on public.audit_log (entity_id, id desc);
create index audit_log_at_idx on public.audit_log (at desc, id desc);
create index audit_log_actor_idx on public.audit_log (actor_id, id desc);

create function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_append_only
    before update or delete on public.audit_log
    for each row execute function public.audit_log_is_append_only();

create trigger audit_log_no_truncate
    before truncate on public.audit_log
    for each statement execute function public.audit_log_is_append_only();

-- The one way the app writes its own audit rows (AI calls, decisions on AI suggestions, role
-- changes, imports), naming the actor explicitly: the service client has no auth.uid(), and
-- the server may not insert into the log directly. Returns the new row's id.
create function public.record_audit(
    actor uuid,
    entity text,
    entity_id text,
    action text,
    before jsonb default null,
    after jsonb default null,
    locale public.card_locale default null,
    details jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
    id bigint;
begin
    if actor is null then
        raise exception 'record_audit needs an actor';
    end if;
    insert into public.audit_log (actor_id, entity, entity_id, locale, action, before, after, details)
    values (actor, entity, entity_id, locale, action, before, after, details)
    returning audit_log.id into id;
    return id;
end;
$$;

-- Trigger arguments: the entity name and the column holding the card or category id.
create function public.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    metadata constant text[] := array['created_at', 'created_by', 'updated_at', 'updated_by'];
    old_row jsonb;
    new_row jsonb;
    subject jsonb;
    actor uuid := public.current_actor();
begin
    if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;

    -- Saving without changing anything is not a change.
    if tg_op = 'UPDATE' and (old_row - metadata) = (new_row - metadata) then
        return null;
    end if;

    -- Requests through the Data API (the app's service client) log in as `authenticator`.
    if actor is null and session_user = 'authenticator' then
        raise exception 'Audited write to % without an actor: write through an rpc that calls public.set_actor', tg_table_name;
    end if;

    subject := coalesce(new_row, old_row);
    insert into public.audit_log (actor_id, entity, entity_id, locale, action, before, after)
    values (
        actor,
        tg_argv[0],
        subject ->> tg_argv[1],
        (subject ->> 'locale')::public.card_locale,
        case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end,
        old_row,
        new_row
    );
    return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Categories

create table public.categories (
    id uuid primary key default gen_random_uuid(),
    -- Manual order; the category draw numbers categories 1..n by position.
    position integer not null check (position > 0),
    -- A Lucide icon name from the curated set and a palette colour token (issue #14).
    icon text not null,
    colour text not null,
    archived_at timestamptz,
    archived_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null,
    -- Deferrable, so a reorder can swap positions within one transaction.
    constraint categories_position_key unique (position) deferrable initially immediate
);

create table public.category_translations (
    category_id uuid not null references public.categories (id) on delete cascade,
    locale public.card_locale not null,
    name text not null check (length(btrim(name)) > 0),
    status public.translation_status not null default 'reviewed',
    created_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null,
    primary key (category_id, locale)
);

-- ---------------------------------------------------------------------------------------------
-- Cards: language-neutral, with the date as the parts that are known (ADR 0001).

-- The decade a year belongs to, stored by its earliest year: 1492 → 1490, 5 → 1, -44 → -49.
create function public.decade_of(year integer)
returns integer
language sql
immutable
set search_path = ''
as $$
    select case
        when year > 0 then case when year < 10 then 1 else year - year % 10 end
        else -((-year) - (-year) % 10 + 9)
    end;
$$;

-- Same rules as src/lib/cards/date-parts.ts. Postgres dates also count BC as negative with no
-- year 0, so make_date takes our years as they are.
create function public.card_date_parts_valid(
    decade integer,
    year integer,
    month smallint,
    day smallint
)
returns boolean
language sql
immutable
set search_path = ''
as $$
    select
        (year is null or year <> 0)
        and (month is null or (year is not null and month between 1 and 12))
        and (
            day is null
            or (
                month is not null
                and day between 1 and extract(
                    day from make_date(year, month, 1) + interval '1 month' - interval '1 day'
                )
            )
        )
        and (
            decade is null
            or (decade > 0 and (decade = 1 or decade % 10 = 0))
            or (decade < 0 and (decade - 1) % 10 = 0)
        )
        and (year is null or decade = public.decade_of(year));
$$;

create table public.cards (
    id uuid primary key default gen_random_uuid(),
    status public.card_status not null default 'draft',
    category_id uuid not null references public.categories (id) on delete restrict,
    decade integer,
    year integer,
    month smallint,
    day smallint,
    source_url text,
    source_quote text,
    -- 1 (most people know it) to 4.
    difficulty smallint check (difficulty between 1 and 4),
    tags text[] not null default '{}',
    verified_at timestamptz,
    verified_by uuid references auth.users (id) on delete set null,
    archived_at timestamptz,
    archived_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null,
    constraint cards_date_parts_valid check (public.card_date_parts_valid(decade, year, month, day))
);

create index cards_category_idx on public.cards (category_id);
create index cards_updated_idx on public.cards (updated_at desc, id);

create table public.card_translations (
    card_id uuid not null references public.cards (id) on delete cascade,
    locale public.card_locale not null,
    text text not null check (length(btrim(text)) > 0),
    -- Per-translation note for the reader (ADR 0001 hook).
    note text,
    status public.translation_status not null default 'machine',
    created_at timestamptz not null default now(),
    created_by uuid references auth.users (id) on delete set null,
    updated_at timestamptz not null default now(),
    updated_by uuid references auth.users (id) on delete set null,
    primary key (card_id, locale),
    -- English is the canonical text, never a translation of something else.
    constraint card_translations_english_reviewed check (locale <> 'en' or status = 'reviewed')
);

-- ---------------------------------------------------------------------------------------------
-- Triggers

create trigger stamp_authoring before insert or update on public.categories
    for each row execute function public.stamp_authoring();
create trigger stamp_authoring before insert or update on public.category_translations
    for each row execute function public.stamp_authoring();
create trigger stamp_authoring before insert or update on public.cards
    for each row execute function public.stamp_authoring();
create trigger stamp_authoring before insert or update on public.card_translations
    for each row execute function public.stamp_authoring();

create trigger audit after insert or update or delete on public.categories
    for each row execute function public.audit_change('category', 'id');
create trigger audit after insert or update or delete on public.category_translations
    for each row execute function public.audit_change('category_translation', 'category_id');
create trigger audit after insert or update or delete on public.cards
    for each row execute function public.audit_change('card', 'id');
create trigger audit after insert or update or delete on public.card_translations
    for each row execute function public.audit_change('card_translation', 'card_id');

-- ---------------------------------------------------------------------------------------------
-- Writes

-- Creates (no card_id) or edits a card and the translations given, as one audited
-- transaction. `card` holds category_id, decade, year, month, day, source_url, source_quote.
-- `translations` maps a locale to {text, note?, status?}: only the locales given are written;
-- a note left out keeps its value; status defaults to reviewed (a person wrote or edited it).
create function public.save_card(
    actor uuid,
    card jsonb,
    translations jsonb,
    card_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
    saved_id uuid;
    entry record;
begin
    if actor is null then
        raise exception 'save_card needs an actor';
    end if;
    perform public.set_actor(actor);

    if card_id is null then
        insert into public.cards (
            category_id, decade, year, month, day, source_url, source_quote
        )
        values (
            (card ->> 'category_id')::uuid,
            (card ->> 'decade')::integer,
            (card ->> 'year')::integer,
            (card ->> 'month')::smallint,
            (card ->> 'day')::smallint,
            card ->> 'source_url',
            card ->> 'source_quote'
        )
        returning id into saved_id;
    else
        update public.cards as c
        set category_id = (card ->> 'category_id')::uuid,
            decade = (card ->> 'decade')::integer,
            year = (card ->> 'year')::integer,
            month = (card ->> 'month')::smallint,
            day = (card ->> 'day')::smallint,
            source_url = card ->> 'source_url',
            source_quote = card ->> 'source_quote'
        where c.id = save_card.card_id
        returning c.id into saved_id;

        if saved_id is null then
            raise exception 'No card %', card_id using errcode = 'P0002';
        end if;
    end if;

    for entry in select key, value from jsonb_each(coalesce(translations, '{}'::jsonb)) loop
        insert into public.card_translations as t (card_id, locale, text, note, status)
        values (
            saved_id,
            entry.key::public.card_locale,
            entry.value ->> 'text',
            entry.value ->> 'note',
            coalesce((entry.value ->> 'status')::public.translation_status, 'reviewed')
        )
        on conflict on constraint card_translations_pkey do update
        set text = excluded.text,
            note = case when entry.value ? 'note' then excluded.note else t.note end,
            status = excluded.status;
    end loop;

    return saved_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Access: deny the browser, let the server's service client in.

alter table public.categories enable row level security;
alter table public.category_translations enable row level security;
alter table public.cards enable row level security;
alter table public.card_translations enable row level security;
alter table public.audit_log enable row level security;

revoke all on table
    public.categories,
    public.category_translations,
    public.cards,
    public.card_translations,
    public.audit_log
from anon, authenticated, public;

grant select, insert, update, delete on table
    public.categories,
    public.category_translations,
    public.cards,
    public.card_translations
to service_role;
-- Append-only: the app reads the log and adds its own rows through record_audit only.
grant select on table public.audit_log to service_role;

revoke execute on function
    public.record_audit(uuid, text, text, text, jsonb, jsonb, public.card_locale, jsonb),
    public.set_actor(uuid),
    public.current_actor(),
    public.save_card(uuid, jsonb, jsonb, uuid),
    public.decade_of(integer),
    public.card_date_parts_valid(integer, integer, smallint, smallint)
from anon, authenticated, public;

grant execute on function
    public.record_audit(uuid, text, text, text, jsonb, jsonb, public.card_locale, jsonb),
    public.set_actor(uuid),
    public.current_actor(),
    public.save_card(uuid, jsonb, jsonb, uuid),
    public.decade_of(integer),
    public.card_date_parts_valid(integer, integer, smallint, smallint)
to service_role;
