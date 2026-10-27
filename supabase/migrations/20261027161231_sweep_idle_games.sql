-- Sweep idle games (#77, spec #59): the sweep from `20261023115047_sweep_lobbies.sql` now also
-- abandons a game that has started when nobody has played a command for 24 hours, in seating or
-- in play. Abandoned is its own end, with no winner; ending frees its code, so the join link and
-- Find my seat no longer lead to it, while its players still open it by code for the end screen.
-- Like every game that ended, played to the end or ended early too, it is deleted with its
-- player rows 30 days later.

-- The sweep looks up started games that haven't ended by how long they've been idle.
create index games_running_idle_idx on public.games (last_active_at)
    where ended_at is null and started_at is not null;

-- It now also says how many games it abandoned, so it is created again.
drop function public.sweep_games(timestamptz);

-- Sweep at `now`: ends every lobby idle for 2 hours, which frees its code (the unique index
-- covers unended games only) and refuses any command to it as `not_found`; abandons every game
-- with no command for 24 hours, which ends it the same way; then deletes every game that ended
-- 30 days ago, its player rows going with it. Returns how many of each.
-- Abandoning is the game machine's `abandon` (`src/lib/game/machine.ts`), which only sets the
-- phase, so it is done here for pg_cron, which can't run the machine. It moves the version on,
-- so a command saved from the version before is read again and refused as `game_over`; a
-- command that locked the game row first wins, since the update re-checks the row after it.
-- Each abandoned game's phones get the nudge (`src/lib/game/nudge.ts`) on its public channel,
-- sent when the sweep commits, and refetch the end screen.
create function public.sweep_games(now timestamptz)
returns table (expired integer, abandoned integer, deleted integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
    with ended as (
        update public.games g
        set ended_at = sweep_games.now
        where g.ended_at is null
            and g.started_at is null
            and g.last_active_at <= sweep_games.now - interval '2 hours'
        returning 1
    )
    select count(*) into expired from ended;

    with idle as (
        update public.games g
        set state = jsonb_set(g.state, '{phase}', '{"name": "abandoned"}'),
            ended_at = sweep_games.now,
            version = g.version + 1
        where g.ended_at is null
            and g.started_at is not null
            and g.last_active_at <= sweep_games.now - interval '24 hours'
        returning g.id, g.version
    ),
    nudged as (
        select realtime.send(
            jsonb_build_object('gameId', idle.id, 'version', idle.version),
            'nudge',
            'game:' || idle.id,
            false
        )
        from idle
    )
    select count(*) into abandoned from nudged;

    with gone as (
        delete from public.games g
        where g.ended_at <= sweep_games.now - interval '30 days'
        returning 1
    )
    select count(*) into deleted from gone;

    return next;
end;
$$;

revoke execute on function public.sweep_games(timestamptz) from public, anon, authenticated;
grant execute on function public.sweep_games(timestamptz) to service_role;
