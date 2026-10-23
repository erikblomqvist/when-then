-- A card can be country-specific: knowing it takes knowledge of one country deep enough that
-- you almost had to grow up there ('SE', say: not everything about Sweden, only what a Swede
-- knows and others don't). Any ISO 3166-1 alpha-2 code; the admin offers Sweden and Norway.
-- Null: not country-specific. "Add from photo" has the AI guess it for each card it reads.
--
-- save_card saves `card.country_specific` when the card carries the key, null clearing it; a
-- caller that leaves it out keeps what the card has (as for difficulty). import_photo_cards
-- takes it per card. The card list filters by it: `country` is a code, or 'none'.

alter table public.cards
    add column country_specific text
    check (country_specific ~ '^[A-Z]{2}$');

comment on column public.cards.country_specific is
    'The country whose deep local knowledge the card takes (ISO 3166-1 alpha-2, e.g. SE), or null.';

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
            category_id, decade, year, month, day, source_url, source_quote, difficulty,
            country_specific
        )
        values (
            (card ->> 'category_id')::uuid,
            (card ->> 'decade')::integer,
            (card ->> 'year')::integer,
            (card ->> 'month')::smallint,
            (card ->> 'day')::smallint,
            card ->> 'source_url',
            card ->> 'source_quote',
            (card ->> 'difficulty')::smallint,
            card ->> 'country_specific'
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
            country_specific = case
                when card ? 'country_specific' then card ->> 'country_specific'
                else c.country_specific
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

create or replace function public.import_photo_cards(actor uuid, cards jsonb, request_id bigint default null)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
    card jsonb;
    saved_id uuid;
    translation record;
    created uuid[] := '{}';
begin
    if actor is null then
        raise exception 'import_photo_cards needs an actor';
    end if;
    perform public.require_admin(actor, 'Only admins import cards.');
    perform public.set_actor(actor);

    for card in select value from jsonb_array_elements(cards) loop
        if not exists (
            select 1 from public.categories c
            where c.id = (card ->> 'category_id')::uuid and c.archived_at is null
        ) then
            raise exception 'invalid_category'
                using detail = 'A category is archived or gone.';
        end if;

        insert into public.cards (
            category_id, decade, year, month, day, source_url, source_quote, difficulty,
            country_specific
        )
        values (
            (card ->> 'category_id')::uuid,
            (card ->> 'decade')::integer,
            (card ->> 'year')::integer,
            (card ->> 'month')::smallint,
            (card ->> 'day')::smallint,
            card ->> 'source_url',
            card ->> 'source_quote',
            (card ->> 'difficulty')::smallint,
            card ->> 'country_specific'
        )
        returning id into saved_id;

        for translation in
            select key, value from jsonb_each(card -> 'translations')
        loop
            insert into public.card_translations (card_id, locale, text, status)
            values (
                saved_id,
                translation.key::public.card_locale,
                translation.value ->> 'text',
                coalesce(translation.value ->> 'status', 'reviewed')::public.translation_status
            );
        end loop;

        perform public.record_audit(
            actor,
            'card',
            saved_id::text,
            'import_photo',
            details => jsonb_build_object(
                'request',
                coalesce((card ->> 'request_id')::bigint, request_id)
            )
        );

        created := created || saved_id;
    end loop;

    return created;
end;
$$;

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
        and (filter ->> 'archived' is null
            or (card.status = 'archived') = (filter ->> 'archived')::boolean)
        and (filter ->> 'category_id' is null or card.category_id = (filter ->> 'category_id')::uuid)
        and (filter ->> 'verified' is null
            or (card.verified_at is not null) = (filter ->> 'verified')::boolean)
        and (filter ->> 'has_source' is null
            or (card.source_url is not null) = (filter ->> 'has_source')::boolean)
        and (filter ->> 'era' is null
            or (filter ->> 'era' = 'before-1500' and card.decade < 1500)
            or (filter ->> 'era' = 'from-1500' and card.decade >= 1500))
        and (filter ->> 'country' is null
            or (filter ->> 'country' = 'none' and card.country_specific is null)
            or card.country_specific = filter ->> 'country')
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
    'Cards matching the card list filter: search (any locale), status, archived, category_id, verified, has_source, era, country (a code or none), translations ({locale: status | missing | needs-review}).';

-- ---------------------------------------------------------------------------------------------
-- The host's say: the lobby keeps the countries whose country-specific cards the game leaves
-- out (empty: every card goes in). Building the deck at Start reads it from here. Settings
-- take it alongside the others; the old signature goes.

alter table public.games
    add column left_out_countries text[] not null default '{}'
    check (array_to_string(left_out_countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$');

comment on column public.games.left_out_countries is
    'Countries (ISO 3166-1 alpha-2) whose country-specific cards the game leaves out; empty: none.';

drop function public.update_settings(uuid, text, integer, boolean, public.card_locale);

-- Update settings: the host `host` gives the game with `code` these settings, and gets the game
-- and its new version. Refuses with `not_found`, `game_started`, `not_host` or
-- `invalid_target_score` (outside 3–30, `src/lib/game/settings.ts`).
create function public.update_settings(
    host uuid,
    code text,
    target_score integer,
    exact_year boolean,
    card_language public.card_locale,
    left_out_countries text[] default '{}'
)
returns table (updated_game uuid, game_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games := public.lock_lobby(code);
begin
    if not exists (
        select from public.game_players p
        where p.game_id = game.id and p.user_id = host and p.is_host
    ) then
        raise exception 'not_host' using detail = 'Only the host can do that.';
    end if;
    -- The column's check holds these limits too; this one names the refusal for the phone.
    if update_settings.target_score is null or update_settings.target_score not between 3 and 30
    then
        raise exception 'invalid_target_score' using detail = 'The target score is 3 to 30.';
    end if;

    return query
        update public.games g
        set target_score = update_settings.target_score,
            exact_year = update_settings.exact_year,
            card_language = update_settings.card_language,
            left_out_countries = coalesce(update_settings.left_out_countries, '{}'),
            version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.update_settings(uuid, text, integer, boolean, public.card_locale, text[])
    from public, anon, authenticated;
grant execute on function public.update_settings(uuid, text, integer, boolean, public.card_locale, text[])
    to service_role;
