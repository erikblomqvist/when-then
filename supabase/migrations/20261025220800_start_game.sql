-- Start game (#70, spec #59, ADR 0002): the host closes the lobby and the game gets its one
-- versioned jsonb state. The lifecycle service builds the state with the game machine from the
-- lobby it read (players, settings, deck), and this saves it only if the lobby is still the one
-- it read: a join, leave or change in between moves the version on, and the service reads the
-- lobby again and retries. From then on every command loads the state, applies the machine and
-- saves it back where the version is still the one it loaded.

-- The game state (`src/lib/game/state.ts`), whose shape only the server knows. Start sets it
-- with `started_at`; a lobby has none.
alter table public.games add column state jsonb;

-- Start game: the host `host` starts the lobby of the game with `code` with `state`, if the
-- lobby is still at `lobby_version`, and gets the game and its new version. Joining is refused
-- as `game_started` from then on. Refuses with `not_found`, `game_started`, `not_host`,
-- `too_few_players` (fewer than 2), or `version_conflict` when the lobby changed since it was
-- read.
create function public.start_game(host uuid, code text, lobby_version integer, state jsonb)
returns table (started_game uuid, game_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
    game public.games := public.lock_lobby(code);
begin
    if not exists (
        select from public.game_players p
        where p.game_id = game.id and p.user_id = host and p.is_host
    ) then
        raise exception 'not_host' using detail = 'Only the host can do that.';
    end if;
    -- `minPlayers` in `src/lib/game/player.ts`.
    if (select count(*) from public.game_players p where p.game_id = game.id) < 2 then
        raise exception 'too_few_players' using detail = 'A game needs at least two players.';
    end if;
    if game.version <> lobby_version then
        raise exception 'version_conflict' using detail = 'The lobby changed since it was read.';
    end if;

    return query
        update public.games g
        set state = start_game.state, started_at = now(), version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.start_game(uuid, text, integer, jsonb)
    from public, anon, authenticated;
grant execute on function public.start_game(uuid, text, integer, jsonb) to service_role;
