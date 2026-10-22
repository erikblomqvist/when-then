-- Importing cards from CSV (#48). The app reads and checks the file (`#lib/cards/card-import.ts`)
-- and passes the valid rows here in one call, so an import creates all its cards or none.
-- Import only creates: it never updates existing cards (round-trip import is later).
--
-- Each card is a Draft in its category, with its English text and any sv/nb text stored as
-- reviewed translations (a person wrote them: #40's rule for hand-written text). The audit
-- triggers log the card and translation creates as usual; this function adds one 'import'
-- entry per card naming the file and row it came from, so the card's history and the audit
-- log say where it came from.

create function public.import_cards(actor uuid, cards jsonb, file_name text default null)
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
    entry record;
    card jsonb;
    saved_id uuid;
    translation record;
    created uuid[] := '{}';
begin
    if actor is null then
        raise exception 'import_cards needs an actor';
    end if;
    if not exists (
        select 1 from public.user_roles r where r.user_id = actor and r.role = 'admin'
    ) then
        raise exception 'not_admin' using detail = 'Only admins import cards.';
    end if;
    perform public.set_actor(actor);

    for entry in select value, ordinality from jsonb_array_elements(cards) with ordinality loop
        card := entry.value;

        if not exists (
            select 1 from public.categories c
            where c.id = (card ->> 'category_id')::uuid and c.archived_at is null
        ) then
            raise exception 'invalid_category'
                using detail = format('Row %s: the category is archived or gone.', card ->> 'row');
        end if;

        insert into public.cards (
            category_id, decade, year, month, day, source_url, source_quote, tags
        )
        values (
            (card ->> 'category_id')::uuid,
            (card ->> 'decade')::integer,
            (card ->> 'year')::integer,
            (card ->> 'month')::smallint,
            (card ->> 'day')::smallint,
            card ->> 'source_url',
            card ->> 'source_quote',
            array(select jsonb_array_elements_text(coalesce(card -> 'tags', '[]'::jsonb)))
        )
        returning id into saved_id;

        for translation in
            select key, value from jsonb_each_text(card -> 'translations')
        loop
            insert into public.card_translations (card_id, locale, text, status)
            values (saved_id, translation.key::public.card_locale, translation.value, 'reviewed');
        end loop;

        insert into public.audit_log (actor_id, entity, entity_id, action, details)
        values (
            actor,
            'card',
            saved_id::text,
            'import',
            jsonb_build_object('file', file_name, 'row', (card ->> 'row')::integer)
        );

        created := created || saved_id;
    end loop;

    return created;
end;
$$;

comment on function public.import_cards(uuid, jsonb, text) is
    'Creates draft cards from checked CSV rows ({row, category_id, decade, year, month, day, source_url, source_quote, tags, translations {en, sv?, nb?}}), all or none; admin only; logs an import per card.';

revoke execute on function public.import_cards(uuid, jsonb, text) from anon, authenticated, public;
grant execute on function public.import_cards(uuid, jsonb, text) to service_role;
