-- Drafts can be archived too: a draft nobody will finish is put away without being deleted.
-- The card remembers what it was when archived (`archived_from`), and unarchiving takes it
-- back there: a draft returns to draft (no publish rule to pass, as it isn't dealt), a
-- published card to published (passing the publish rule again, as before). Cards archived
-- before this were all published.

alter table public.cards add column archived_from public.card_status;

comment on column public.cards.archived_from is
    'What an archived card was before (draft or published), where unarchiving returns it; null unless archived.';

update public.cards set archived_from = 'published' where status = 'archived';

create or replace function public.archive_card(actor uuid, card_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    was public.card_status;
begin
    perform public.set_actor(actor);
    was := public.lock_card(card_id);
    if was = 'archived' then
        raise exception 'invalid_transition' using detail = 'The card is archived already.';
    end if;
    update public.cards c
    set status = 'archived', archived_from = was, archived_at = now(), archived_by = actor
    where c.id = archive_card.card_id;
end;
$$;

-- Back to what it was. A card going back to published is dealt again, so it must pass the
-- publish rule again; a draft needn't.
create or replace function public.unarchive_card(actor uuid, card_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
    back public.card_status;
begin
    perform public.set_actor(actor);
    if public.lock_card(card_id) <> 'archived' then
        raise exception 'invalid_transition' using detail = 'Only an archived card can be unarchived.';
    end if;
    select coalesce(c.archived_from, 'published') into back
    from public.cards c where c.id = unarchive_card.card_id;
    if back = 'published' then
        perform public.require_publishable(card_id);
    end if;
    update public.cards c
    set status = back, archived_from = null, archived_at = null, archived_by = null
    where c.id = unarchive_card.card_id;
end;
$$;
