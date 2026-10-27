-- Play again (#76, spec #59): the host starts a rematch from a finished game. It is a new game
-- with its own code, in the lobby, with the same players (names, icons and host) and settings,
-- and from there it is like any lobby: the host changes settings, players leave, newcomers join.
-- The players come in the finished game's seating order, so the join order Start seats them in
-- (`startGame` in `src/lib/server/game-lifecycle.ts`) begins with the previous seating, and
-- newcomers follow it.

-- The finished game a rematch was started from. Games linked this way are the game group that
-- dealing without repeats (#22) looks across. A game has at most one rematch that hasn't ended;
-- once it has (an idle lobby the sweep ended, or a rematch played to the end), the host can start
-- another.
alter table public.games
    add column previous_game_id uuid references public.games (id) on delete set null;

create unique index games_previous_game_unended_key on public.games (previous_game_id)
    where ended_at is null;

comment on column public.games.previous_game_id is
    'The finished game this game is a rematch of; null for a game created from scratch.';

-- Create rematch: the host `host` starts a rematch of the finished game `previous` under `code`,
-- and gets the rematch, its code, and the finished game's new version for the nudge that sends
-- its phones there. A game whose rematch hasn't ended gets that one back. The caller picks the
-- code; a clash with an unended game raises a unique violation on `games_code_unended_key`, and
-- the caller retries with another code, as for `create_game`. Refuses with `not_found`,
-- `not_host` or `not_over` (the game hasn't finished).
create function public.create_rematch(host uuid, previous uuid, code text)
returns table (rematch_game uuid, rematch_code text, previous_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games;
    rematch public.games;
begin
    -- Two presses of Play again queue up here, and the second finds the first one's rematch.
    select * into game from public.games g where g.id = previous for update;
    if not found then
        raise exception 'not_found' using detail = 'No running game has that code.';
    end if;
    if not exists (
        select from public.game_players p
        where p.game_id = game.id and p.user_id = host and p.is_host
    ) then
        raise exception 'not_host' using detail = 'Only the host can do that.';
    end if;
    if game.state is null or game.ended_at is null then
        raise exception 'not_over' using detail = 'The game is not over yet.';
    end if;

    select * into rematch
    from public.games g
    where g.previous_game_id = game.id and g.ended_at is null;
    if found then
        return query select rematch.id, rematch.code, game.version;
        return;
    end if;

    insert into public.games (
        code, target_score, exact_year, card_language, left_out_countries, previous_game_id
    )
    values (
        create_rematch.code,
        game.target_score,
        game.exact_year,
        game.card_language,
        game.left_out_countries,
        game.id
    )
    returning * into rematch;

    -- In seating order (`state.seating`, seat ids), a millisecond apart so join order keeps it.
    -- A removed player has no row left to copy.
    insert into public.game_players (game_id, user_id, name, icon, is_host, joined_at)
    select rematch.id, p.user_id, p.name, p.icon, p.is_host,
        now() + interval '1 millisecond' * row_number() over (
            order by seat.position nulls last, p.joined_at
        )
    from public.game_players p
    left join jsonb_array_elements_text(game.state -> 'seating') with ordinality
        as seat (seat_id, position)
        on seat.seat_id = p.seat_id::text
    where p.game_id = game.id;

    return query
        update public.games g set version = g.version + 1
        where g.id = game.id
        returning rematch.id, rematch.code, g.version;
end;
$$;

revoke execute on function public.create_rematch(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.create_rematch(uuid, uuid, text) to service_role;
