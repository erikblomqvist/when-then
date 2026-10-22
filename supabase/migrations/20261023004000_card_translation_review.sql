-- Translating a card by hand (#40): the status a save gives a translation, staleness after an
-- English edit, the card's updated time following its translations, and the card list's
-- filter by translation state per locale.
--
-- Status rules (mirrored for the editor's preview in `#lib/cards/translation.ts`):
-- - a translation given as JSON null is removed (never English)
-- - an explicit `status` wins: 'reviewed' when a person ticked it, 'machine' for a machine
--   translation saved as it is
-- - otherwise new or edited text is reviewed (editing counts as review; a note alone does
--   not), and unchanged text keeps its status
-- - when the English text changes, every reviewed translation not reviewed in the same save
--   turns stale: still playable, but back in the review queue. Machine ones stay machine.

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
    entry_locale public.card_locale;
    entry_text text;
    existing public.card_translations;
    had_row boolean;
    new_status public.translation_status;
    english_changed boolean := false;
    reviewed_now public.card_locale[] := '{}';
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
        entry_locale := entry.key::public.card_locale;
        select * into existing
        from public.card_translations t
        where t.card_id = saved_id and t.locale = entry_locale;
        had_row := found;

        if jsonb_typeof(entry.value) = 'null' then
            if entry_locale = 'en' then
                raise exception 'The English text can''t be removed';
            end if;
            delete from public.card_translations t
            where t.card_id = saved_id and t.locale = entry_locale;
            continue;
        end if;

        entry_text := entry.value ->> 'text';
        if entry_locale = 'en' then
            english_changed := had_row and existing.text is distinct from entry_text;
            new_status := 'reviewed';
        elsif entry.value ? 'status' then
            new_status := (entry.value ->> 'status')::public.translation_status;
            if new_status = 'reviewed' then reviewed_now := reviewed_now || entry_locale; end if;
        elsif not had_row or existing.text is distinct from entry_text then
            new_status := 'reviewed';
            reviewed_now := reviewed_now || entry_locale;
        else
            new_status := existing.status;
        end if;

        insert into public.card_translations as t (card_id, locale, text, note, status)
        values (saved_id, entry_locale, entry_text, entry.value ->> 'note', new_status)
        on conflict on constraint card_translations_pkey do update
        set text = excluded.text,
            note = case when entry.value ? 'note' then excluded.note else t.note end,
            status = excluded.status;
    end loop;

    if english_changed then
        update public.card_translations t
        set status = 'stale'
        where t.card_id = saved_id
            and t.locale <> 'en'
            and t.status = 'reviewed'
            and not (t.locale = any (reviewed_now));
    end if;

    if saved_status = 'published' then
        perform public.require_publishable(saved_id);
    end if;

    return saved_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- A translation change is a change to its card: the card's updated_at / updated_by follow
-- (stamped by stamp_authoring), so "recently updated" sees translation-only edits from any
-- write path. The card's audit trigger skips the metadata-only update.

create function public.touch_card_for_translation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    update public.cards set updated_at = now() where id = coalesce(new.card_id, old.card_id);
    return null;
end;
$$;

create trigger touch_card after insert or delete on public.card_translations
    for each row execute function public.touch_card_for_translation();
create trigger touch_card_on_change after update on public.card_translations
    for each row
    when ((old.text, old.note, old.status) is distinct from (new.text, new.note, new.status))
    execute function public.touch_card_for_translation();

revoke execute on function public.touch_card_for_translation() from anon, authenticated, public;

-- ---------------------------------------------------------------------------------------------
-- The card list's filter gains `translations`: {locale: state}, where state is a translation
-- status, 'missing' (no translation in that locale) or 'needs-review' (machine or stale: the
-- review queue). Every given locale must match.

create or replace function public.cards_matching(filter jsonb default '{}')
returns setof public.cards
language sql
stable
set search_path = ''
as $$
    select card.*
    from public.cards card
    where (filter ->> 'search' is null
            or exists (
                select 1
                from public.card_translations translation
                where translation.card_id = card.id
                    and translation.text ilike '%' || public.like_literal(filter ->> 'search') || '%'
            ))
        and (filter ->> 'status' is null or card.status = (filter ->> 'status')::public.card_status)
        and (filter ->> 'category_id' is null or card.category_id = (filter ->> 'category_id')::uuid)
        and (filter ->> 'verified' is null
            or (card.verified_at is not null) = (filter ->> 'verified')::boolean)
        and (filter ->> 'has_source' is null
            or (card.source_url is not null) = (filter ->> 'has_source')::boolean)
        and (filter ->> 'era' is null
            or (filter ->> 'era' = 'before-1500' and card.decade < 1500)
            or (filter ->> 'era' = 'from-1500' and card.decade >= 1500))
        and not exists (
            select 1
            from jsonb_each_text(coalesce(filter -> 'translations', '{}'::jsonb)) wanted (locale, state)
            left join public.card_translations translation
                on translation.card_id = card.id
                and translation.locale = wanted.locale::public.card_locale
            where not case wanted.state
                when 'missing' then translation.card_id is null
                when 'needs-review' then coalesce(translation.status in ('machine', 'stale'), false)
                else coalesce(translation.status::text = wanted.state, false)
            end
        );
$$;

comment on function public.cards_matching(jsonb) is
    'Cards matching the card list filter: search (any locale), status, category_id, verified, has_source, era, translations ({locale: status | missing | needs-review}).';
