-- Reading the audit log (issue #43): the card history panel and the admin-only global log.
-- The log itself is #37's `audit_log`; these functions give the pages what a plain select on
-- it can't: people's emails (they live in auth.users) and the choices for the log's filters.
-- Service role only, like every other admin read; the routes check the role first.

-- Everyone who appears as an actor in the log, with their email, for names and the filter.
create function public.audit_actors()
returns table (id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
    select u.id, u.email::text
    from auth.users u
    where exists (select 1 from public.audit_log a where a.actor_id = u.id)
    order by u.email;
$$;

-- The entities and actions present in the log, for the filters. New kinds of entries (AI
-- calls, imports, bulk actions) show up here as soon as they are written.
create function public.audit_kinds()
returns table (entity text, action text)
language sql
stable
security definer
set search_path = ''
as $$
    select distinct a.entity, a.action
    from public.audit_log a
    order by a.entity, a.action;
$$;

revoke execute on function public.audit_actors() from public, anon, authenticated;
revoke execute on function public.audit_kinds() from public, anon, authenticated;
grant execute on function public.audit_actors() to service_role;
grant execute on function public.audit_kinds() to service_role;

create index audit_log_entity_action_idx on public.audit_log (entity, action, id desc);
