-- The audit log is append-only: the server reads it and adds rows through record_audit only.
-- 20261023003700 granted service_role select but never revoked the rest, so where new tables
-- give service_role everything by default (the CLI's native runtime, and likely hosted
-- projects), it could still insert, update and delete rows directly.

revoke all on table public.audit_log from service_role;
grant select on table public.audit_log to service_role;
