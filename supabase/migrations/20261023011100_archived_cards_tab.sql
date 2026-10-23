-- The card list keeps archived cards in a tab of their own: the filter gains `archived`,
-- true for archived cards only, false for drafts and published cards. The app always sends it
-- (`filterArgs` in `#lib/server/cards.ts`); absent, every card matches.

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
    'Cards matching the card list filter: search (any locale), status, archived, category_id, verified, has_source, era, translations ({locale: status | missing | needs-review}).';
