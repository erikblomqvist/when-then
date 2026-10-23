// The game machine (ADR 0004, spec #89): `create` builds a game's first state and `apply` plays
// one command on it, returning the next state or a refusal. Both are pure: all chance comes
// from the state's seeded dice (`./random`), and anything from outside (the current year, the
// deck) comes in as input. Phones only ever see `redact`'s view of the result (`./view`).

import type { GameRefusalCode } from './refusals'
import { roll, type Dice } from './random'
import { leftOf, rightOf, samePlayers, startingFrom, type Seating } from './seating'
import { defaultTargetScore } from './settings'
import {
    categoriesLeft,
    currentSchema,
    fits,
    leaders,
    pickerOf,
    standardDate,
    type DeckCard,
    type DrawOutcome,
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
export type Command =
    | { type: 'setSeating'; by: string; seating: Seating }
    /** `currentYear` caps the anchors, which confirming deals the first time. */
    | { type: 'confirmSeating'; by: string; currentYear: number }
    /** Flag or clear "reseat after this round". */
    | { type: 'setReseat'; by: string; reseat: boolean }
    /** On a Reader's or Free choice, the category to deal from. */
    | { type: 'pickCategory'; by: string; category: string }
    | { type: 'place'; by: string; slot: number }
    | { type: 'lockIn'; by: string }
    /** After a correct play, a new play in the same turn. */
    | { type: 'continue'; by: string }
    /** The current stealer's go at the misplaced card, in a gap on their own timeline. */
    | { type: 'steal'; by: string; slot: number }

/** The next state, or the code for why the command was refused. */
export type ApplyResult = { ok: true; state: GameState } | { ok: false; refusal: GameRefusalCode }

/**
 * A new game. With two players there is nothing to seat, so it gives out the anchor years and
 * starts the first play; with more it waits in seating until the host confirms it.
 */
export function create(input: CreateInput): GameState {
    if (input.players.length < 2) throw new Error('A game needs at least two players.')
    const dice = roll({ seed: input.seed >>> 0, position: 0 })

    // Categories in the deck's order, each with its cards shuffled.
    const queues: Record<string, string[]> = {}
    for (const card of input.cards) queues[card.category] ??= []
    for (const card of dice.shuffle(input.cards)) queues[card.category].push(card.id)

    const state: GameState = {
        schema: currentSchema,
        players: input.players.map((player) => ({ ...player, removed: false })),
        settings: input.settings,
        seating: [...input.seating],
        startingPlayerId: null,
        reseat: false,
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
    if (!Number.isInteger(currentYear)) {
        throw new Error(`The current year is a whole number, not ${currentYear}.`)
    }
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

/**
 * The active player's turn is over and the player on their left is next, unless that's the
 * starting player and the round is over. Then the highest score at or above the target wins,
 * equal top scores sharing the win; without a winner, a flagged round goes into seating (with
 * more than two players, who can only sit one way round) and the next round waits for Confirm.
 */
function endTurn(state: GameState, activeId: string): GameState {
    const next = leftOf(state.seating, activeId)
    if (next !== state.startingPlayerId) return startTurn(state, next)
    const { top, ids } = leaders(state)
    if (top >= state.settings.targetScore) {
        return { ...state, phase: { name: 'finished', winners: ids } }
    }
    if (state.reseat && state.seating.length > 2) {
        return { ...state, reseat: false, phase: { name: 'seating' } }
    }
    return startTurn({ ...state, reseat: false }, next)
}

/**
 * The Category draw: each category with cards left, Reader's choice and Free choice are equally
 * likely, though with one category left there is nothing to choose and only it is drawn. A
 * category is dealt from at once; a choice waits for its category to be picked. With every
 * category empty the turn locks in and the game is over: the highest score wins, at or below
 * the target, and equal top scores share the win.
 */
function startPlay(state: GameState, activeId: string): GameState {
    const categories = categoriesLeft(state)
    if (categories.length === 0) {
        const final = lockedIn(state, activeId)
        return { ...final, phase: { name: 'finished', winners: leaders(final).ids } }
    }
    const dice = roll(state.rng)
    const choices: DrawOutcome[] =
        categories.length > 1 ? [{ kind: 'readersChoice' }, { kind: 'freeChoice' }] : []
    const draw = dice.pick<DrawOutcome>([
        ...categories.map((category) => ({ kind: 'category' as const, category })),
        ...choices,
    ])
    const readerId = rightOf(state.seating, activeId)
    const next = { ...state, rng: dice.rng }
    if (draw.kind === 'category') return deal(next, activeId, readerId, draw, draw.category)
    return {
        ...next,
        phase: { name: 'playing', activeId, play: { step: 'picking', readerId, draw } },
    }
}

/** The front card of `category` is dealt, waiting to be placed. */
function deal(
    state: GameState,
    activeId: string,
    readerId: string,
    draw: DrawOutcome,
    category: string,
): GameState {
    const [cardId, ...rest] = state.queues[category]
    return {
        ...state,
        queues: { ...state.queues, [category]: rest },
        phase: {
            name: 'playing',
            activeId,
            play: { step: 'placing', readerId, draw, cardId },
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
        reseat: false,
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

    switch (command.type) {
        case 'setSeating':
        case 'confirmSeating': {
            if (!player.host) return refuse('not_host')
            if (state.phase.name !== 'seating') return refuse('not_seating')
            if (command.type === 'confirmSeating') {
                // The host has just seated everyone, so a reseat flagged meanwhile is done with.
                // Between rounds the anchors are out already: the next round just opens.
                const seated = { ...state, reseat: false }
                const { startingPlayerId } = seated
                if (startingPlayerId !== null) return succeed(startTurn(seated, startingPlayerId))
                return succeed(beginPlaying(seated, command.currentYear))
            }
            if (!samePlayers(state.seating, command.seating)) return refuse('invalid_seating')
            return succeed({ ...state, seating: [...command.seating] })
        }
        case 'setReseat': {
            if (!player.host) return refuse('not_host')
            if (state.phase.name !== 'seating' && state.phase.name !== 'playing') {
                return refuse('game_over')
            }
            return succeed({ ...state, reseat: command.reseat })
        }
    }

    if (state.phase.name !== 'playing') return refuse(unavailable[command.type])
    const { activeId, play } = state.phase

    // The commands of a play that aren't only the active player's.
    if (command.type === 'pickCategory') {
        if (play.step !== 'picking') return refuse('not_picking')
        if (command.by !== pickerOf(play.draw, activeId, play.readerId)) {
            return refuse('not_your_pick')
        }
        if (!categoriesLeft(state).includes(command.category)) {
            return refuse('category_unavailable')
        }
        return succeed(deal(state, activeId, play.readerId, play.draw, command.category))
    }
    if (command.type === 'steal') {
        if (play.step !== 'stealing') return refuse('not_stealing')
        if (command.by !== play.stealerId) return refuse('not_your_steal')
        const timeline = state.timelines[play.stealerId]
        if (!isSlot(timeline, command.slot)) return refuse('invalid_slot')
        const card = state.cards[play.cardId]
        const correct = fits(timeline, command.slot, card.date)
        const log = [
            ...state.log,
            { kind: 'steal' as const, playerId: play.stealerId, cardId: card.id, correct },
        ]
        if (correct) {
            const entry = { kind: 'card' as const, cardId: card.id, date: card.date, locked: true }
            const stolen = inserted(timeline, command.slot, entry)
            const next = {
                ...state,
                log,
                timelines: { ...state.timelines, [play.stealerId]: stolen },
            }
            return succeed(endTurn(next, activeId))
        }
        return succeed(toNextStealer({ ...state, log }, activeId, play.stealerId))
    }

    if (command.by !== activeId) return refuse('not_your_turn')

    switch (command.type) {
        case 'place': {
            if (play.step !== 'placing') return refuse('not_placing')
            const timeline = state.timelines[activeId]
            const { slot } = command
            if (!isSlot(timeline, slot)) return refuse('invalid_slot')
            const card = state.cards[play.cardId]
            const correct = fits(timeline, slot, card.date)
            const log = [
                ...state.log,
                { kind: 'play' as const, playerId: activeId, cardId: card.id, correct },
            ]
            if (!correct) return succeed(misplaced({ ...state, log }, activeId))
            const entry = { kind: 'card' as const, cardId: card.id, date: card.date, locked: false }
            return succeed({
                ...state,
                log,
                timelines: { ...state.timelines, [activeId]: inserted(timeline, slot, entry) },
                phase: { ...state.phase, play: { ...play, step: 'deciding' } },
            })
        }
        case 'lockIn': {
            if (play.step !== 'deciding') return refuse('lock_in_unavailable')
            return succeed(endTurn(lockedIn(state, activeId), activeId))
        }
        case 'continue': {
            if (play.step !== 'deciding') return refuse('continue_unavailable')
            return succeed(startPlay(state, activeId))
        }
    }
}

/** Why a play's command is refused when no play is in progress. */
const unavailable: Record<
    'pickCategory' | 'place' | 'lockIn' | 'continue' | 'steal',
    GameRefusalCode
> = {
    pickCategory: 'not_picking',
    place: 'not_placing',
    lockIn: 'lock_in_unavailable',
    continue: 'continue_unavailable',
    steal: 'not_stealing',
}

/** Whether `slot` is a gap on `timeline`: 0 before the first entry up to after the last. */
const isSlot = (timeline: readonly TimelineEntry[], slot: number) =>
    Number.isInteger(slot) && slot >= 0 && slot <= timeline.length

const inserted = (timeline: readonly TimelineEntry[], slot: number, entry: TimelineEntry) => [
    ...timeline.slice(0, slot),
    entry,
    ...timeline.slice(slot),
]

/** `state` with every card on `playerId`'s timeline locked. */
function lockedIn(state: GameState, playerId: string): GameState {
    const timeline = state.timelines[playerId].map((entry) =>
        entry.kind === 'card' ? { ...entry, locked: true } : entry,
    )
    return { ...state, timelines: { ...state.timelines, [playerId]: timeline } }
}

const refuse = (refusal: GameRefusalCode): ApplyResult => ({ ok: false, refusal })
const succeed = (state: GameState): ApplyResult => ({ ok: true, state })

/**
 * A misplaced card ends the active player's plays and loses their unlocked cards, which leave the
 * game. The card passes round the table to steal, starting on the active player's left.
 */
function misplaced(state: GameState, activeId: string): GameState {
    const timeline = state.timelines[activeId].filter(
        (entry) => entry.kind === 'anchor' || entry.locked,
    )
    return toNextStealer(
        { ...state, timelines: { ...state.timelines, [activeId]: timeline } },
        activeId,
    )
}

/**
 * The misplaced card goes to the next stealer after `from` (or to the first, without one): the
 * players in seating order from the active player's left, the reader last. With nobody left, it
 * is discarded with its date revealed and the player after the active one is up.
 */
function toNextStealer(state: GameState, activeId: string, from?: string): GameState {
    if (state.phase.name !== 'playing' || state.phase.play.step === 'picking') {
        throw new Error('Only a dealt card can be stolen.')
    }
    const { readerId, draw, cardId } = state.phase.play
    const others = startingFrom(state.seating, activeId).slice(1)
    const order = [...others.filter((id) => id !== readerId), readerId]
    const stealerId = order[from === undefined ? 0 : order.indexOf(from) + 1]
    if (stealerId === undefined) {
        const next: GameState = {
            ...state,
            discards: [...state.discards, cardId],
            log: [...state.log, { kind: 'discard', cardId }],
        }
        return endTurn(next, activeId)
    }
    return {
        ...state,
        phase: {
            name: 'playing',
            activeId,
            play: { step: 'stealing', readerId, draw, cardId, stealerId },
        },
    }
}
