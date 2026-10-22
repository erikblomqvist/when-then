-- AI translation (#41): bulk machine translation adds the missing locales of a card, as
-- machine translations, without touching anything a person wrote meanwhile.
--
-- `add_machine_translations(actor, card_id, english, translations)`:
-- - `english` is the English text the translations were made from. If the card's English text
--   is different now (someone edited it while the model was working), nothing is written and
--   the result says so.
-- - `translations` is `{"sv": "text", "nb": "text"}`. Each is inserted with status 'machine'
--   only if the card has no text in that locale yet; an existing translation always wins.
-- - Returns `{"added": ["sv", …], "english_changed": false}`.
-- Audited by the existing triggers (a card_translation create per locale, as `actor`).

create function public.add_machine_translations(
    actor uuid,
    card_id uuid,
    english text,
    translations jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
    current_english text;
    entry record;
    added_locale public.card_locale;
    added public.card_locale[] := '{}';
begin
    if actor is null then
        raise exception 'add_machine_translations needs an actor';
    end if;
    perform public.set_actor(actor);

    perform 1 from public.cards c where c.id = add_machine_translations.card_id for update;
    if not found then
        raise exception 'No card %', card_id using errcode = 'P0002';
    end if;

    select t.text into current_english
    from public.card_translations t
    where t.card_id = add_machine_translations.card_id and t.locale = 'en';
    if current_english is distinct from english then
        return jsonb_build_object('added', '[]'::jsonb, 'english_changed', true);
    end if;

    for entry in select key, value from jsonb_each_text(coalesce(translations, '{}'::jsonb)) loop
        if entry.key = 'en' then
            raise exception 'A machine translation can''t replace the English text';
        end if;
        if coalesce(btrim(entry.value), '') = '' then
            continue;
        end if;
        insert into public.card_translations (card_id, locale, text, status)
        values (add_machine_translations.card_id, entry.key::public.card_locale, btrim(entry.value), 'machine')
        on conflict on constraint card_translations_pkey do nothing
        returning locale into added_locale;
        if added_locale is not null then
            added := added || added_locale;
            added_locale := null;
        end if;
    end loop;

    return jsonb_build_object('added', to_jsonb(added), 'english_changed', false);
end;
$$;

revoke execute on function public.add_machine_translations(uuid, uuid, text, jsonb)
from anon, authenticated, public;

grant execute on function public.add_machine_translations(uuid, uuid, text, jsonb)
to service_role;
