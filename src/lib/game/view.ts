// What one seat may see of a game (ADR 0004, spec #89). `redact` is the only way from the full
// state (`./state`) to a phone, and `SeatView` is its own type, so client code can't read a
// hidden field at all: the seed, the dice's position, the queues and every card not yet dealt
// are never in it, the card in play keeps its date until it's placed (through every steal), and
// only the reader gets its text.

import {
    categoriesLeft,
    pickerOf,
    score,
    type ChoiceDraw,
    type DeckCard,
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

/** A play with its card dealt, the card as a seat sees it. */
type DealtView<P> = P extends { cardId: string } ? Omit<P, 'cardId'> & { card: CardInPlay } : never

/**
 * The play in progress as a seat sees it. On a Reader's or Free choice, everyone sees who picks
 * and which categories they can pick from; during the steals, everyone sees who is stealing.
 */
export type PlayView =
    | {
          step: 'picking'
          readerId: string
          draw: ChoiceDraw
          pickerId: string
          categories: string[]
      }
    | DealtView<Play>

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
    /** The host asked to reseat after this round. */
    reseat: boolean
    phase: PhaseView
    timelines: Record<string, TimelineEntry[]>
    scores: Record<string, number>
    log: LogEntry[]
    /** The turn before's outcomes, so the phone can show how it ended. */
    lastTurn: LogEntry[]
    discards: string[]
    /**
     * Every card that has come out, with its text and date: on a timeline, discarded, or lost
     * this turn or the last. Not the card in play until it's placed.
     */
    cards: Record<string, DeckCard>
}

/** What `seat` may see of `state`. */
export function redact(state: GameState, seat: string): SeatView {
    const shown = new Set(state.discards)
    for (const timeline of Object.values(state.timelines)) {
        for (const entry of timeline) if (entry.kind === 'card') shown.add(entry.cardId)
    }
    // This turn's and the last one's correct plays, still unlocked or lost since.
    for (const entry of [...state.log, ...state.lastTurn])
        if (entry.kind === 'play' && entry.correct) shown.add(entry.cardId)
    return {
        seat,
        players: state.players,
        settings: state.settings,
        seating: state.seating,
        startingPlayerId: state.startingPlayerId,
        reseat: state.reseat,
        phase: phaseView(state, seat, shown),
        timelines: state.timelines,
        scores: Object.fromEntries(state.seating.map((id) => [id, score(state, id)])),
        log: state.log,
        lastTurn: state.lastTurn,
        discards: state.discards,
        cards: Object.fromEntries([...shown].map((id) => [id, state.cards[id]])),
    }
}

function phaseView(state: GameState, seat: string, shown: Set<string>): PhaseView {
    if (state.phase.name !== 'playing') return state.phase
    const { activeId, play } = state.phase
    if (play.step === 'picking') {
        return {
            name: 'playing',
            activeId,
            play: {
                step: 'picking',
                readerId: play.readerId,
                draw: play.draw,
                pickerId: pickerOf(play.draw, activeId, play.readerId),
                categories: categoriesLeft(state),
            },
        }
    }
    const { cardId, ...rest } = play
    const card = state.cards[cardId]
    // Once placed, the card is on a timeline for all to see; until then only the reader reads it.
    const revealed = shown.has(card.id)
    return {
        name: 'playing',
        activeId,
        play: {
            ...rest,
            card: {
                category: card.category,
                text: revealed || seat === play.readerId ? card.text : null,
                date: revealed ? card.date : null,
            },
        },
    }
}

/** A seated player's place at the end of a game: their locked score, and whether they won. */
export type Standing = { player: GamePlayer; score: number; winner: boolean }

/**
 * The seated players of `view`, highest score first and a tie in seating order, with the
 * winners marked: nobody unless the game was won. A player the host removed isn't in them.
 */
export function standings(view: SeatView): Standing[] {
    const winners = view.phase.name === 'finished' ? view.phase.winners : []
    return view.seating
        .map((id) => ({
            player: view.players.find((player) => player.id === id)!,
            score: view.scores[id] ?? 0,
            winner: winners.includes(id),
        }))
        .toSorted((a, b) => b.score - a.score)
}
