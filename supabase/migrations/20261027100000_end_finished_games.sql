-- End early and the end screen (#75, spec #59): a game ends as soon as its state does. A state
-- saved as finished (won), ended (ended early, or too few players left) or abandoned stamps
-- `ended_at`, whichever command saved it (`games` updates and `remove_from_game` alike). That
-- frees its code, since the unique index covers unended games only, so the join link and Find
-- my seat no longer lead to it; its players still open it by code for the end screen. It is
-- deleted with its player rows 30 days later, like an expired lobby.

create function public.end_finished_game()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.ended_at := now();
    return new;
end;
$$;

-- The phases `isOver` names in `src/lib/game/state.ts`.
create trigger games_end_finished
    before update of state on public.games
    for each row
    when (
        new.ended_at is null
        and new.state -> 'phase' ->> 'name' in ('finished', 'ended', 'abandoned')
    )
    execute function public.end_finished_game();
