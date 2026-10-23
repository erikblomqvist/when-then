// The game machine (ADR 0004, spec #89): `create` builds a game's first state and `apply` plays
// one command on it, returning the next state or a refusal. Both are pure: all chance comes
// from the state's seeded dice (`./random`), and anything from outside (the current year, the
// deck) comes in as input. Phones only ever see `redact`'s view of the result (`./view`).

import type { GameRefusalCode } from './refusals'
import { roll, type Dice } from './random'
import { leftOf, rightOf, type Seating } from './seating'
import { defaultTargetScore } from './settings'
import {
    currentSchema,
    fits,
    standardDate,
    type DeckCard,
    type GameDate,
    type GamePlayer,
    type GameSettings,
    type GameState,
    type TimelineEntry,
} from './state'

/** What a game starts from: the lobby's players, settings and seating, and the deck. */
export type CreateInput = {
    players: Omit<GamePlayer, 'removed'>[]
    settings: GameSettings
    /** Clockwise, as the lobby left it. */
    seating: Seating
    /** The deck snapshot: every card the game may deal, dates already in the standard mode. */
    cards: DeckCard[]
    seed: number
    /** Anchors are never later than this. */
    currentYear: number
}

/** A command, with `by` the player the server resolved from the session. */
export type Command = { type: 'place'; by: string; slot: number } | { type: 'lockIn'; by: string }

/** The next state, or the code for why the command was refused. */
export type ApplyResult = { ok: true; state: GameState } | { ok: false; refusal: GameRefusalCode }

/**
 * A new game. With two players there is nothing to seat, so it gives out the anchor years and
 * starts the first play; with more it waits in seating for the host (#91).
 */
export function create(input: CreateInput): GameState {
    if (input.players.length < 2) throw new Error('A game needs at least two players.')
    const dice = roll({ seed: input.seed >>> 0, position: 0 })

    const queues: Record<string, string[]> = {}
    for (const card of dice.shuffle(input.cards)) (queues[card.category] ??= []).push(card.id)

    const state: GameState = {
        schema: currentSchema,
        players: input.players.map((player) => ({ ...player, removed: false })),
        settings: input.settings,
        seating: [...input.seating],
        startingPlayerId: null,
        phase: { name: 'seating' },
        timelines: {},
        log: [],
        discards: [],
        rng: dice.rng,
        queues,
        cards: Object.fromEntries(
            input.cards.map((card) => [card.id, { ...card, date: standardDate(card.date) }]),
        ),
    }
    return state.seating.length === 2 ? beginPlaying(state, input.currentYear) : state
}

/** Give everyone their anchor year, pick the starting player and start the first turn. */
function beginPlaying(state: GameState, currentYear: number): GameState {
    const dice = roll(state.rng)
    const dates = Object.values(state.cards).map((card) => card.date)
    const timelines: Record<string, TimelineEntry[]> = {}
    const given = new Set<GameDate>()
    for (const id of state.seating) {
        const date = anchorDate(dates, currentYear, given, dice)
        given.add(date)
        timelines[id] = [{ kind: 'anchor', date }]
    }
    const startingPlayerId = dice.pick(state.seating)
    return startTurn({ ...state, timelines, startingPlayerId, rng: dice.rng }, startingPlayerId)
}

/**
 * An anchor that follows the spread of the cards: a random card's date, moved up to five years
 * either way (a decade before 1500), never past the current year and not already given.
 */
function anchorDate(
    dates: GameDate[],
    currentYear: number,
    given: Set<GameDate>,
    dice: Dice,
): GameDate {
    const latest = standardDate(currentYear)
    const within = (date: GameDate) => Math.min(standardDate(date), latest)
    for (let attempt = 0; attempt < 20; attempt++) {
        const date = dates.length > 0 ? dice.pick(dates) : latest
        const shift = date < 1500 ? (dice.int(3) - 1) * 10 : dice.int(11) - 5
        const anchor = within(date + shift)
        if (!given.has(anchor)) return anchor
    }
    // A deck too narrow to give everyone their own: step back from the latest until free.
    let anchor = within(dates.length > 0 ? Math.max(...dates) : latest)
    while (given.has(anchor)) anchor = anchor > 1500 ? anchor - 1 : standardDate(anchor - 10)
    return anchor
}

/** `activeId`'s turn begins: a fresh log, and the first play. */
function startTurn(state: GameState, activeId: string): GameState {
    return startPlay({ ...state, log: [] }, activeId)
}

/** The active player's turn is over; the player on their left is next. */
const endTurn = (state: GameState, activeId: string) =>
    startTurn(state, leftOf(state.seating, activeId))

/**
 * The Category draw among the categories with cards left, then the front card of the drawn
 * category is dealt. Reader's choice and Free choice join the draw with #92. With every
 * category empty the game stops; who wins then comes with rounds (#94).
 */
function startPlay(state: GameState, activeId: string): GameState {
    const categories = Object.keys(state.queues).filter((id) => state.queues[id].length > 0)
    if (categories.length === 0) return { ...state, phase: { name: 'ended' } }
    const dice = roll(state.rng)
    const category = dice.pick(categories)
    const [cardId, ...rest] = state.queues[category]
    return {
        ...state,
        rng: dice.rng,
        queues: { ...state.queues, [category]: rest },
        phase: {
            name: 'playing',
            activeId,
            play: {
                step: 'placing',
                readerId: rightOf(state.seating, activeId),
                draw: { kind: 'category', category },
                cardId,
            },
        },
    }
}

/**
 * Upgrades from older schemas, keyed by the schema they upgrade from. A change to the state's
 * shape bumps `currentSchema` and adds one here (ADR 0004).
 */
const upgrades: Record<number, (state: Record<string, unknown>) => Record<string, unknown>> = {}

/**
 * A state as saved, brought up to the current schema. A game whose schema can't be upgraded
 * can't be played on: it ends with no winner, keeping whatever it can.
 */
export function load(saved: unknown): GameState {
    let state = (saved ?? {}) as Record<string, unknown>
    while (typeof state.schema === 'number' && upgrades[state.schema]) {
        state = upgrades[state.schema](state)
    }
    if (state.schema === currentSchema) return state as GameState
    return {
        schema: currentSchema,
        players: Array.isArray(state.players) ? (state.players as GamePlayer[]) : [],
        settings: (state.settings as GameSettings | undefined) ?? {
            targetScore: defaultTargetScore,
            exactYear: false,
            cardLanguage: 'en',
        },
        seating: [],
        startingPlayerId: null,
        phase: { name: 'ended' },
        timelines: {},
        log: [],
        discards: [],
        rng: { seed: 0, position: 0 },
        queues: {},
        cards: {},
    }
}

/** Play `command` on `state`: the next state, or why it was refused. */
export function apply(state: GameState, command: Command): ApplyResult {
    const player = state.players.find((candidate) => candidate.id === command.by)
    if (!player) return refuse('no_seat')
    if (player.removed) return refuse('removed')
    if (state.phase.name !== 'playing') {
        return refuse(command.type === 'lockIn' ? 'lock_in_unavailable' : 'not_placing')
    }
    const { activeId, play } = state.phase
    if (command.by !== activeId) return refuse('not_your_turn')

    switch (command.type) {
        case 'place': {
            if (play.step !== 'placing') return refuse('not_placing')
            const timeline = state.timelines[activeId]
            const { slot } = command
            if (!Number.isInteger(slot) || slot < 0 || slot > timeline.length) {
                return refuse('invalid_slot')
            }
            const card = state.cards[play.cardId]
            const correct = fits(timeline, slot, card.date)
            const log = [
                ...state.log,
                { kind: 'play' as const, playerId: activeId, cardId: card.id, correct },
            ]
            if (!correct) return succeed(misplaced({ ...state, log }, activeId, card.id))
            const entry = { kind: 'card' as const, cardId: card.id, date: card.date, locked: false }
            return succeed({
                ...state,
                log,
                timelines: {
                    ...state.timelines,
                    [activeId]: [...timeline.slice(0, slot), entry, ...timeline.slice(slot)],
                },
                phase: { ...state.phase, play: { ...play, step: 'deciding' } },
            })
        }
        case 'lockIn': {
            if (play.step !== 'deciding') return refuse('lock_in_unavailable')
            const timeline = state.timelines[activeId].map((entry) =>
                entry.kind === 'card' ? { ...entry, locked: true } : entry,
            )
            const next = { ...state, timelines: { ...state.timelines, [activeId]: timeline } }
            return succeed(endTurn(next, activeId))
        }
    }
}

const refuse = (refusal: GameRefusalCode): ApplyResult => ({ ok: false, refusal })
const succeed = (state: GameState): ApplyResult => ({ ok: true, state })

/**
 * A misplaced card ends the turn and loses the unlocked cards. Until steals arrive (#93), the
 * card is discarded with its date revealed, as if nobody stole it.
 */
function misplaced(state: GameState, activeId: string, cardId: string): GameState {
    const timeline = state.timelines[activeId].filter(
        (entry) => entry.kind === 'anchor' || entry.locked,
    )
    const next: GameState = {
        ...state,
        timelines: { ...state.timelines, [activeId]: timeline },
        discards: [...state.discards, cardId],
        log: [...state.log, { kind: 'discard', cardId }],
    }
    return endTurn(next, activeId)
}
