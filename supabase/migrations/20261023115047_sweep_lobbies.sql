-- Sweep (#69, spec #59): a lobby nobody touches for 2 hours expires and frees its code, and a
-- game is deleted, with its player rows, 30 days after it ended. #77 adds idle and ended games.
-- The sweep takes its clock as an argument so tests can control time; pg_cron runs it in
-- production with the database's own.

-- Activity -------------------------------------------------------------------------------

-- When anyone last did something in the game. Every command that changes a game bumps its
-- version for the nudge that follows (joins, name and icon changes, leaving, removing, the
-- host's settings), so a new version is what counts as activity.
alter table public.games add column last_active_at timestamptz not null default now();
update public.games set last_active_at = created_at;

create function public.stamp_game_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    new.last_active_at := now();
    return new;
end;
$$;

create trigger games_stamp_activity
    before update of version on public.games
    for each row
    when (new.version is distinct from old.version)
    execute function public.stamp_game_activity();

-- The sweep looks up lobbies never started by how long they've been idle,
create index games_lobby_idle_idx on public.games (last_active_at)
    where ended_at is null and started_at is null;
-- and ended games by when they ended.
create index games_ended_at_idx on public.games (ended_at) where ended_at is not null;

-- Sweep ----------------------------------------------------------------------------------

-- Sweep at `now`: ends every lobby idle for 2 hours, which frees its code (the unique index
-- covers unended games only) and refuses any command to it as `not_found`, then deletes every
-- game that ended 30 days ago, its player rows going with it. Returns how many of each.
-- A lobby command that locked the game row first wins: the update re-checks the row after it.
create function public.sweep_games(now timestamptz)
returns table (expired integer, deleted integer)
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

-- Schedule -------------------------------------------------------------------------------

-- Every 15 minutes, so a lobby lasts 2 hours to 2¼ hours after its last activity. pg_cron
-- runs in the database itself: nothing outside has to stay switched on. `cron.schedule`
-- replaces a job of the same name, so running this again changes nothing.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('sweep-games', '*/15 * * * *', 'select public.sweep_games(now())');
