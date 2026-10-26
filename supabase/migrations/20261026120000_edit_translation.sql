-- Editing one translation in place: the card list's review mode lets a person correct a
-- locale's text right in the row. Editing counts as review (as in the editor), so the
-- translation is saved reviewed; a missing one is added, reviewed. The note stays.
--
-- `was` is the text the person started from (null: there was none). When the translation has
-- changed since, the edit is refused (`changed`), so it can't overwrite someone else's save.
-- Refuses English (`invalid_locale`), an empty text (`empty_text`) and an unknown card
-- (`not_found`). The audit triggers log the change under the actor.

create function public.edit_translation(
    actor uuid,
    card_id uuid,
    locale public.card_locale,
    text text,
    was text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    current_text text;
begin
    if edit_translation.locale = 'en' then
        raise exception 'invalid_locale'
            using detail = 'English is the card''s own text, not a translation.';
    end if;
    if length(btrim(coalesce(edit_translation.text, ''))) = 0 then
        raise exception 'empty_text' using detail = 'Write the translation, or leave it as it was.';
    end if;
    perform public.set_actor(actor);

    perform from public.cards c where c.id = edit_translation.card_id for update;
    if not found then
        raise exception 'not_found' using detail = 'The card no longer exists.';
    end if;

    select t.text into current_text
    from public.card_translations t
    where t.card_id = edit_translation.card_id and t.locale = edit_translation.locale;
    if current_text is distinct from was then
        raise exception 'changed'
            using detail = 'Someone changed this translation since the list loaded. Reload to see it.';
    end if;

    insert into public.card_translations as t (card_id, locale, text, status)
    values (edit_translation.card_id, edit_translation.locale, btrim(edit_translation.text), 'reviewed')
    on conflict on constraint card_translations_pkey do update
    set text = excluded.text,
        status = excluded.status;
end;
$$;

comment on function public.edit_translation(uuid, uuid, public.card_locale, text, text) is
    'Saves one translation''s text (sv, nb) as reviewed, refusing when it changed since `was`. Audited under the actor.';

revoke execute on function public.edit_translation(uuid, uuid, public.card_locale, text, text) from anon, authenticated, public;
grant execute on function public.edit_translation(uuid, uuid, public.card_locale, text, text) to service_role;
