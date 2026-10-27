-- Remove player after Start (#74, spec #59): the host takes a player out of a running game for
-- good. The game machine takes them out of the state; this saves that state and, in the same
-- transaction, gives up their user's seat row and records the removal, as the lobby's Remove
-- does (`20261023085945_lobby_players.sql`). Find my seat then has nothing for them, and their
-- phone is refused as `removed`. After Start, joining again is refused as before.

comment on table public.game_removals is
    'Players the host removed from a game and who have not joined again: from a lobby, which they can join again, or from a started game, for good.';

-- Remove from game: saves `state` on the game `game` if it is still at `game_version`, gives up
-- the seat `seat`'s row and records its user as removed. Returns the game's new version, or
-- null when another save got in first and the service reads the game again.
create function public.remove_from_game(game uuid, game_version integer, seat uuid, state jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    saved integer;
    removed uuid;
begin
    update public.games g
    set state = remove_from_game.state, version = g.version + 1
    where g.id = remove_from_game.game and g.version = game_version
    returning g.version into saved;
    if not found then
        return null;
    end if;

    delete from public.game_players p
    where p.game_id = remove_from_game.game and p.seat_id = seat
    returning p.user_id into removed;
    if removed is not null then
        insert into public.game_removals (game_id, user_id)
        values (remove_from_game.game, removed)
        on conflict (game_id, user_id) do update set removed_at = now();
    end if;

    return saved;
end;
$$;

revoke execute on function public.remove_from_game(uuid, integer, uuid, jsonb)
    from public, anon, authenticated;
grant execute on function public.remove_from_game(uuid, integer, uuid, jsonb) to service_role;
