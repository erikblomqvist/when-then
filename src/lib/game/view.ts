// What one seat may see of a game (ADR 0004, spec #89). `redact` is the only way from the full
// state (`./state`) to a phone, and `SeatView` is its own type, so client code can't read a
// hidden field at all: the seed, the dice's position, the queues and every card not yet dealt
// are never in it, the card in play keeps its date until it's placed, and only the reader gets
// its text.

import {
    score,
    type DeckCard,
    type DrawOutcome,
    type GameDate,
    type GamePlayer,
    type GameSettings,
    type GameState,
    type LogEntry,
    type Phase,
    type Play,
    type TimelineEntry,
} from './state'

/** The card in play as a seat sees it: null for what that seat may not know yet. */
export type CardInPlay = { category: string; text: string | null; date: GameDate | null }

/** The play in progress as a seat sees it. */
export type PlayView = {
    step: Play['step']
    readerId: string
    draw: DrawOutcome
    card: CardInPlay
}

/** The phase as a seat sees it: only a play has anything to hide. */
export type PhaseView =
    | Exclude<Phase, { name: 'playing' }>
    | { name: 'playing'; activeId: string; play: PlayView }

/** All one seat may see of a game; the only game data a phone ever receives. */
export type SeatView = {
    /** The player this view is for. */
    seat: string
    players: GamePlayer[]
    settings: GameSettings
    seating: readonly string[]
    startingPlayerId: string | null
    phase: PhaseView
    timelines: Record<string, TimelineEntry[]>
    scores: Record<string, number>
    log: LogEntry[]
    discards: string[]
    /** Every card that has come out, on a timeline or discarded, with its text and date. */
    cards: Record<string, DeckCard>
}

/** What `seat` may see of `state`. */
export function redact(state: GameState, seat: string): SeatView {
    const shown = new Set(state.discards)
    for (const timeline of Object.values(state.timelines)) {
        for (const entry of timeline) if (entry.kind === 'card') shown.add(entry.cardId)
    }
    return {
        seat,
        players: state.players,
        settings: state.settings,
        seating: state.seating,
        startingPlayerId: state.startingPlayerId,
        phase: phaseView(state, seat, shown),
        timelines: state.timelines,
        scores: Object.fromEntries(state.seating.map((id) => [id, score(state, id)])),
        log: state.log,
        discards: state.discards,
        cards: Object.fromEntries([...shown].map((id) => [id, state.cards[id]])),
    }
}

function phaseView(state: GameState, seat: string, shown: Set<string>): PhaseView {
    if (state.phase.name !== 'playing') return state.phase
    const { activeId, play } = state.phase
    const card = state.cards[play.cardId]
    // Once placed, the card is on a timeline for all to see; until then only the reader reads it.
    const revealed = shown.has(card.id)
    return {
        name: 'playing',
        activeId,
        play: {
            step: play.step,
            readerId: play.readerId,
            draw: play.draw,
            card: {
                category: card.category,
                text: revealed || seat === play.readerId ? card.text : null,
                date: revealed ? card.date : null,
            },
        },
    }
}
