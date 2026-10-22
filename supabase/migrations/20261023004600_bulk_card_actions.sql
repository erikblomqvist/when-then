-- Bulk publish, archive and move to category (#46). One rpc runs a lifecycle step over many
-- cards: each card goes through the same single-card rpc (publish_card, archive_card,
-- move_card) in its own savepoint, so a refused card is skipped with the reason and the rest
-- still happen. The audit triggers write one row per affected card, naming the actor.

-- Moving one card to another category. Archived categories are not dealt, so nothing moves
-- into one; moving within the same category is refused rather than logged as a no-op.
create function public.move_card(actor uuid, card_id uuid, category_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
    perform public.set_actor(actor);
    if not exists (
        select 1 from public.categories k
        where k.id = move_card.category_id and k.archived_at is null
    ) then
        raise exception 'invalid_category' using detail = 'No such category, or it is archived.';
    end if;
    perform public.lock_card(card_id);
    if exists (
        select 1 from public.cards c
        where c.id = move_card.card_id and c.category_id = move_card.category_id
    ) then
        raise exception 'invalid_transition' using detail = 'Already in that category.';
    end if;
    update public.cards c set category_id = move_card.category_id where c.id = move_card.card_id;
end;
$$;

-- `action` is 'publish', 'archive' or 'move' (which needs `category_id`). Returns one row per
-- given card, in the given order: `done`, or the `reason` it was skipped, with the card's
-- English text for the report. A bad target category fails the whole call (nothing moves).
create function public.bulk_card_action(
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
    if action not in ('publish', 'archive', 'move') then
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
        begin
            case action
                when 'publish' then perform public.publish_card(actor, each_id);
                when 'archive' then perform public.archive_card(actor, each_id);
                when 'move' then perform public.move_card(actor, each_id, bulk_card_action.category_id);
            end case;
            done := true;
        exception when raise_exception then
            get stacked diagnostics failure = message_text, failure_detail = pg_exception_detail;
            done := false;
            reason := coalesce(nullif(failure_detail, ''), failure);
        end;
        select t.text into card_text
        from public.card_translations t
        where t.card_id = each_id and t.locale = 'en';
        return next;
    end loop;
end;
$$;

revoke execute on function
    public.move_card(uuid, uuid, uuid),
    public.bulk_card_action(uuid, text, uuid[], uuid)
from anon, authenticated, public;

grant execute on function
    public.move_card(uuid, uuid, uuid),
    public.bulk_card_action(uuid, text, uuid[], uuid)
to service_role;
