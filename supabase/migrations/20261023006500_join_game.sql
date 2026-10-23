-- Joining a game (#65, spec #59): a player takes a seat in a game's lobby with their own name
-- and icon. Names (ignoring case) and icons are unique per game through the indexes from
-- `20261023006400_lobby.sql`; this adds the 10-player cap and the refusal once the game has
-- started, both checked under a lock on the game row so two joins in the same moment can't
-- both win.

-- When the host started the game; from then on nobody new can join. Start sets it (a later
-- migration, with the game state).
alter table public.games add column started_at timestamptz;

-- Counts changes to the lobby. After each one the server nudges the game's channel with
-- `{gameId, version}`, and a phone that already shows that version can skip the refetch.
alter table public.games add column version integer not null default 1;

-- Join game: seats `player` in the running game with `code` under `player_name` and
-- `player_icon`, and returns the game and its new version. Joining a game you already have a
-- seat in changes nothing. Refuses with `not_found`, `game_started`, `game_full`, `name_taken`
-- or `icon_taken`.
create function public.join_game(player uuid, code text, player_name text, player_icon text)
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

    return query
        update public.games g set version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.join_game(uuid, text, text, text)
    from public, anon, authenticated;
grant execute on function public.join_game(uuid, text, text, text) to service_role;
