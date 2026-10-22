-- Fold the People page's stopgap `role_audit` (#45) into the general audit log (#37), so the
-- global audit log shows role changes next to card and category changes. Timestamped after
-- #45's migration, which created `role_audit`.
--
-- Role changes keep their own entities (`user_role` with the user's id, `role_invite` with the
-- email) and actions (invite, change_invite, withdraw_invite, grant, change, revoke,
-- accept_invite). They are still written only through `audit_role_change`, which already
-- takes the actor explicitly.

create or replace function public.audit_role_change(
    actor uuid,
    entity text,
    entity_id text,
    action text,
    before jsonb,
    after jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
    values (actor, entity, entity_id, action, before, after);
$$;

insert into public.audit_log (at, actor_id, entity, entity_id, action, before, after)
select at, actor_id, entity, entity_id, action, before, after
from public.role_audit
order by id;

drop table public.role_audit;
