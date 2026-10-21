-- Let the server's service client (secret key) read and write admin roles: the People page
-- manages them, and e2e tests give their test users a role. New tables are not exposed to
-- the Data API roles without explicit grants, and `service_role` had none on this table.
-- The browser still has no access (RLS on, no policies for anon/authenticated).

grant select, insert, update, delete on table public.user_roles to service_role;
