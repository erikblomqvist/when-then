-- Card lifecycle and verification (#38): publish, archive, unarchive, delete draft, and
-- marking a card's date verified. Each is an rpc taking the actor first, like save_card, so
-- the audit triggers name who did it. The audit log records these as their own actions
-- ('publish', 'archive', 'unarchive', 'verify', 'unverify') rather than a plain 'update'.
--
-- Errors are raised with the code as the message (P0001) and the reason as the detail:
-- not_found, invalid_transition, publish_blocked, not_admin, not_draft.

-- ---------------------------------------------------------------------------------------------
-- The publish rule, same as src/lib/cards/publish-rule.ts (same sentences, same order).

create function public.card_publish_blockers(card_id uuid)
returns text[]
language sql
stable
set search_path = ''
as $$
    select array_remove(array[
        case when not exists (
            select 1 from public.card_translations t
            where t.card_id = c.id and t.locale = 'en' and length(btrim(t.text)) > 0
        ) then 'Add the English text.' end,
        case
            when c.decade is null then 'Add a date: at least the decade.'
            when c.decade >= 1500 and c.year is null then 'Cards from 1500 onwards need a year.'
        end
    ], null)
    from public.cards c
    where c.id = card_publish_blockers.card_id;
$$;

create function public.require_publishable(card_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
    blockers text[] := public.card_publish_blockers(card_id);
begin
    if cardinality(blockers) > 0 then
        raise exception 'publish_blocked' using detail = array_to_string(blockers, ' ');
    end if;
end;
$$;

-- Locks the card for the rest of the transaction and returns its status.
create function public.lock_card(card_id uuid)
returns public.card_status
language plpgsql
volatile
set search_path = ''
as $$
declare
    current_status public.card_status;
begin
    select c.status into current_status
    from public.cards c
    where c.id = lock_card.card_id
    for update;
    if not found then
        raise exception 'not_found' using detail = 'No such card.', errcode = 'P0001';
    end if;
    return current_status;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Status changes

create function public.publish_card(actor uuid, card_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.set_actor(actor);
    if public.lock_card(card_id) <> 'draft' then
        raise exception 'invalid_transition' using detail = 'Only a draft can be published.';
    end if;
    perform public.require_publishable(card_id);
    update public.cards c set status = 'published' where c.id = publish_card.card_id;
end;
$$;

create function public.archive_card(actor uuid, card_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.set_actor(actor);
    if public.lock_card(card_id) <> 'published' then
        raise exception 'invalid_transition' using detail = 'Only a published card can be archived.';
    end if;
    update public.cards c
    set status = 'archived', archived_at = now(), archived_by = actor
    where c.id = archive_card.card_id;
end;
$$;

-- Back to published: the card is dealt again, so it must pass the publish rule again.
create function public.unarchive_card(actor uuid, card_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.set_actor(actor);
    if public.lock_card(card_id) <> 'archived' then
        raise exception 'invalid_transition' using detail = 'Only an archived card can be unarchived.';
    end if;
    perform public.require_publishable(card_id);
    update public.cards c
    set status = 'published', archived_at = null, archived_by = null
    where c.id = unarchive_card.card_id;
end;
$$;

-- Admins only, and only a draft: a draft has never been published, since nothing leads back
-- to draft. Translations go with it (cascade); the audit log keeps the deleted rows.
create function public.delete_draft(actor uuid, card_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.set_actor(actor);
    if not exists (
        select 1 from public.user_roles r where r.user_id = actor and r.role = 'admin'
    ) then
        raise exception 'not_admin' using detail = 'Only admins can delete drafts.';
    end if;
    if public.lock_card(card_id) <> 'draft' then
        raise exception 'not_draft' using detail = 'Only a never-published draft can be deleted.';
    end if;
    delete from public.cards c where c.id = delete_draft.card_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Verification: someone checked the date against a source.

create function public.set_card_verified(actor uuid, card_id uuid, verified boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.set_actor(actor);
    perform public.lock_card(card_id);
    update public.cards c
    set verified_at = case when verified then now() end,
        verified_by = case when verified then actor end
    where c.id = set_card_verified.card_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- save_card: now also clears the verification when `card.clear_verification` is true (the
-- editor asks when a verified date changes), and refuses an edit that would leave a
-- published card breaking the publish rule.

create or replace function public.save_card(
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
    saved_status public.card_status;
    entry record;
    clear_verification constant boolean :=
        coalesce((card ->> 'clear_verification')::boolean, false);
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
        returning id, status into saved_id, saved_status;
    else
        update public.cards as c
        set category_id = (card ->> 'category_id')::uuid,
            decade = (card ->> 'decade')::integer,
            year = (card ->> 'year')::integer,
            month = (card ->> 'month')::smallint,
            day = (card ->> 'day')::smallint,
            source_url = card ->> 'source_url',
            source_quote = card ->> 'source_quote',
            verified_at = case when clear_verification then null else c.verified_at end,
            verified_by = case when clear_verification then null else c.verified_by end
        where c.id = save_card.card_id
        returning c.id, c.status into saved_id, saved_status;

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

    if saved_status = 'published' then
        perform public.require_publishable(saved_id);
    end if;

    return saved_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Audit: name status and verification changes on a card by what they are.

create or replace function public.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    metadata constant text[] := array['created_at', 'created_by', 'updated_at', 'updated_by'];
    verification constant text[] := array['verified_at', 'verified_by'];
    old_row jsonb;
    new_row jsonb;
    subject jsonb;
    actor uuid := public.current_actor();
    action text;
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

    action := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;
    if tg_op = 'UPDATE' and tg_argv[0] = 'card' then
        if old_row ->> 'status' <> new_row ->> 'status' then
            action := case
                when new_row ->> 'status' = 'archived' then 'archive'
                when old_row ->> 'status' = 'archived' then 'unarchive'
                when new_row ->> 'status' = 'published' then 'publish'
                else 'update'
            end;
        elsif (old_row - metadata - verification) = (new_row - metadata - verification) then
            action := case when new_row ->> 'verified_at' is null then 'unverify' else 'verify' end;
        end if;
    end if;

    subject := coalesce(new_row, old_row);
    insert into public.audit_log (actor_id, entity, entity_id, locale, action, before, after)
    values (
        actor,
        tg_argv[0],
        subject ->> tg_argv[1],
        (subject ->> 'locale')::public.card_locale,
        action,
        old_row,
        new_row
    );
    return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Access: the server's service client only.

revoke execute on function
    public.card_publish_blockers(uuid),
    public.require_publishable(uuid),
    public.lock_card(uuid),
    public.publish_card(uuid, uuid),
    public.archive_card(uuid, uuid),
    public.unarchive_card(uuid, uuid),
    public.delete_draft(uuid, uuid),
    public.set_card_verified(uuid, uuid, boolean)
from anon, authenticated, public;

grant execute on function
    public.card_publish_blockers(uuid),
    public.require_publishable(uuid),
    public.lock_card(uuid),
    public.publish_card(uuid, uuid),
    public.archive_card(uuid, uuid),
    public.unarchive_card(uuid, uuid),
    public.delete_draft(uuid, uuid),
    public.set_card_verified(uuid, uuid, boolean)
to service_role;
