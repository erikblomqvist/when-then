// The scenario builder (ADR 0004, spec #89): a moment in a game described as a flat recipe, and
// reached by playing the real machine against the synthetic deck, choosing slots on purpose. A
// recipe the rules can't reach throws, naming the field at fault; it's never clamped.
//
//     scenario().players(4).activePlayer(2).step('deciding').viewer(1).build()

import { apply, create, type Command } from './machine'
import { invariantProblems } from './invariants'
import { maxPlayers, playerIcons } from './player'
import { defaultTargetScore } from './settings'
import { fits, type GameDate, type GameState, type TimelineEntry } from './state'
import { syntheticDeck } from './synthetic-deck'
import { redact, type SeatView } from './view'

/** The steps of a play a recipe can stop at so far. */
export const scenarioSteps = ['placing', 'deciding'] as const
export type ScenarioStep = (typeof scenarioSteps)[number]

/** A moment in a game, flat and serialisable. Players are numbered from 1 in seating order. */
export type Recipe = {
    seed: number
    players: number
    /** The player whose turn it is; null for whoever the seed picks to start. */
    activePlayer: number | null
    step: ScenarioStep
    /** The player whose phone the view is for; null for the active player. */
    viewer: number | null
}

export const defaultRecipe: Recipe = {
    seed: 1,
    players: 2,
    activePlayer: null,
    step: 'placing',
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
    viewer: (viewer: number) => scenario({ ...recipe, viewer }),
    build: () => buildScenario(recipe),
})

/** Play the real game to the moment `recipe` describes. Throws a `ScenarioError` if it can't. */
export function buildScenario(recipe: Recipe): Scenario {
    const { seed, players, activePlayer, step, viewer } = recipe
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
        cards: syntheticDeck(seed, 'en'),
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

    // Real turns, one card each, until it's the chosen player's. Each misplaces when it can, to
    // leave the scores alone; a card that fits every gap scores, as it's placed and locked in.
    if (activePlayer !== null) {
        const target = ids[activePlayer - 1]
        for (;;) {
            const { activeId, cardId } = playing(state, 'activePlayer')
            if (activeId === target) break
            const timeline = state.timelines[activeId]
            const date = state.cards[cardId].date
            const wrong = wrongSlot(timeline, date)
            const slot = wrong ?? correctSlot(timeline, date)
            play({ type: 'place', by: activeId, slot }, 'activePlayer')
            if (wrong === undefined) play({ type: 'lockIn', by: activeId }, 'activePlayer')
        }
    }

    if (step === 'deciding') {
        const { activeId, cardId } = playing(state, 'step')
        const slot = correctSlot(state.timelines[activeId], state.cards[cardId].date)
        play({ type: 'place', by: activeId, slot }, 'step')
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
