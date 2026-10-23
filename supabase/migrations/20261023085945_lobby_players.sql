-- Managing your place in the lobby (#66, spec #59): a player changes their name or icon or
-- leaves, and the host removes a player. A removed player can join again with the code, and
-- until they do, their phone is told they were removed. Each command locks the game row, like
-- `join_game`, and bumps the version for the nudge that follows.

-- Names a seat to the phones without giving away its user. Removing goes by seat, not by name:
-- names change, so a host looking at a stale list could otherwise remove someone else. Joining
-- again makes a new seat.
alter table public.game_players
    add column seat_id uuid not null default gen_random_uuid() unique;

-- Players the host removed from a game's lobby. Joining again clears the row; leaving never
-- writes one, so the phone can tell a removal from a leave.
create table public.game_removals (
    game_id uuid not null references public.games (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    removed_at timestamptz not null default now(),
    primary key (game_id, user_id)
);

comment on table public.game_removals is
    'Players the host removed from a lobby and who have not joined again.';

create index game_removals_user_id_idx on public.game_removals (user_id);

alter table public.game_removals enable row level security;
revoke all on table public.game_removals from anon, authenticated, public;
grant select, insert, update, delete on table public.game_removals to service_role;

-- Lock lobby: the running game with `code`, locked so lobby commands to one game queue up.
-- Refuses with `not_found`, or `game_started` once the lobby is closed.
create function public.lock_lobby(code text)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games;
begin
    select * into game
    from public.games g
    where g.code = lock_lobby.code and g.ended_at is null
    for update;
    if not found then
        raise exception 'not_found' using detail = 'No running game has that code.';
    end if;
    if game.started_at is not null then
        raise exception 'game_started' using detail = 'The game has already started.';
    end if;
    return game;
end;
$$;

revoke execute on function public.lock_lobby(text) from public, anon, authenticated;
grant execute on function public.lock_lobby(text) to service_role;

-- Change player: `player` takes `player_name` and `player_icon` in the lobby of the game with
-- `code`, and returns the game and its new version. The same unique indexes as joining decide a
-- clash. Refuses with `not_found`, `game_started`, `no_seat`, `name_taken` or `icon_taken`.
create function public.change_player(player uuid, code text, player_name text, player_icon text)
returns table (changed_game uuid, game_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games := public.lock_lobby(code);
    clash text;
begin
    if not exists (
        select from public.game_players p where p.game_id = game.id and p.user_id = player
    ) then
        raise exception 'no_seat' using detail = 'You have no seat in that game.';
    end if;

    begin
        update public.game_players p
        set name = player_name, icon = player_icon
        where p.game_id = game.id and p.user_id = player;
    exception when unique_violation then
        get stacked diagnostics clash = constraint_name;
        if clash = 'game_players_name_key' then
            raise exception 'name_taken' using detail = 'Another player has that name.';
        elsif clash = 'game_players_icon_key' then
            raise exception 'icon_taken' using detail = 'Another player has that icon.';
        end if;
        raise;
    end;

    return query
        update public.games g set version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.change_player(uuid, text, text, text)
    from public, anon, authenticated;
grant execute on function public.change_player(uuid, text, text, text) to service_role;

-- Leave game: `player` gives up their seat in the lobby of the game with `code`, and gets the
-- game and its new version. The host can't leave: nobody else could start the game (host
-- hand-over comes later). Refuses with `not_found`, `game_started`, `no_seat` or
-- `host_cannot_leave`.
create function public.leave_game(player uuid, code text)
returns table (left_game uuid, game_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games := public.lock_lobby(code);
    seat public.game_players;
begin
    select * into seat
    from public.game_players p
    where p.game_id = game.id and p.user_id = player;
    if not found then
        raise exception 'no_seat' using detail = 'You have no seat in that game.';
    end if;
    if seat.is_host then
        raise exception 'host_cannot_leave' using detail = 'The host can''t leave or be removed.';
    end if;

    delete from public.game_players p where p.game_id = game.id and p.user_id = player;

    return query
        update public.games g set version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.leave_game(uuid, text) from public, anon, authenticated;
grant execute on function public.leave_game(uuid, text) to service_role;

-- Remove player: the host `host` takes the player in `seat` out of the lobby of the game with
-- `code`, records the removal, and returns the game and its new version. Refuses with
-- `not_found`, `game_started`, `not_host`, `no_player` (the seat is gone) or
-- `host_cannot_leave` (the host's own seat).
create function public.remove_player(host uuid, code text, seat uuid)
returns table (removed_game uuid, game_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games := public.lock_lobby(code);
    removed public.game_players;
begin
    if not exists (
        select from public.game_players p
        where p.game_id = game.id and p.user_id = host and p.is_host
    ) then
        raise exception 'not_host' using detail = 'Only the host can do that.';
    end if;

    select * into removed
    from public.game_players p
    where p.game_id = game.id and p.seat_id = seat;
    if not found then
        raise exception 'no_player' using detail = 'That player has already left.';
    end if;
    if removed.is_host then
        raise exception 'host_cannot_leave' using detail = 'The host can''t leave or be removed.';
    end if;

    delete from public.game_players p
    where p.game_id = game.id and p.user_id = removed.user_id;
    insert into public.game_removals (game_id, user_id)
    values (game.id, removed.user_id)
    on conflict (game_id, user_id) do update set removed_at = now();

    return query
        update public.games g set version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.remove_player(uuid, text, uuid)
    from public, anon, authenticated;
grant execute on function public.remove_player(uuid, text, uuid) to service_role;

-- Join game, as in `20261023006500_join_game.sql`, now also clearing a removal: a removed
-- player who joins again is simply a player.
create or replace function public.join_game(player uuid, code text, player_name text, player_icon text)
returns table (joined_game uuid, game_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games;
    clash text;
begin
    -- Joins to one game queue up on this lock, so each one counts the players before it.
    select * into game
    from public.games g
    where g.code = join_game.code and g.ended_at is null
    for update;
    if not found then
        raise exception 'not_found' using detail = 'No running game has that code.';
    end if;

    if exists (
        select from public.game_players p where p.game_id = game.id and p.user_id = player
    ) then
        return query select game.id, game.version;
        return;
    end if;

    if game.started_at is not null then
        raise exception 'game_started' using detail = 'The game has already started.';
    end if;
    -- `maxPlayers` in `src/lib/game/player.ts`.
    if (select count(*) from public.game_players p where p.game_id = game.id) >= 10 then
        raise exception 'game_full' using detail = 'The game already has 10 players.';
    end if;

    -- The unique indexes decide a clash, also between two joins in the same moment.
    begin
        insert into public.game_players (game_id, user_id, name, icon)
        values (game.id, player, player_name, player_icon);
    exception when unique_violation then
        get stacked diagnostics clash = constraint_name;
        if clash = 'game_players_name_key' then
            raise exception 'name_taken' using detail = 'Another player has that name.';
        elsif clash = 'game_players_icon_key' then
            raise exception 'icon_taken' using detail = 'Another player has that icon.';
        end if;
        raise;
    end;
    delete from public.game_removals r where r.game_id = game.id and r.user_id = player;

    return query
        update public.games g set version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;
