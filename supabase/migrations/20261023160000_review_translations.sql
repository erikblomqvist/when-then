-- Reviewing translations in bulk: the card list's review mode reads a locale's translations
-- next to a reference language and marks the selected cards' translations reviewed, as the
-- editor's "Reviewed" tick does for one card. Only the status changes; the text stays.
--
-- Per card, like `bulk_card_action`: a row saying whether it was done, or why not (no
-- translation in that locale, or reviewed already), with the card's English text. The
-- audit triggers log each translation's change under the actor.

create function public.review_translations(
    actor uuid,
    locale public.card_locale,
    card_ids uuid[]
)
returns table (card_id uuid, done boolean, reason text, card_text text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    each_id uuid;
    was public.translation_status;
begin
    if review_translations.locale = 'en' then
        raise exception 'invalid_locale'
            using detail = 'English is the card''s own text, not a translation.';
    end if;
    perform public.set_actor(actor);

    foreach each_id in array card_ids loop
        card_id := each_id;
        select t.text into card_text
        from public.card_translations t
        where t.card_id = each_id and t.locale = 'en';

        select t.status into was
        from public.card_translations t
        where t.card_id = each_id and t.locale = review_translations.locale
        for update;

        if not found then
            done := false;
            reason := 'There is no translation to review.';
        elsif was = 'reviewed' then
            done := false;
            reason := 'Reviewed already.';
        else
            update public.card_translations t
            set status = 'reviewed'
            where t.card_id = each_id and t.locale = review_translations.locale;
            done := true;
            reason := null;
        end if;
        return next;
    end loop;
end;
$$;

comment on function public.review_translations(uuid, public.card_locale, uuid[]) is
    'Marks the cards'' translation in one locale (sv, nb) reviewed; per card: done, or why not (none, reviewed already). Audited under the actor.';

revoke execute on function public.review_translations(uuid, public.card_locale, uuid[]) from anon, authenticated, public;
grant execute on function public.review_translations(uuid, public.card_locale, uuid[]) to service_role;
