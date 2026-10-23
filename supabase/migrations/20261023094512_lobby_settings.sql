-- Lobby settings (#67, spec #59): the host sets the target score, the exact-year house rule and
-- the card language before Start. The columns and their limits are in
-- `20261023006400_lobby.sql`; this adds the command, which locks the game row like the other
-- lobby commands and bumps the version for the nudge that follows.

-- Update settings: the host `host` gives the game with `code` these settings, and gets the game
-- and its new version. Refuses with `not_found`, `game_started`, `not_host` or
-- `invalid_target_score` (outside 3–30, `src/lib/game/settings.ts`).
create function public.update_settings(
    host uuid,
    code text,
    target_score integer,
    exact_year boolean,
    card_language public.card_locale
)
returns table (updated_game uuid, game_version integer)
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
    -- The column's check holds these limits too; this one names the refusal for the phone.
    if update_settings.target_score is null or update_settings.target_score not between 3 and 30
    then
        raise exception 'invalid_target_score' using detail = 'The target score is 3 to 30.';
    end if;

    return query
        update public.games g
        set target_score = update_settings.target_score,
            exact_year = update_settings.exact_year,
            card_language = update_settings.card_language,
            version = g.version + 1
        where g.id = game.id
        returning g.id, g.version;
end;
$$;

revoke execute on function public.update_settings(uuid, text, integer, boolean, public.card_locale)
    from public, anon, authenticated;
grant execute on function public.update_settings(uuid, text, integer, boolean, public.card_locale)
    to service_role;
