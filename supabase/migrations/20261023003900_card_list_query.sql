-- The card list's query (#39): which cards match a filter.
--
-- `cards_matching(filter)` returns whole `cards` rows, so the Data API can embed, order, count
-- and page its result like a table (`db.rpc('cards_matching', …).select(…).order(…).range(…)`).
-- The same function serves every "cards matching this view" need: the list page, select all
-- matching (bulk actions) and export. The app builds `filter` in `#lib/server/cards.ts`
-- (`filterArgs`) from the typed filter in `#lib/cards/card-list.ts`; add a filter there and
-- here together. Absent keys don't narrow.
--
-- Dates: a dated card always has a decade (stored by its earliest year, and the decade of its
-- year when it has one), so the decade alone says before or after 1500, and ordering by
-- decade, year, month, day (less precise first) is chronological, BC included. Note that the
-- Data API cannot order an rpc result by a computed field ("cannot cast type record").

-- `text` as a literal ILIKE pattern: %, _ and \ match only themselves.
create function public.like_literal(text text)
returns text
language sql
immutable
set search_path = ''
as $$
    select replace(replace(replace(text, '\', '\\'), '%', '\%'), '_', '\_');
$$;

create function public.cards_matching(filter jsonb default '{}')
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
            or (filter ->> 'era' = 'from-1500' and card.decade >= 1500));
$$;

comment on function public.cards_matching(jsonb) is
    'Cards matching the card list filter: search (any locale), status, category_id, verified, has_source, era.';

-- Search scans translations by card; the primary key (card_id, locale) already indexes that.
-- A trigram index on card_translations.text is the next step if the table grows large.
create index cards_date_idx on public.cards (decade, year, month, day, id);

revoke execute on function
    public.like_literal(text),
    public.cards_matching(jsonb)
from anon, authenticated, public;

grant execute on function
    public.like_literal(text),
    public.cards_matching(jsonb)
to service_role;
