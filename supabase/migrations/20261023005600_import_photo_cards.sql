-- Adding cards from a photo (#60). The app has Claude read the photo into candidate cards
-- (`#lib/server/ai-read-photo.ts`), the admin ticks and edits them, and the checked cards are
-- created here in one call, all or none, like a CSV import (`public.import_cards`).
--
-- The differences from a CSV import: the date may be missing (a draft without a date can't be
-- published until it gets one), a card may have a difficulty, and each translation carries its
-- status: the text in the photo's language is reviewed, the AI's translations are machine. The
-- 'import_photo' entry per card names the AI request (its audit row) the card was read in.

create function public.import_photo_cards(actor uuid, cards jsonb, request_id bigint default null)
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
            category_id, decade, year, month, day, source_quote, difficulty
        )
        values (
            (card ->> 'category_id')::uuid,
            (card ->> 'decade')::integer,
            (card ->> 'year')::integer,
            (card ->> 'month')::smallint,
            (card ->> 'day')::smallint,
            card ->> 'source_quote',
            (card ->> 'difficulty')::smallint
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
            details => jsonb_build_object('request', request_id)
        );

        created := created || saved_id;
    end loop;

    return created;
end;
$$;

comment on function public.import_photo_cards(uuid, jsonb, bigint) is
    'Creates draft cards read from a photo ({category_id, decade, year, month, day, source_quote, difficulty, translations {en: {text, status}, sv?, nb?}}), all or none; admin only; logs an import_photo per card.';

revoke execute on function public.import_photo_cards(uuid, jsonb, bigint) from anon, authenticated, public;
grant execute on function public.import_photo_cards(uuid, jsonb, bigint) to service_role;
