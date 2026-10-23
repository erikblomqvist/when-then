-- "Add from photo" reads several photos at once and can look a card's date up on the web
-- (`src/routes/(admin)/admin/(shell)/cards/photo`), so the cards saved together no longer come
-- from one AI request, and a card may carry the source its date was found in.
--
-- Each card may now name its own `request_id` (the AI request it was read in, for its
-- 'import_photo' entry) and a `source_url`. The function's `request_id` argument stays as the
-- fallback for a card that names none.

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

comment on function public.import_photo_cards(uuid, jsonb, bigint) is
    'Creates draft cards read from photos ({category_id, decade, year, month, day, source_url?, source_quote, difficulty, request_id?, translations {en: {text, status}, sv?, nb?}}), all or none; admin only; logs an import_photo per card, naming its own request_id or else the argument.';
