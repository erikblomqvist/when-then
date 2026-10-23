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

/** A Category draw that leaves the category to someone: the reader, or the active player. */
export type ChoiceDraw = { kind: 'readersChoice' } | { kind: 'freeChoice' }

/** What the Category draw landed on. */
export type DrawOutcome = { kind: 'category'; category: string } | ChoiceDraw

/**
 * The play in progress: a Reader's or Free choice waits for its category, the card is dealt and
 * waits to be placed, it sits unlocked on the active player's timeline while they decide whether
 * to lock in or continue, or, misplaced, it waits for `stealerId` to try to steal it.
 */
export type Play =
    | { step: 'picking'; readerId: string; draw: ChoiceDraw }
    | { step: 'placing' | 'deciding'; readerId: string; draw: DrawOutcome; cardId: string }
    | {
          step: 'stealing'
          readerId: string
          draw: DrawOutcome
          cardId: string
          stealerId: string
      }

/**
 * Who is holding up `play` and what the host would skip of theirs, the active player first: the
 * current stealer's steal, or else the active player's turn and, while a choice or a card
 * waits, the reader's reading.
 */
export function holdingUp(play: Play, activeId: string): { playerId: string; what: Skipped }[] {
    if (play.step === 'stealing') return [{ playerId: play.stealerId, what: 'steal' }]
    const turn = { playerId: activeId, what: 'turn' as const }
    if (play.step === 'deciding') return [turn]
    return [turn, { playerId: play.readerId, what: 'reading' }]
}

/** Who picks the category on a choice: the reader on Reader's choice, else the active player. */
export const pickerOf = (draw: ChoiceDraw, activeId: string, readerId: string) =>
    draw.kind === 'readersChoice' ? readerId : activeId

/** What the host skips an absent player's part in: their turn, steal attempt or reading. */
export type Skipped = 'turn' | 'steal' | 'reading'

/**
 * Something that happened this turn, for a phone that reloads mid-turn. A play that isn't
 * correct is the misplaced card, which lost the turn's correct plays before it.
 */
export type LogEntry =
    | { kind: 'play'; playerId: string; cardId: string; correct: boolean }
    | { kind: 'steal'; playerId: string; cardId: string; correct: boolean }
    | { kind: 'skip'; playerId: string; what: Skipped }
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
    /** The host asked to reseat: the game goes into seating when this round ends unwon. */
    reseat: boolean
    phase: Phase
    /** Per seated player, in date order. */
    timelines: Record<string, TimelineEntry[]>
    /** The current turn's outcomes, cleared when the next turn starts. */
    log: LogEntry[]
    /** Cards that left the game unplaced, with their dates revealed. Never dealt again. */
    discards: string[]
    rng: Rng
    /** Per category in the deck's order, the card ids still to be dealt, front first. */
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

/** The categories that still have cards to deal, in the order the deck lists them. */
export const categoriesLeft = (state: GameState) =>
    Object.keys(state.queues).filter((category) => state.queues[category].length > 0)

/** A player's score: their locked cards. Anchors and unlocked cards never count. */
export const score = (state: GameState, playerId: string): number =>
    (state.timelines[playerId] ?? []).filter((entry) => entry.kind === 'card' && entry.locked)
        .length

/** The seated players with the highest score, in seating order, and that score. */
export function leaders(state: GameState) {
    const top = Math.max(0, ...state.seating.map((id) => score(state, id)))
    return { top, ids: state.seating.filter((id) => score(state, id) === top) }
}
