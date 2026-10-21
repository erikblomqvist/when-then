-- People and roles (#45): invites, role changes, the last-admin rule and the audit trail.
-- Run with `vpr test:db` against the local stack. Everything runs in one transaction and is
-- rolled back, so the test may clear `user_roles` to know exactly who is an admin.

begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

delete from public.role_invites;
delete from public.user_roles;

-- Synthetic people. Google users carry `google` in their app metadata, as GoTrue sets it.
insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-00000000000a', 'ada@example.com', '{"provider":"google","providers":["google"]}'),
    ('00000000-0000-0000-0000-00000000000b', 'bo@example.com', '{"provider":"google","providers":["google"]}');
insert into public.user_roles (user_id, role) values
    ('00000000-0000-0000-0000-00000000000a', 'admin');

-- Inviting an email nobody has signed in with yet leaves a pending invite.
select is(
    public.invite_person('00000000-0000-0000-0000-00000000000a', '  Cy@Example.com ', 'editor'),
    'invited',
    'an unknown email becomes a pending invite'
);
select results_eq(
    $$ select email, role::text from public.role_invites $$,
    $$ values ('cy@example.com', 'editor') $$,
    'the invite is stored with a trimmed, lower-case email'
);

-- Signing up with that email by password does not pick up the invite: only Google does.
insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-0000000000c0', 'cy@example.com', '{"provider":"email","providers":["email"]}');
select is_empty(
    $$ select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-0000000000c0' $$,
    'an email/password sign-up does not get the invited role'
);
delete from auth.users where id = '00000000-0000-0000-0000-0000000000c0';

-- The first Google sign-in with that email attaches the role and uses up the invite.
insert into auth.users (id, email, raw_app_meta_data) values
    ('00000000-0000-0000-0000-00000000000c', 'CY@example.com', '{"provider":"google","providers":["google"]}');
select results_eq(
    $$ select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000c' $$,
    $$ values ('editor') $$,
    'the first Google sign-in attaches the invited role'
);
select is_empty($$ select 1 from public.role_invites $$, 'the invite is used up');

-- Inviting someone who has already signed in with Google grants the role at once.
select is(
    public.invite_person('00000000-0000-0000-0000-00000000000a', 'bo@example.com', 'editor'),
    'granted',
    'an email that already signed in with Google gets the role straight away'
);
select results_eq(
    $$ select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000b' $$,
    $$ values ('editor') $$,
    'the role is granted'
);

-- Pending invites can be changed and withdrawn.
select public.invite_person('00000000-0000-0000-0000-00000000000a', 'dee@example.com', 'editor');
select public.set_invite_role('00000000-0000-0000-0000-00000000000a', 'dee@example.com', 'admin');
select results_eq(
    $$ select role::text from public.role_invites where email = 'dee@example.com' $$,
    $$ values ('admin') $$,
    'an invite''s role can be changed'
);
select public.set_invite_role('00000000-0000-0000-0000-00000000000a', 'dee@example.com', null);
select is_empty($$ select 1 from public.role_invites $$, 'an invite can be withdrawn');

-- The only admin can't demote or remove themselves.
select throws_ok(
    $$ select public.set_person_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'editor') $$,
    'P0001',
    'last_admin',
    'the last admin cannot demote themselves'
);
select throws_ok(
    $$ select public.set_person_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', null) $$,
    'P0001',
    'last_admin',
    'the last admin cannot remove themselves'
);

-- With a second admin, they can.
select public.set_person_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 'admin');
select results_eq(
    $$ select role::text from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000b' $$,
    $$ values ('admin') $$,
    'an admin can promote an editor'
);
select lives_ok(
    $$ select public.set_person_role('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'editor') $$,
    'with another admin around, an admin can step down to editor'
);

-- Only admins manage people.
select throws_ok(
    $$ select public.set_person_role('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 'editor') $$,
    'P0001',
    'not_admin',
    'an editor cannot change roles'
);
select throws_ok(
    $$ select public.invite_person('00000000-0000-0000-0000-00000000000c', 'eve@example.com', 'admin') $$,
    'P0001',
    'not_admin',
    'an editor cannot invite'
);

-- Revoking removes the role.
select public.set_person_role('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c', null);
select is_empty(
    $$ select 1 from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000c' $$,
    'an admin can revoke a role'
);

-- Everything above is in the audit trail, with who did it and the before and after.
select results_eq(
    $$ select action, entity, entity_id from public.audit_log
       where entity in ('user_role', 'role_invite') order by id $$,
    $$ values
        ('invite', 'role_invite', 'cy@example.com'),
        ('accept_invite', 'user_role', '00000000-0000-0000-0000-00000000000c'),
        ('grant', 'user_role', '00000000-0000-0000-0000-00000000000b'),
        ('invite', 'role_invite', 'dee@example.com'),
        ('change_invite', 'role_invite', 'dee@example.com'),
        ('withdraw_invite', 'role_invite', 'dee@example.com'),
        ('change', 'user_role', '00000000-0000-0000-0000-00000000000b'),
        ('change', 'user_role', '00000000-0000-0000-0000-00000000000a'),
        ('revoke', 'user_role', '00000000-0000-0000-0000-00000000000c') $$,
    'every role change is audited'
);
select results_eq(
    $$ select actor_id, before ->> 'role', after ->> 'role' from public.audit_log
       where action = 'change' and entity_id = '00000000-0000-0000-0000-00000000000b' $$,
    $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'editor', 'admin') $$,
    'a change records the actor and the role before and after'
);
select results_eq(
    $$ select actor_id, after from public.audit_log where action = 'revoke' $$,
    $$ values ('00000000-0000-0000-0000-00000000000b'::uuid, null::jsonb) $$,
    'a revoke has no after'
);
select results_eq(
    $$ select actor_id from public.audit_log where action = 'accept_invite' $$,
    $$ values ('00000000-0000-0000-0000-00000000000c'::uuid) $$,
    'accepting an invite is done by the person signing in'
);

-- The People page lists people with their emails.
select results_eq(
    $$ select email, role::text from public.list_people() order by email $$,
    $$ values ('ada@example.com', 'editor'), ('bo@example.com', 'admin') $$,
    'list_people returns each person with a role and their email'
);

select * from finish();
rollback;
