-- Suspected duplicates: cards whose English text is the same once case, punctuation and spacing
-- are set aside ("The atomic bomb is dropped on Hiroshima" twice). Archived cards don't count:
-- archiving one of a pair is how a duplicate is retired.
--
-- `card_text_key` is that comparison, in one place, with an index on the English texts.
-- `cards_with_text` finds the cards sharing a text with each of the given ones, for the
-- editor, the CSV import preview and "Add from photo" to warn before a card is created again.
-- The card list's filter gains `duplicates`: cards that share their text with another. And
-- `cards_near_years` picks the cards "Add from photo" asks the AI about, closest in date first.

create function public.card_text_key(text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
    select btrim(regexp_replace(lower(text), '[[:punct:][:space:]“”‘’«»„–—…]+', ' ', 'g'));
$$;

comment on function public.card_text_key(text) is
    'A card text for comparing: lower case, punctuation and runs of spacing as one space.';

create index card_translations_english_key_idx
    on public.card_translations (public.card_text_key(text))
    where locale = 'en';

-- ---------------------------------------------------------------------------------------------

create function public.cards_with_text(texts text[], except_card uuid default null)
returns table (text_index integer, card_id uuid, card_text text)
language sql
stable
set search_path = ''
as $$
    select given.ordinality::integer - 1, translation.card_id, translation.text
    from unnest(texts) with ordinality as given (text, ordinality)
    join public.card_translations translation
        on translation.locale = 'en'
        and public.card_text_key(translation.text) = public.card_text_key(given.text)
    join public.cards card on card.id = translation.card_id
    where card.status <> 'archived'
        and card.id is distinct from except_card
        and public.card_text_key(given.text) <> ''
    order by given.ordinality, card.created_at;
$$;

comment on function public.cards_with_text(text[], uuid) is
    'Per given English text (its 0-based index): the cards, not archived, with the same text by card_text_key, except except_card.';

revoke execute on function public.cards_with_text(text[], uuid) from anon, authenticated, public;
grant execute on function public.cards_with_text(text[], uuid) to service_role;

-- ---------------------------------------------------------------------------------------------

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
        )
        and (filter ->> 'duplicates' is null
            or exists (
                select 1
                from public.card_translations mine
                join public.card_translations other
                    on other.locale = 'en'
                    and public.card_text_key(other.text) = public.card_text_key(mine.text)
                    and other.card_id <> mine.card_id
                join public.cards other_card
                    on other_card.id = other.card_id
                    and other_card.status <> 'archived'
                where mine.card_id = card.id and mine.locale = 'en'
            ) = (filter ->> 'duplicates')::boolean);
$$;

comment on function public.cards_matching(jsonb) is
    'Cards matching the card list filter: search (any locale), status, archived, category_id, verified, has_source, era, country (a code or none), translations ({locale: status | missing | needs-review}), duplicates (shares its English text with another card, not archived).';

-- ---------------------------------------------------------------------------------------------
-- The cards "Add from photo" sends to its AI duplicate check: per candidate year, the cards
-- (not archived) dated within two years of it, or undated but in its decade, closest first and
-- at most `per_year` of them, so a busy year can't crowd out the card that matters.

create function public.cards_near_years(years integer[], per_year integer)
returns table (card_id uuid, year integer, decade integer, card_text text)
language sql
stable
set search_path = ''
as $$
    select distinct on (near.id) near.id, near.year, near.decade, translation.text
    from unnest(years) as wanted (year)
    cross join lateral (
        select card.id, card.year, card.decade
        from public.cards card
        where card.status <> 'archived'
            and (card.year between wanted.year - 2 and wanted.year + 2
                or (card.year is null and card.decade between wanted.year - 10 and wanted.year))
        order by abs(coalesce(card.year, card.decade + 5) - wanted.year), card.id
        limit per_year
    ) near
    join public.card_translations translation
        on translation.card_id = near.id and translation.locale = 'en'
    order by near.id;
$$;

comment on function public.cards_near_years(integer[], integer) is
    'Per year: the cards (not archived) within two years of it, or undated in its decade, closest first, at most per_year; each card once.';

revoke execute on function public.cards_near_years(integer[], integer) from anon, authenticated, public;
grant execute on function public.cards_near_years(integer[], integer) to service_role;
