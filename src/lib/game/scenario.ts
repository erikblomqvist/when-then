// The scenario builder (ADR 0004, spec #89): a moment in a game described as a flat recipe, and
// reached by playing the real machine against the synthetic deck, choosing slots on purpose. A
// recipe the rules can't reach throws, naming the field at fault; it's never clamped.
//
//     scenario().players(2).step('deciding').viewer(2).build()

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
    step: ScenarioStep
    /** The player whose phone the view is for; null for the active player. */
    viewer: number | null
}

export const defaultRecipe: Recipe = { seed: 1, players: 2, step: 'placing', viewer: null }

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
    step: (step: ScenarioStep) => scenario({ ...recipe, step }),
    viewer: (viewer: number) => scenario({ ...recipe, viewer }),
    build: () => buildScenario(recipe),
})

/** Play the real game to the moment `recipe` describes. Throws a `ScenarioError` if it can't. */
export function buildScenario(recipe: Recipe): Scenario {
    const { seed, players, step, viewer } = recipe
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
        throw new ScenarioError('seed', 'a whole number from 0 to 4294967295')
    }
    if (!Number.isInteger(players) || players < 2 || players > maxPlayers) {
        throw new ScenarioError('players', `a game has 2 to ${maxPlayers} players`)
    }
    // Seating (#91) is what lets more than two players start.
    if (players > 2) throw new ScenarioError('players', 'only 2 players can be built so far')
    if (!scenarioSteps.includes(step)) {
        throw new ScenarioError('step', `one of ${scenarioSteps.join(', ')}`)
    }
    if (viewer !== null && (!Number.isInteger(viewer) || viewer < 1 || viewer > players)) {
        throw new ScenarioError('viewer', `there is no player ${viewer}`)
    }

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

    if (step === 'deciding') {
        const { activeId, cardId } = playing(state, 'step')
        const slot = correctSlot(state.timelines[activeId], state.cards[cardId].date)
        play({ type: 'place', by: activeId, slot }, 'step')
    }

    const seat = viewer === null ? playing(state, 'viewer').activeId : ids[viewer - 1]
    return { recipe, state, view: redact(state, seat) }
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

function check(state: GameState) {
    const problems = invariantProblems(state)
    if (problems.length > 0) throw new Error(`Broken game state: ${problems.join('; ')}`)
}
