-- The lobby (#64, spec #59, ADR 0002): before Start, a game lives in its own rows, a game row
-- plus one row per player, so simultaneous joins never overwrite each other. The game state
-- (one jsonb value with a version) arrives with Start, in a later migration.
--
-- Only the server reads or writes these tables, through the lifecycle service
-- (`src/lib/server/game-lifecycle.ts`) with the service client. Each function takes the
-- acting anonymous user explicitly, since `auth.uid()` is null there.

-- Games ----------------------------------------------------------------------------------

create table public.games (
    id uuid primary key default gen_random_uuid(),
    -- Four letters without the look-alikes I and O (`src/lib/game/game-code.ts`).
    code text not null check (code ~ '^[A-HJ-NP-Z]{4}$'),
    target_score integer not null default 10 check (target_score between 3 and 30),
    exact_year boolean not null default false,
    card_language public.card_locale not null,
    created_at timestamptz not null default now(),
    -- When the game finished, expired or was abandoned; its code is free again from then on.
    ended_at timestamptz
);

comment on table public.games is
    'A game, from its lobby on. The code is unique among games that haven''t ended.';

-- A code names one game at a time: two creates can't both take it (the loser retries).
create unique index games_code_unended_key on public.games (code) where ended_at is null;

-- Players --------------------------------------------------------------------------------

create table public.game_players (
    game_id uuid not null references public.games (id) on delete cascade,
    -- The anonymous user the seat belongs to (there is no other proof of identity in v1).
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (name = btrim(name) and char_length(name) between 1 and 16),
    -- A Lucide icon name from the curated set in `src/lib/game/player.ts`.
    icon text not null check (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    is_host boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (game_id, user_id)
);

comment on table public.game_players is
    'One row per player in a game: their anonymous user, chosen name and icon, and the host flag.';

-- Names are unique within a game ignoring case, icons outright, and there is one host.
create unique index game_players_name_key on public.game_players (game_id, lower(name));
create unique index game_players_icon_key on public.game_players (game_id, icon);
create unique index game_players_host_key on public.game_players (game_id) where is_host;
create index game_players_user_id_idx on public.game_players (user_id);

-- Access: the browser never touches these tables (ADR 0002) -------------------------------

alter table public.games enable row level security;
alter table public.game_players enable row level security;
revoke all on table public.games, public.game_players from anon, authenticated, public;
grant select, insert, update, delete on table public.games, public.game_players to service_role;

-- Commands -------------------------------------------------------------------------------

-- Create game: a new game in the lobby with `host` seated as its host, in one transaction.
-- The caller picks the code; a clash with an unended game raises a unique violation on
-- `games_code_unended_key`, and the caller retries with another code.
create function public.create_game(
    host uuid,
    code text,
    host_name text,
    host_icon text,
    card_language public.card_locale
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
    game_id uuid;
begin
    insert into public.games (code, card_language)
    values (code, card_language)
    returning id into game_id;

    insert into public.game_players (game_id, user_id, name, icon, is_host)
    values (game_id, host, host_name, host_icon, true);

    return game_id;
end;
$$;

revoke execute on function public.create_game(uuid, text, text, text, public.card_locale)
    from public, anon, authenticated;
grant execute on function public.create_game(uuid, text, text, text, public.card_locale)
    to service_role;
