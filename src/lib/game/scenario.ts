// The scenario builder (ADR 0004, spec #89): a moment in a game described as a flat recipe, and
// reached by playing the real machine against the synthetic deck, choosing slots on purpose. A
// recipe the rules can't reach throws, naming the field at fault; it's never clamped.
//
//     scenario().players(4).activePlayer(2).unlocked(2).misplace().missedSteal().viewer(1).build()

import { apply, create, type Command } from './machine'
import { invariantProblems } from './invariants'
import { maxPlayers, playerIcons } from './player'
import { defaultTargetScore } from './settings'
import {
    categoriesLeft,
    fits,
    pickerOf,
    type GameDate,
    type GameState,
    type TimelineEntry,
} from './state'
import { syntheticDeck } from './synthetic-deck'
import { redact, type SeatView } from './view'

/**
 * The steps of a play a recipe can stop at so far: a Reader's or Free choice waiting for its
 * category, the card waiting to be placed, the lock-in choice after a correct play, or the first
 * stealer's go at a misplaced card.
 */
export const scenarioSteps = [
    'readersChoice',
    'freeChoice',
    'placing',
    'deciding',
    'stealing',
] as const
export type ScenarioStep = (typeof scenarioSteps)[number]

/**
 * Exact moves a recipe plays, in order, once it has reached its step: the active player
 * misplaces the card in play, or the current stealer misses or steals it.
 */
export const helperSteps = ['misplace', 'missedSteal', 'correctSteal'] as const
export type HelperStep = (typeof helperSteps)[number]

/** A moment in a game, flat and serialisable. Players are numbered from 1 in seating order. */
export type Recipe = {
    seed: number
    players: number
    /**
     * The player whose turn it is; null for whoever the seed picks to start, or on a choice
     * step, whoever is first to draw that choice.
     */
    activePlayer: number | null
    step: ScenarioStep
    /**
     * The active player's unlocked cards: the turn's earlier correct plays, and at the lock-in
     * choice the card just placed. Null for the fewest the step allows: none, or that one card.
     */
    unlocked: number | null
    /** Played after the step is reached, in order. */
    helpers: HelperStep[]
    /** The player whose phone the view is for; null for the active player. */
    viewer: number | null
}

export const defaultRecipe: Recipe = {
    seed: 1,
    players: 2,
    activePlayer: null,
    step: 'placing',
    unlocked: null,
    helpers: [],
    viewer: null,
}

/** A recipe the rules can't reach. `field` is the recipe field at fault. */
export class ScenarioError extends Error {
    constructor(
        readonly field: keyof Recipe,
        reason: string,
    ) {
        super(`${field}: ${reason}`)
        this.name = new.target.name
    }
}

/** A built recipe: the full state, and the view for the viewer's seat. */
export type Scenario = { recipe: Recipe; state: GameState; view: SeatView }

const names = [
    'Astrid',
    'Björn',
    'Cecilia',
    'Dag',
    'Eira',
    'Frej',
    'Greta',
    'Hugo',
    'Ines',
    'Jonas',
]

/** Scenarios are dated as if played in this year, so they never change with the clock. */
const currentYear = 2026

/** A fluent way to write a recipe. Each call returns a new builder. */
export const scenario = (recipe: Recipe = defaultRecipe) => ({
    recipe,
    seed: (seed: number) => scenario({ ...recipe, seed }),
    players: (players: number) => scenario({ ...recipe, players }),
    activePlayer: (activePlayer: number) => scenario({ ...recipe, activePlayer }),
    step: (step: ScenarioStep) => scenario({ ...recipe, step }),
    unlocked: (unlocked: number) => scenario({ ...recipe, unlocked }),
    misplace: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'misplace'] }),
    missedSteal: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'missedSteal'] }),
    correctSteal: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'correctSteal'] }),
    viewer: (viewer: number) => scenario({ ...recipe, viewer }),
    build: () => buildScenario(recipe),
})

/** Play the real game to the moment `recipe` describes. Throws a `ScenarioError` if it can't. */
export function buildScenario(recipe: Recipe): Scenario {
    const { seed, players, activePlayer, step, unlocked, helpers, viewer } = recipe
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new ScenarioError('seed', 'a whole number from 0 to 4294967295')
    }
    if (!Number.isInteger(players) || players < 2 || players > maxPlayers) {
        throw new ScenarioError('players', `a game has 2 to ${maxPlayers} players`)
    }
    checkPlayerNumber('activePlayer', activePlayer, players)
    if (!scenarioSteps.includes(step)) {
        throw new ScenarioError('step', `one of ${scenarioSteps.join(', ')}`)
    }
    if (unlocked !== null && (!Number.isInteger(unlocked) || unlocked < 0)) {
        throw new ScenarioError('unlocked', 'a whole number from 0')
    }
    if (step === 'deciding' && unlocked === 0) {
        throw new ScenarioError(
            'unlocked',
            'at the lock-in choice the card just placed is unlocked',
        )
    }
    if (step === 'stealing' && unlocked !== null && unlocked > 0) {
        throw new ScenarioError(
            'unlocked',
            'a misplaced card loses the unlocked cards; stop at placing and misplace instead',
        )
    }
    for (const helper of helpers) {
        if (!helperSteps.includes(helper)) {
            throw new ScenarioError('helpers', `one of ${helperSteps.join(', ')}, not ${helper}`)
        }
    }
    checkPlayerNumber('viewer', viewer, players)

    const ids = names.slice(0, players).map((name) => name.toLowerCase())
    let state = create({
        players: ids.map((id, i) => ({
            id,
            name: names[i],
            icon: playerIcons[i],
            host: i === 0,
        })),
        settings: { targetScore: defaultTargetScore, exactYear: false, cardLanguage: 'en' },
        seating: ids,
        // Waiting for a choice can take many turns, since continuing until one comes would add
        // unlocked cards: enough copies of the deck that it doesn't run dry first.
        cards: syntheticDeck(seed, 'en', 2 * players),
        seed,
        currentYear,
    })
    check(state)

    const play = (command: Command, field: keyof Recipe) => {
        const result = apply(state, command)
        if (!result.ok) throw new ScenarioError(field, `refused: ${result.refusal}`)
        state = result.state
        check(state)
    }

    // Players sit in their numbered order; the host, player 1, confirms it.
    if (state.phase.name === 'seating') {
        play({ type: 'confirmSeating', by: ids[0], currentYear }, 'players')
    }

    /** The play in progress with its card dealt; a choice picks the first category left. */
    const dealt = (field: keyof Recipe) => {
        const current = playing(state, field)
        if (current.step === 'picking') {
            const by = pickerOf(current.draw, current.activeId, current.readerId)
            play({ type: 'pickCategory', by, category: categoriesLeft(state)[0] }, field)
        }
        const next = playing(state, field)
        if (next.step === 'picking') throw new Error('Picking a category dealt no card.')
        return next
    }

    /** Every stealer misses where they can; a card that fits every gap of theirs is stolen. */
    const stealsPlayed = (field: keyof Recipe) => {
        for (;;) {
            const current = playing(state, field)
            if (current.step !== 'stealing') return
            const timeline = state.timelines[current.stealerId]
            const date = state.cards[current.cardId].date
            const slot = wrongSlot(timeline, date) ?? correctSlot(timeline, date)
            play({ type: 'steal', by: current.stealerId, slot }, field)
        }
    }

    /**
     * The active player's turn ends with a card: misplaced where it can be, leaving the scores
     * alone, and every steal missed. A card that fits every gap scores, as it's locked in.
     */
    const turnPlayed = (field: keyof Recipe) => {
        const current = playing(state, field)
        if (current.step !== 'deciding') {
            const { activeId, cardId } = dealt(field)
            const timeline = state.timelines[activeId]
            const date = state.cards[cardId].date
            const wrong = wrongSlot(timeline, date)
            play({ type: 'place', by: activeId, slot: wrong ?? correctSlot(timeline, date) }, field)
            if (wrong !== undefined) return stealsPlayed(field)
        }
        play({ type: 'lockIn', by: current.activeId }, field)
    }

    // Real turns until it's the chosen player's, with their unlocked cards played, drawing the
    // chosen choice, or with a card they can misplace. A turn that doesn't get there is played
    // out and the table goes round again.
    const choice = step === 'readersChoice' || step === 'freeChoice' ? step : null
    const target = activePlayer === null ? null : ids[activePlayer - 1]
    const field = choice === null ? 'activePlayer' : 'step'
    // Correct plays before the one the recipe stops in; at the lock-in choice, that one counts.
    const earlier = Math.max(0, (unlocked ?? 0) - (step === 'deciding' ? 1 : 0))
    for (;;) {
        const { activeId } = playing(state, field)
        if (target !== null && activeId !== target) {
            turnPlayed(field)
            continue
        }
        for (let i = 0; i < earlier; i++) {
            const { cardId } = dealt('unlocked')
            const slot = correctSlot(state.timelines[activeId], state.cards[cardId].date)
            play({ type: 'place', by: activeId, slot }, 'unlocked')
            play({ type: 'continue', by: activeId }, 'unlocked')
        }
        if (choice !== null) {
            if (playing(state, field).draw.kind === choice) break
        } else if (step !== 'stealing') {
            break
        } else {
            const { cardId } = dealt(field)
            const wrong = wrongSlot(state.timelines[activeId], state.cards[cardId].date)
            if (wrong !== undefined) {
                play({ type: 'place', by: activeId, slot: wrong }, 'step')
                break
            }
        }
        turnPlayed(field)
    }

    if (step === 'placing' || step === 'deciding') {
        const { activeId, cardId } = dealt('step')
        if (step === 'deciding') {
            const slot = correctSlot(state.timelines[activeId], state.cards[cardId].date)
            play({ type: 'place', by: activeId, slot }, 'step')
        }
    }

    for (const helper of helpers) {
        const current = playing(state, 'helpers')
        if (helper === 'misplace') {
            if (current.step !== 'placing') {
                throw new ScenarioError(
                    'helpers',
                    `misplace needs a card to place, not ${current.step}`,
                )
            }
            const slot = wrongSlot(
                state.timelines[current.activeId],
                state.cards[current.cardId].date,
            )
            if (slot === undefined) {
                throw new ScenarioError(
                    'helpers',
                    'misplace: the card fits every gap; try another seed',
                )
            }
            play({ type: 'place', by: current.activeId, slot }, 'helpers')
            continue
        }
        if (current.step !== 'stealing') {
            throw new ScenarioError(
                'helpers',
                `${helper} needs a card being stolen, not ${current.step}`,
            )
        }
        const timeline = state.timelines[current.stealerId]
        const date = state.cards[current.cardId].date
        const slot =
            helper === 'correctSteal' ? correctSlot(timeline, date) : wrongSlot(timeline, date)
        if (slot === undefined) {
            throw new ScenarioError(
                'helpers',
                `${helper}: the card fits every gap; try another seed`,
            )
        }
        play({ type: 'steal', by: current.stealerId, slot }, 'helpers')
    }

    const seat = viewer === null ? playing(state, 'viewer').activeId : ids[viewer - 1]
    return { recipe, state, view: redact(state, seat) }
}

/** An error on `field` unless `n` is null or numbers one of the `players`. */
function checkPlayerNumber(field: 'activePlayer' | 'viewer', n: number | null, players: number) {
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > players)) {
        throw new ScenarioError(field, `there is no player ${n}`)
    }
}

/** The play in progress, or an error on `field` when the game isn't being played. */
function playing(state: GameState, field: keyof Recipe) {
    if (state.phase.name !== 'playing') {
        throw new ScenarioError(field, `the game is ${state.phase.name}, not playing`)
    }
    return { activeId: state.phase.activeId, ...state.phase.play }
}

/** The first gap where `date` fits. A timeline in date order always has one. */
function correctSlot(timeline: TimelineEntry[], date: GameDate) {
    let slot = 0
    while (!fits(timeline, slot, date)) slot++
    return slot
}

/** A gap where `date` doesn't fit, if the timeline has one. */
function wrongSlot(timeline: TimelineEntry[], date: GameDate) {
    for (let slot = 0; slot <= timeline.length; slot++) if (!fits(timeline, slot, date)) return slot
    return undefined
}

function check(state: GameState) {
    const problems = invariantProblems(state)
    if (problems.length > 0) throw new Error(`Broken game state: ${problems.join('; ')}`)
}
