// A running game's full state (ADR 0004, spec #89): one jsonb value per game (ADR 0002) that
// only the game machine (`./machine`) changes. It holds everything, the seed and the queued
// cards included, so it never leaves the server; phones get `redact`'s `SeatView` (`./view`).

import type { CardLocale } from '../cards/card'
import { decadeOf } from '../cards/date-parts'
import type { PlayerIcon } from './player'
import type { Rng } from './random'
import type { Seating } from './seating'

/** The state's shape. Changing it means a new number and an upgrade in `load` (`./machine`). */
export const currentSchema = 1

/**
 * A date as the standard game mode plays it: a year from 1500 onwards, and before that a decade
 * stored by its earliest year (`#lib/cards/date-parts.js`). Both sort as plain numbers.
 */
export type GameDate = number

/** The standard game mode's date for a year: the year from 1500, its decade before. */
export const standardDate = (year: number): GameDate => (year >= 1500 ? year : decadeOf(year))

/** A card as dealt: `text` in the card language, falling back to English. */
export type DeckCard = { id: string; category: string; text: string; date: GameDate }

/** A player as copied in at create. A removed player stays, out of the seating. */
export type GamePlayer = {
    id: string
    name: string
    icon: PlayerIcon
    host: boolean
    removed: boolean
}

/** The lobby's settings, fixed at Start. `exactYear` has no effect yet (#20). */
export type GameSettings = { targetScore: number; exactYear: boolean; cardLanguage: CardLocale }

/** One entry on a timeline. Card entries are unlocked while the turn that placed them lasts. */
export type TimelineEntry =
    | { kind: 'anchor'; date: GameDate }
    | { kind: 'card'; cardId: string; date: GameDate; locked: boolean }

/** What the Category draw landed on. Reader's choice and Free choice come with #92. */
export type DrawOutcome = { kind: 'category'; category: string }

/**
 * The play in progress: the card is dealt and waits to be placed, or it sits unlocked on the
 * active player's timeline while they decide whether to lock in.
 */
export type Play = {
    step: 'placing' | 'deciding'
    readerId: string
    draw: DrawOutcome
    cardId: string
}

/** Something that happened this turn, for a phone that reloads mid-turn. */
export type LogEntry =
    | { kind: 'play'; playerId: string; cardId: string; correct: boolean }
    | { kind: 'discard'; cardId: string }

/** Where the game is; `ended` is ended early and `abandoned` timed out, both with no winner. */
export type Phase =
    | { name: 'seating' }
    | { name: 'playing'; activeId: string; play: Play }
    | { name: 'finished'; winners: string[] }
    | { name: 'ended' }
    | { name: 'abandoned' }

/** Everything about a running game, hidden parts included. */
export type GameState = {
    schema: typeof currentSchema
    players: GamePlayer[]
    settings: GameSettings
    seating: Seating
    /** Who opens every round; chosen when play starts. */
    startingPlayerId: string | null
    phase: Phase
    /** Per seated player, in date order. */
    timelines: Record<string, TimelineEntry[]>
    /** The current turn's outcomes, cleared when the next turn starts. */
    log: LogEntry[]
    /** Cards that left the game unplaced, with their dates revealed. Never dealt again. */
    discards: string[]
    rng: Rng
    /** Per category, the card ids still to be dealt, front first. */
    queues: Record<string, string[]>
    /** Every card in the deck snapshot, dealt or not. */
    cards: Record<string, DeckCard>
}

/**
 * Whether `date` fits in gap `slot` of `timeline` (0 is before the first entry): no earlier than
 * the entry on its left and no later than the one on its right, so an equal date fits either side.
 */
export const fits = (timeline: readonly TimelineEntry[], slot: number, date: GameDate) =>
    (slot === 0 || timeline[slot - 1].date <= date) &&
    (slot === timeline.length || date <= timeline[slot].date)

/** A player's score: their locked cards. Anchors and unlocked cards never count. */
export const score = (state: GameState, playerId: string): number =>
    (state.timelines[playerId] ?? []).filter((entry) => entry.kind === 'card' && entry.locked)
        .length
