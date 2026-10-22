// The game lifecycle service (spec #59): the one module the game's routes call to create,
// join and run a game. Server-only; routes pass `supabaseService()` after checking who is
// asking, and every command takes the asking anonymous user. A command either succeeds or
// throws a `GameRefusal` whose code the phone turns into a message (`#lib/game/refusals.js`).
//
// Before Start a game is rows (migration `20261023006400_lobby.sql`, ADR 0002): the game and
// one row per player.

import type { CardLocale } from '../cards/card'
import { isGameCode, normaliseGameCode, randomGameCode } from '../game/game-code'
import { nudgeEvent, nudgeTopic, type Nudge } from '../game/nudge'
import { isPlayerIcon, maxPlayers, normalisePlayerName, type PlayerIcon } from '../game/player'
import type { GameRefusalCode } from '../game/refusals'
import { checkRpc, RpcRefusal, type Refusals } from './rpc-refusal'
import type { Db } from './supabase'

// For logs and tests; the phone words each code itself, in the player's language.
const refusals = {
    invalid_name: 'A name is 1 to 16 characters.',
    invalid_icon: 'That icon is not in the set.',
    not_found: 'No running game has that code.',
    no_seat: 'You have no seat in that game.',
    game_full: 'The game already has 10 players.',
    game_started: 'The game has already started.',
    name_taken: 'Another player has that name.',
    icon_taken: 'Another player has that icon.',
} satisfies Record<GameRefusalCode, string> & Refusals

/** A refused command; `code` says why. */
export class GameRefusal extends RpcRefusal {
    declare readonly code: GameRefusalCode
}

const refuse = (code: GameRefusalCode): never => {
    throw new GameRefusal(code, refusals[code])
}

/** A player as everyone in the lobby sees them. `isYou` marks the asking player's own row. */
export type LobbyPlayer = { name: string; icon: PlayerIcon; isHost: boolean; isYou: boolean }

/** The lobby as the asking player sees it. `gameId` and `version` match its nudges. */
export type Lobby = {
    gameId: string
    version: number
    code: string
    targetScore: number
    exactYear: boolean
    cardLanguage: CardLocale
    players: LobbyPlayer[]
}

// A clash on this index means another unended game holds the code: draw again.
const codeClash = 'games_code_unended_key'
const maxCodeDraws = 20

/**
 * Create game: a new game in the lobby, with `userId` seated as its host under `name` and
 * `icon`. The card language starts as the host's app language. Returns the game's code.
 * `newCode` draws a code (tests force clashes with it).
 */
export async function createGame(
    db: Db,
    input: { userId: string; name: string; icon: string; cardLanguage: CardLocale },
    { newCode = randomGameCode }: { newCode?: () => string } = {},
): Promise<{ code: string }> {
    const name = normalisePlayerName(input.name) ?? refuse('invalid_name')
    if (!isPlayerIcon(input.icon)) refuse('invalid_icon')

    for (let draw = 0; draw < maxCodeDraws; draw++) {
        const code = newCode()
        const { error } = await db.rpc('create_game', {
            host: input.userId,
            code,
            host_name: name,
            host_icon: input.icon,
            card_language: input.cardLanguage,
        })
        if (error?.code === '23505' && error.message.includes(codeClash)) continue
        checkRpc(error, refusals, GameRefusal)
        return { code }
    }
    throw new Error(`No free game code after ${maxCodeDraws} draws`)
}

/**
 * The lobby of the running game with `code` (any case), for a player seated in it. Refused
 * with `not_found` when no running game has the code, `no_seat` when `userId` isn't in it.
 */
export async function getLobby(db: Db, userId: string, code: string): Promise<Lobby> {
    const normalised = normaliseGameCode(code)
    if (!isGameCode(normalised)) refuse('not_found')

    const { data: game, error } = await db
        .from('games')
        .select(
            'id, version, code, target_score, exact_year, card_language, game_players (user_id, name, icon, is_host, joined_at)',
        )
        .eq('code', normalised)
        .is('ended_at', null)
        .order('joined_at', { referencedTable: 'game_players' })
        .maybeSingle()
    if (error) throw new Error(error.message, { cause: error })
    if (!game) return refuse('not_found')
    if (!game.game_players.some((player) => player.user_id === userId)) refuse('no_seat')

    return {
        gameId: game.id,
        version: game.version,
        code: game.code,
        targetScore: game.target_score,
        exactYear: game.exact_year,
        cardLanguage: game.card_language,
        players: game.game_players.map((player) => ({
            name: player.name,
            // Only icons from the set get in (`createGame`); the database checks the shape only.
            icon: player.icon as PlayerIcon,
            isHost: player.is_host,
            isYou: player.user_id === userId,
        })),
    }
}

/**
 * The name-and-icon step for joining the running game with `code` (any case): the names and
 * icons already taken, so the phone can flag a clash before submitting. `seated` says `userId`
 * already has a seat, and the phone goes straight to the lobby; `null` is a phone that hasn't
 * signed in yet. Refused, for a player without a seat, with `not_found`, `game_started` or
 * `game_full`.
 */
export async function getJoinStep(
    db: Db,
    userId: string | null,
    code: string,
): Promise<{
    code: string
    gameId: string
    version: number
    seated: boolean
    takenNames: string[]
    takenIcons: PlayerIcon[]
}> {
    const normalised = normaliseGameCode(code)
    if (!isGameCode(normalised)) refuse('not_found')

    const { data: game, error } = await db
        .from('games')
        .select('id, version, code, started_at, game_players (user_id, name, icon, joined_at)')
        .eq('code', normalised)
        .is('ended_at', null)
        .order('joined_at', { referencedTable: 'game_players' })
        .maybeSingle()
    if (error) throw new Error(error.message, { cause: error })
    if (!game) return refuse('not_found')

    const seated = game.game_players.some((player) => player.user_id === userId)
    if (!seated && game.started_at) refuse('game_started')
    if (!seated && game.game_players.length >= maxPlayers) refuse('game_full')

    return {
        code: game.code,
        gameId: game.id,
        version: game.version,
        seated,
        takenNames: game.game_players.map((player) => player.name),
        // Only icons from the set get in; the database checks the shape only.
        takenIcons: game.game_players.map((player) => player.icon as PlayerIcon),
    }
}

/**
 * Join game: seats `userId` in the running game with `code` (any case) under `name` and
 * `icon`, then nudges everyone in it. Joining a game you already have a seat in changes
 * nothing. Returns the game's code.
 */
export async function joinGame(
    db: Db,
    input: { userId: string; code: string; name: string; icon: string },
): Promise<{ code: string }> {
    const code = normaliseGameCode(input.code)
    if (!isGameCode(code)) refuse('not_found')
    const name = normalisePlayerName(input.name) ?? refuse('invalid_name')
    if (!isPlayerIcon(input.icon)) refuse('invalid_icon')

    const { data, error } = await db
        .rpc('join_game', {
            player: input.userId,
            code,
            player_name: name,
            player_icon: input.icon,
        })
        .single()
    checkRpc(error, refusals, GameRefusal)
    if (!data) throw new Error('join_game returned no game')

    await nudge(db, { gameId: data.joined_game, version: data.game_version })
    return { code }
}

/**
 * Broadcasts `nudge` on its game's channel, over REST (no socket held open on the server).
 * A lost nudge only delays the phones' refetch to the next nudge or reload, so the change it
 * follows stands and the failure is only logged.
 */
async function nudge(db: Db, message: Nudge) {
    const channel = db.channel(nudgeTopic(message.gameId))
    try {
        const sent = await channel.httpSend(nudgeEvent, message)
        if (!sent.success) console.error(`Nudge for game ${message.gameId} failed:`, sent.error)
    } catch (error) {
        console.error(`Nudge for game ${message.gameId} failed:`, error)
    } finally {
        await db.removeChannel(channel)
    }
}
