-- The lobby (#64, #65, #66): the browser's roles can't touch games or players, only the server can
-- (ADR 0002), and a game's code is unique among games that haven't ended.
-- Run with `vpr test:db` against the local stack. Everything is rolled back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (id, is_anonymous) values
    ('00000000-0000-0000-0000-0000000064a1', true),
    ('00000000-0000-0000-0000-0000000064a2', true);

select lives_ok(
    $$ select public.create_game('00000000-0000-0000-0000-0000000064a1', 'QQQQ', 'Astrid', 'cat', 'en') $$,
    'the server creates a game with its host'
);
select results_eq(
    $$ select p.name, p.icon, p.is_host from public.game_players p
       join public.games g on g.id = p.game_id where g.code = 'QQQQ' $$,
    $$ values ('Astrid', 'cat', true) $$,
    'the host is seated in the new game'
);
select throws_ok(
    $$ select public.create_game('00000000-0000-0000-0000-0000000064a2', 'QQQQ', 'Bo', 'dog', 'en') $$,
    '23505',
    null,
    'a second running game cannot take the same code'
);
update public.games set ended_at = now() where code = 'QQQQ';
select lives_ok(
    $$ select public.create_game('00000000-0000-0000-0000-0000000064a2', 'QQQQ', 'Bo', 'dog', 'en') $$,
    'the code is free again once its game has ended'
);
select throws_ok(
    $$ select public.create_game('00000000-0000-0000-0000-0000000064a1', 'QQIO', 'Astrid', 'cat', 'en') $$,
    '23514',
    null,
    'a code with look-alike letters is refused'
);

-- The browser's roles: anonymous players sign in as `authenticated`, the rest are `anon`.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000064a1","is_anonymous":true}', true);

select throws_ok($$ select * from public.games $$, '42501', null, 'a player cannot read games');
select throws_ok($$ select * from public.game_players $$, '42501', null, 'a player cannot read players');
select throws_ok(
    $$ insert into public.game_players (game_id, user_id, name, icon)
       select id, '00000000-0000-0000-0000-0000000064a1', 'Sneaky', 'fish' from public.games limit 1 $$,
    '42501',
    null,
    'a player cannot seat themselves'
);
select throws_ok(
    $$ select public.create_game('00000000-0000-0000-0000-0000000064a1', 'WWWW', 'Astrid', 'cat', 'en') $$,
    '42501',
    null,
    'a player cannot call create_game'
);
select throws_ok(
    $$ select public.join_game('00000000-0000-0000-0000-0000000064a1', 'QQQQ', 'Sneaky', 'fish') $$,
    '42501',
    null,
    'a player cannot call join_game'
);
select throws_ok(
    $$ select public.change_player('00000000-0000-0000-0000-0000000064a1', 'QQQQ', 'Sneaky', 'fish') $$,
    '42501',
    null,
    'a player cannot call change_player'
);
select throws_ok(
    $$ select public.leave_game('00000000-0000-0000-0000-0000000064a1', 'QQQQ') $$,
    '42501',
    null,
    'a player cannot call leave_game'
);
select throws_ok(
    $$ select public.remove_player('00000000-0000-0000-0000-0000000064a1', 'QQQQ', gen_random_uuid()) $$,
    '42501',
    null,
    'a player cannot call remove_player'
);
select throws_ok($$ select * from public.game_removals $$, '42501', null, 'a player cannot read removals');

set local role anon;
select throws_ok($$ select * from public.games $$, '42501', null, 'anon cannot read games');

select * from finish();
rollback;
