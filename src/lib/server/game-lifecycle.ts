// The game lifecycle service (spec #59): the one module the game's routes call to create,
// join and run a game. Server-only; routes pass `supabaseService()` after checking who is
// asking, and every command takes the asking anonymous user. A command either succeeds or
// throws a `GameRefusal` whose code the phone turns into a message (`#lib/game/refusals.js`).
//
// Before Start a game is rows (migration `20261023006400_lobby.sql`, ADR 0002): the game and
// one row per player. Start adds the one versioned jsonb game state (`20261025220800_start_game.sql`),
// and from then on every command is a game machine command (`#lib/game/machine.js`), saved where
// the version is still the one it loaded.

import { isCardLocale, type CardLocale } from '../cards/card'
import { isCountryCode } from '../cards/country'
import type { Json } from '../database.types'
import { deckFromRows, type DeckRow } from '../game/deck'
import { isGameCode, normaliseGameCode, randomGameCode } from '../game/game-code'
import { apply, create, load, type Command } from '../game/machine'
import { nudgeEvent, nudgeTopic, type Nudge } from '../game/nudge'
import {
    isPlayerIcon,
    maxPlayers,
    minPlayers,
    normalisePlayerName,
    type PlayerIcon,
} from '../game/player'
import type { GameRefusalCode } from '../game/refusals'
import { isTargetScore, maxTargetScore, minTargetScore } from '../game/settings'
import type { DeckCard } from '../game/state'
import { redact, type SeatView } from '../game/view'
import { checkRpc, RpcRefusal, type Refusals } from './rpc-refusal'
import type { Db } from './supabase'

// For logs and tests; the phone words each code itself, in the player's language.
const refusals = {
    invalid_name: 'A name is 1 to 16 characters.',
    invalid_icon: 'That icon is not in the set.',
    not_found: 'No running game has that code.',
    no_seat: 'You have no seat in that game.',
    game_full: `The game already has ${maxPlayers} players.`,
    game_started: 'The game has already started.',
    name_taken: 'Another player has that name.',
    icon_taken: 'Another player has that icon.',
    not_host: 'Only the host can do that.',
    no_player: 'That player has already left.',
    host_cannot_leave: "The host can't leave or be removed.",
    removed: 'The host removed you from the game.',
    invalid_target_score: `The target score is ${minTargetScore} to ${maxTargetScore}.`,
    invalid_card_language: 'Cards come in English, Swedish or Norwegian.',
    not_seating: 'The game is not in seating.',
    invalid_seating: 'A seating has every seated player exactly once.',
    not_your_turn: 'Only the active player can do that.',
    not_picking: 'No category is waiting to be picked.',
    not_your_pick:
        "Only the reader picks on Reader's choice, and the active player on Free choice.",
    category_unavailable: 'That category has no cards left.',
    not_placing: 'No card is waiting to be placed.',
    invalid_slot: 'That is not a gap on the timeline.',
    lock_in_unavailable: 'Lock in comes only after a correct play.',
    continue_unavailable: 'Continue comes only after a correct play.',
    not_stealing: 'No misplaced card is waiting to be stolen.',
    not_your_steal: 'Only the current stealer can steal.',
    game_over: 'The game is over.',
    nothing_to_skip: 'That player is not holding up play: no turn, steal or reading of theirs.',
    no_other_reader: 'Nobody else can read the card.',
    not_system: 'Only the system abandons a game.',
    too_few_players: 'A game needs at least two players.',
    stale_version: 'The game has moved on since the phone last fetched it.',
    not_started: 'The game has not started yet.',
} satisfies Record<GameRefusalCode, string> & Refusals

/** A refused command; `code` says why. */
export class GameRefusal extends RpcRefusal {
    declare readonly code: GameRefusalCode
}

const refuse = (code: GameRefusalCode): never => {
    throw new GameRefusal(code, refusals[code])
}

/**
 * A player as everyone in the lobby sees them. `isYou` marks the asking player's own row;
 * `seatId` names the seat for the host's Remove without giving away the player's user.
 */
export type LobbyPlayer = {
    seatId: string
    name: string
    icon: PlayerIcon
    isHost: boolean
    isYou: boolean
}

// A seat id as Postgres accepts it; anything else names no seat.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The lobby as the asking player sees it. `gameId` and `version` match its nudges. */
export type Lobby = {
    gameId: string
    version: number
    code: string
    targetScore: number
    exactYear: boolean
    cardLanguage: CardLocale
    /** Countries whose country-specific cards the game leaves out (`cards.country_specific`). */
    leftOutCountries: string[]
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

/** The running game with `code` (any case) and its players, and the asking player's own row. */
async function readGame(db: Db, userId: string, code: string) {
    const normalised = normaliseGameCode(code)
    if (!isGameCode(normalised)) refuse('not_found')

    const { data: game, error } = await db
        .from('games')
        .select(
            'id, version, code, target_score, exact_year, card_language, left_out_countries, started_at, state, game_players (user_id, seat_id, name, icon, is_host, joined_at)',
        )
        .eq('code', normalised)
        .is('ended_at', null)
        .order('joined_at', { referencedTable: 'game_players' })
        .maybeSingle()
    if (error) throw new Error(error.message, { cause: error })
    if (!game) return refuse('not_found')
    const you = game.game_players.find((player) => player.user_id === userId)
    if (!you) return refuse((await wasRemoved(db, game.id, userId)) ? 'removed' : 'no_seat')
    return { game, you }
}

/**
 * The lobby of the running game with `code` (any case), for a player seated in it. Refused
 * with `not_found` when no running game has the code, `no_seat` when `userId` isn't in it.
 */
export async function getLobby(db: Db, userId: string, code: string): Promise<Lobby> {
    const { game } = await readGame(db, userId, code)
    return lobbyOf(game, userId)
}

function lobbyOf(game: Awaited<ReturnType<typeof readGame>>['game'], userId: string): Lobby {
    return {
        gameId: game.id,
        version: game.version,
        code: game.code,
        targetScore: game.target_score,
        exactYear: game.exact_year,
        cardLanguage: game.card_language,
        leftOutCountries: game.left_out_countries,
        players: game.game_players.map((player) => ({
            seatId: player.seat_id,
            name: player.name,
            // Only icons from the set get in (`createGame`); the database checks the shape only.
            icon: player.icon as PlayerIcon,
            isHost: player.is_host,
            isYou: player.user_id === userId,
        })),
    }
}

/**
 * The running game with `code` (any case) as a player seated in it sees it: its lobby until
 * Start, then the game state redacted for their seat (ADR 0002). `gameId` and `version` match
 * its nudges either way. Refused like `getLobby`.
 */
export async function getGame(
    db: Db,
    userId: string,
    code: string,
): Promise<
    | { started: false; gameId: string; version: number; code: string; lobby: Lobby }
    | { started: true; gameId: string; version: number; code: string; view: SeatView }
> {
    const { game, you } = await readGame(db, userId, code)
    const { id: gameId, version } = game
    if (game.state === null) {
        return { started: false, gameId, version, code: game.code, lobby: lobbyOf(game, userId) }
    }
    return {
        started: true,
        gameId,
        version,
        code: game.code,
        view: redact(load(game.state), you.seat_id),
    }
}

/**
 * The name-and-icon step for joining the running game with `code` (any case): the names and
 * icons already taken, so the phone can flag a clash before submitting. `seated` says `userId`
 * already has a seat, and the phone goes straight to the lobby; `null` is a phone that hasn't
 * signed in yet. `removed` says the host removed `userId` from the lobby, and they haven't
 * joined again. Refused, for a player without a seat, with `not_found`, `game_started` or
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
    removed: boolean
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
        removed: !seated && userId !== null && (await wasRemoved(db, game.id, userId)),
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
 * Change own name or icon: `userId` takes `name` and `icon` in the lobby of the running game
 * with `code` (any case), then nudges everyone in it. The same clashes as joining are refused,
 * and `no_seat` or `game_started` when there's no lobby seat to change.
 */
export async function changePlayer(
    db: Db,
    input: { userId: string; code: string; name: string; icon: string },
): Promise<void> {
    const code = normaliseGameCode(input.code)
    if (!isGameCode(code)) refuse('not_found')
    const name = normalisePlayerName(input.name) ?? refuse('invalid_name')
    if (!isPlayerIcon(input.icon)) refuse('invalid_icon')

    const { data, error } = await db
        .rpc('change_player', {
            player: input.userId,
            code,
            player_name: name,
            player_icon: input.icon,
        })
        .single()
    checkRpc(error, refusals, GameRefusal)
    if (!data) throw new Error('change_player returned no game')

    await nudge(db, { gameId: data.changed_game, version: data.game_version })
}

/**
 * Leave lobby: `userId` gives up their seat in the lobby of the running game with `code` (any
 * case), then nudges everyone left. The host can't leave (`host_cannot_leave`): nobody else
 * could start the game.
 */
export async function leaveGame(db: Db, input: { userId: string; code: string }): Promise<void> {
    const code = normaliseGameCode(input.code)
    if (!isGameCode(code)) refuse('not_found')

    const { data, error } = await db.rpc('leave_game', { player: input.userId, code }).single()
    checkRpc(error, refusals, GameRefusal)
    if (!data) throw new Error('leave_game returned no game')

    await nudge(db, { gameId: data.left_game, version: data.game_version })
}

/**
 * Host removes from lobby: the host `userId` takes the player in `seatId` (a `LobbyPlayer`'s)
 * out of the lobby of the running game with `code` (any case), then nudges everyone, the
 * removed player's phone too, which then learns it was removed. They can join again with the
 * code. Refused with `not_host` for anyone else, `no_player` when the seat is gone.
 */
export async function removePlayer(
    db: Db,
    input: { userId: string; code: string; seatId: string },
): Promise<void> {
    const code = normaliseGameCode(input.code)
    if (!isGameCode(code)) refuse('not_found')
    if (!uuidPattern.test(input.seatId)) refuse('no_player')

    const { data, error } = await db
        .rpc('remove_player', { host: input.userId, code, seat: input.seatId })
        .single()
    checkRpc(error, refusals, GameRefusal)
    if (!data) throw new Error('remove_player returned no game')

    await nudge(db, { gameId: data.removed_game, version: data.game_version })
}

/**
 * Update settings: the host `userId` gives the lobby of the running game with `code` (any case)
 * a target score (3–30), the exact-year house rule on or off, a card language, and the
 * countries whose country-specific cards to leave out (none when not given), then nudges
 * everyone in it. Anything in `leftOutCountries` that isn't a country code is dropped. Refused with `not_host` for anyone else, `game_started` after Start,
 * `invalid_target_score` or `invalid_card_language`.
 */
export async function updateSettings(
    db: Db,
    input: {
        userId: string
        code: string
        targetScore: number
        exactYear: boolean
        cardLanguage: string
        leftOutCountries?: string[]
    },
): Promise<void> {
    const code = normaliseGameCode(input.code)
    if (!isGameCode(code)) refuse('not_found')
    if (!isTargetScore(input.targetScore)) refuse('invalid_target_score')
    if (!isCardLocale(input.cardLanguage)) return refuse('invalid_card_language')

    const { data, error } = await db
        .rpc('update_settings', {
            host: input.userId,
            code,
            target_score: input.targetScore,
            exact_year: input.exactYear,
            card_language: input.cardLanguage,
            left_out_countries: [...new Set((input.leftOutCountries ?? []).filter(isCountryCode))],
        })
        .single()
    checkRpc(error, refusals, GameRefusal)
    if (!data) throw new Error('update_settings returned no game')

    await nudge(db, { gameId: data.updated_game, version: data.game_version })
}

// How many times Start or a command reads the game again when another change got in first.
const maxAttempts = 5

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

/**
 * Start game: the host `userId` closes the lobby of the running game with `code` (any case) to
 * new players and creates its game state (ADR 0004) from the lobby's players in join order, its
 * settings and a snapshot of the deck, then nudges everyone into seating. A player's id in the
 * state is their seat id. With two players the machine goes straight on to play. Refused with
 * `not_host` for anyone else, `too_few_players` with fewer than two, `game_started` after
 * Start. A lobby that changes while the state is built (a join, a leave) is read again.
 * `seed` picks the game's seed and `now` gives the year the anchors stop at (tests fix them).
 */
export async function startGame(
    db: Db,
    input: { userId: string; code: string },
    { seed = randomSeed, now = () => new Date() }: { seed?: () => number; now?: () => Date } = {},
): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { game, you } = await readGame(db, input.userId, input.code)
        if (game.started_at) refuse('game_started')
        if (!you.is_host) refuse('not_host')
        if (game.game_players.length < minPlayers) refuse('too_few_players')

        const state = create({
            players: game.game_players.map((player) => ({
                id: player.seat_id,
                name: player.name,
                // Only icons from the set get in; the database checks the shape only.
                icon: player.icon as PlayerIcon,
                host: player.is_host,
            })),
            settings: {
                targetScore: game.target_score,
                exactYear: game.exact_year,
                cardLanguage: game.card_language,
            },
            // Join order; a rematch will start from its previous game's seating (#76).
            seating: game.game_players.map((player) => player.seat_id),
            cards: await readDeck(db, game.card_language, game.left_out_countries),
            seed: seed(),
            currentYear: now().getFullYear(),
        })
        const { data, error } = await db
            .rpc('start_game', {
                host: input.userId,
                code: game.code,
                lobby_version: game.version,
                state: state as unknown as Json,
            })
            .single()
        if (error?.message === 'version_conflict') continue
        checkRpc(error, refusals, GameRefusal)
        if (!data) throw new Error('start_game returned no game')

        await nudge(db, { gameId: data.started_game, version: data.game_version })
        return
    }
    throw new Error(`The lobby kept changing during ${maxAttempts} tries to start it`)
}

/**
 * Set seating: the host `userId` seats everyone in the running game with `code` (any case)
 * clockwise in `seating`, by their seat ids, while the game is in seating. Everyone's phone
 * follows live. `version` is the version the host's phone showed: see `play`.
 */
export async function setSeating(
    db: Db,
    input: { userId: string; code: string; version?: number; seating: unknown },
): Promise<void> {
    const { seating } = input
    if (!Array.isArray(seating) || !seating.every((id) => typeof id === 'string')) {
        refuse('invalid_seating')
    }
    await play(db, input, (by) => ({ type: 'setSeating', by, seating: seating as string[] }))
}

/**
 * Confirm seating: the host `userId` fixes the seating of the running game with `code` (any
 * case), and play starts or resumes. The first time it deals everyone their anchor year and
 * starts the first turn. `version` is the version the host's phone showed: see `play`. `now`
 * gives the year the anchors stop at (tests fix it).
 */
export async function confirmSeating(
    db: Db,
    input: { userId: string; code: string; version?: number },
    { now = () => new Date() }: { now?: () => Date } = {},
): Promise<void> {
    await play(db, input, (by) => ({
        type: 'confirmSeating',
        by,
        currentYear: now().getFullYear(),
    }))
}

/**
 * Skip: the host `userId` moves play past whatever the player in `seatId` is holding up in the
 * running game with `code` (any case): their turn ends with their unlocked cards lost, their
 * steal passes the card on, or their reading moves to the next player before the active one.
 * They keep their seat and locked score. `version` is the version the host's phone showed: see
 * `play`. Refused with `not_host` for anyone else, `nothing_to_skip` for a player holding
 * nothing up, and `no_other_reader` when nobody else can read.
 */
export async function skipPlayer(
    db: Db,
    input: { userId: string; code: string; version?: number; seatId: string },
): Promise<void> {
    await play(db, input, (by) => ({ type: 'skip', by, playerId: input.seatId }))
}

/**
 * Plays the game machine command `command` makes for the asking player's seat on the running
 * game with `code` (any case), saves the next state where the version is still the one it
 * loaded, and nudges everyone. When another save got in first it reads the game again and
 * plays the command on that. `version`, when given, is the version the phone showed: a command
 * based on an older one is refused with `stale_version`, and the phone refetches. Refused with
 * `not_started` before Start, and with the machine's refusals.
 */
async function play(
    db: Db,
    input: { userId: string; code: string; version?: number },
    command: (by: string) => Command,
): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { game, you } = await readGame(db, input.userId, input.code)
        if (game.state === null) refuse('not_started')
        if (input.version !== undefined && input.version !== game.version) {
            refuse('stale_version')
        }
        const result = apply(load(game.state), command(you.seat_id))
        if (!result.ok) return refuse(result.refusal)

        const { data, error } = await db
            .from('games')
            .update({ state: result.state as unknown as Json, version: game.version + 1 })
            .eq('id', game.id)
            .eq('version', game.version)
            .select('version')
        if (error) throw new Error(error.message, { cause: error })
        if (data.length === 0) continue

        await nudge(db, { gameId: game.id, version: data[0].version })
        return
    }
    throw new Error(`The game kept changing during ${maxAttempts} tries to play a command`)
}

// The Data API returns at most `max_rows` (supabase/config.toml) rows per request.
const deckBatch = 1000

/**
 * The deck for a game in `cardLanguage` (ADR 0004): every published card in a category that
 * isn't archived, except those specific to a country in `leftOutCountries`.
 */
async function readDeck(
    db: Db,
    cardLanguage: CardLocale,
    leftOutCountries: readonly string[],
): Promise<DeckCard[]> {
    // Country codes are two capital letters (`isCountryCode`), safe inside the filter.
    const countries = leftOutCountries.filter(isCountryCode).join(',')
    const rows: DeckRow[] = []
    for (;;) {
        let query = db
            .from('cards')
            .select(
                'id, category_id, year, decade, categories!inner (position, archived_at), card_translations (locale, text)',
            )
            .eq('status', 'published')
            .is('categories.archived_at', null)
        if (countries) {
            query = query.or(`country_specific.is.null,country_specific.not.in.(${countries})`)
        }
        const { data, error } = await query
            .order('id')
            .range(rows.length, rows.length + deckBatch - 1)
        if (error) throw new Error(error.message, { cause: error })
        rows.push(
            ...data.map((card) => ({
                id: card.id,
                categoryId: card.category_id,
                categoryPosition: card.categories.position,
                year: card.year,
                decade: card.decade,
                texts: Object.fromEntries(
                    card.card_translations.map(({ locale, text }) => [locale, text]),
                ),
            })),
        )
        if (data.length < deckBatch) return deckFromRows(rows, cardLanguage)
    }
}

/** A player's seat in a running game: the game, its code and the seat. */
export type Seat = { gameId: string; code: string; seatId: string }

/**
 * Find my seat: `userId`'s seat in a running game, or `null` when they have none (they never
 * joined, left, or the host removed them). Seated in more than one, it's the one they joined
 * last. It powers "Back to game" on the home page and every reload.
 */
export async function findMySeat(db: Db, userId: string): Promise<Seat | null> {
    const { data, error } = await db
        .from('game_players')
        .select('seat_id, games!inner (id, code)')
        .eq('user_id', userId)
        .is('games.ended_at', null)
        .order('joined_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (error) throw new Error(error.message, { cause: error })
    return data && { gameId: data.games.id, code: data.games.code, seatId: data.seat_id }
}

/**
 * Sweep: at `now`, ends every lobby with no activity for 2 hours (its code is free again, and
 * joining it is `not_found`), then deletes every game that ended 30 days ago, with its player
 * rows. Returns how many of each. pg_cron runs the same sweep every 15 minutes in production
 * (migration `20261023115047_sweep_lobbies.sql`) with the database's clock; tests pass their own.
 */
export async function sweep(db: Db, now: Date): Promise<{ expired: number; deleted: number }> {
    const { data, error } = await db.rpc('sweep_games', { now: now.toISOString() }).single()
    if (error) throw new Error(error.message, { cause: error })
    if (!data) throw new Error('sweep_games returned nothing')
    return data
}

/** Whether the host removed `userId` from the game's lobby, and they haven't joined again. */
async function wasRemoved(db: Db, gameId: string, userId: string): Promise<boolean> {
    const { count, error } = await db
        .from('game_removals')
        .select('user_id', { count: 'exact', head: true })
        .eq('game_id', gameId)
        .eq('user_id', userId)
    if (error) throw new Error(error.message, { cause: error })
    return count === 1
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
