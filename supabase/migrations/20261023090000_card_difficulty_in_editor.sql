-- The card editor edits a card's difficulty (1, most people know it, to 4, obscure; until now
-- only "Add from photo" set it). save_card saves `card.difficulty` when the card carries the
-- key, null clearing it; a caller that leaves the key out (an import) keeps what the card has.
-- Otherwise as in 20261023004000_card_translation_review.sql.

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
            category_id, decade, year, month, day, source_url, source_quote, difficulty
        )
        values (
            (card ->> 'category_id')::uuid,
            (card ->> 'decade')::integer,
            (card ->> 'year')::integer,
            (card ->> 'month')::smallint,
            (card ->> 'day')::smallint,
            card ->> 'source_url',
            card ->> 'source_quote',
            (card ->> 'difficulty')::smallint
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
            difficulty = case
                when card ? 'difficulty' then (card ->> 'difficulty')::smallint
                else c.difficulty
            end,
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
