-- Bulk delete: a draft that didn't turn out good is deleted from the card list too, not only
-- from its editor. Each card goes through `delete_draft` like the other bulk steps, so only
-- admins delete, only never-published drafts go (anything else is skipped with the reason),
-- and the audit trigger logs each deletion. The card's English text is read before the step
-- now, since a deleted card has none left to report.

create or replace function public.bulk_card_action(
    actor uuid,
    action text,
    card_ids uuid[],
    category_id uuid default null
)
returns table (card_id uuid, done boolean, reason text, card_text text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
    each_id uuid;
    failure text;
    failure_detail text;
begin
    if action not in ('publish', 'archive', 'move', 'delete') then
        raise exception 'Unknown bulk action %', action;
    end if;
    if action = 'move' and not exists (
        select 1 from public.categories k
        where k.id = bulk_card_action.category_id and k.archived_at is null
    ) then
        raise exception 'invalid_category' using detail = 'No such category, or it is archived.';
    end if;

    foreach each_id in array card_ids loop
        card_id := each_id;
        reason := null;
        card_text := null;
        select t.text into card_text
        from public.card_translations t
        where t.card_id = each_id and t.locale = 'en';
        begin
            case action
                when 'publish' then perform public.publish_card(actor, each_id);
                when 'archive' then perform public.archive_card(actor, each_id);
                when 'move' then perform public.move_card(actor, each_id, bulk_card_action.category_id);
                when 'delete' then perform public.delete_draft(actor, each_id);
            end case;
            done := true;
        exception when raise_exception then
            get stacked diagnostics failure = message_text, failure_detail = pg_exception_detail;
            done := false;
            reason := coalesce(nullif(failure_detail, ''), failure);
        end;
        return next;
    end loop;
end;
$$;
