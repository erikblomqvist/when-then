-- The one admin check and the one way the app writes its own audit rows. Run with
-- `vpr test:db` against the local stack, in one transaction that is rolled back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- Synthetic people: an admin and an editor.
insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-0000000000a1', 'admin-check@example.com'),
    ('00000000-0000-0000-0000-0000000000e1', 'editor-check@example.com');
insert into public.user_roles (user_id, role) values
    ('00000000-0000-0000-0000-0000000000a1', 'admin'),
    ('00000000-0000-0000-0000-0000000000e1', 'editor');

-- require_admin(actor, reason) ----------------------------------------------------------

select lives_ok(
    $$ select public.require_admin('00000000-0000-0000-0000-0000000000a1', 'Only admins test.') $$,
    'an admin passes the check'
);
select throws_ok(
    $$ select public.require_admin('00000000-0000-0000-0000-0000000000e1', 'Only admins test.') $$,
    'P0001',
    'not_admin',
    'an editor is refused'
);
select throws_ok(
    $$ select public.require_admin(null, 'Only admins test.') $$,
    'P0001',
    'not_admin',
    'no actor is refused'
);

-- The refusal carries the reason as its detail, for the page to show.
create function pg_temp.refusal_detail(actor uuid) returns text language plpgsql as $$
declare
    detail text;
begin
    perform public.require_admin(actor, 'Only admins test.');
    return null;
exception when others then
    get stacked diagnostics detail = pg_exception_detail;
    return detail;
end;
$$;
select is(
    pg_temp.refusal_detail('00000000-0000-0000-0000-0000000000e1'),
    'Only admins test.',
    'the refusal names the reason'
);

-- Every admin-only function uses it.
select throws_ok(
    $$ select public.delete_draft('00000000-0000-0000-0000-0000000000e1', gen_random_uuid()) $$,
    'P0001',
    'not_admin',
    'delete_draft is admin only'
);
select throws_ok(
    $$ select public.import_cards('00000000-0000-0000-0000-0000000000e1', '[]'::jsonb) $$,
    'P0001',
    'not_admin',
    'import_cards is admin only'
);
select throws_ok(
    $$ select public.delete_category('00000000-0000-0000-0000-0000000000e1', gen_random_uuid()) $$,
    'P0001',
    'not_admin',
    'category management is admin only'
);
select throws_ok(
    $$ select public.set_person_role('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e1', null) $$,
    'P0001',
    'not_admin',
    'people management is admin only'
);
select hasnt_function('public', 'require_category_admin', 'no second admin check');

-- record_audit: app-written audit rows ---------------------------------------------------

select ok(
    public.record_audit(
        '00000000-0000-0000-0000-0000000000e1',
        'card',
        'c0ffee00-0000-0000-0000-000000000000',
        'ai_translate',
        locale => 'sv',
        details => '{"model": "m"}'::jsonb
    ) > 0,
    'record_audit returns the new row''s id'
);
select results_eq(
    $$ select actor_id, entity, action, locale::text, details ->> 'model' from public.audit_log
       where entity_id = 'c0ffee00-0000-0000-0000-000000000000' $$,
    $$ values ('00000000-0000-0000-0000-0000000000e1'::uuid, 'card', 'ai_translate', 'sv', 'm') $$,
    'the row names the actor given'
);
select throws_ok(
    $$ select public.record_audit(null, 'card', 'x', 'ai_translate') $$,
    'P0001',
    'record_audit needs an actor',
    'an app-written row needs an actor'
);
select ok(
    not has_table_privilege('service_role', 'public.audit_log', 'insert'),
    'the server cannot insert audit rows except through record_audit'
);
select hasnt_table('public', 'role_audit', 'role changes go to audit_log, no table of their own');

select * from finish();
rollback;
