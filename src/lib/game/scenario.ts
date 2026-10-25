// The scenario builder (ADR 0004, spec #89): a moment in a game described as a flat recipe, and
// reached by playing the real machine against the synthetic deck, choosing slots on purpose. A
// recipe the rules can't reach throws, naming the field at fault; it's never clamped.
//
//     scenario().players(4).activePlayer(2).unlocked(2).scores([7, 9, 10, 3]).misplace().build()

import { apply, create, type Command } from './machine'
import { invariantProblems } from './invariants'
import { maxPlayers, playerIcons } from './player'
import { startingFrom } from './seating'
import { defaultTargetScore, isTargetScore, maxTargetScore, minTargetScore } from './settings'
import {
    categoriesLeft,
    fits,
    holdingUp,
    pickerOf,
    score,
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
 * misplaces the card in play, the current stealer misses or steals it, the host skips an absent
 * player holding up play, or the host ends the game early.
 */
export const helperSteps = ['misplace', 'missedSteal', 'correctSteal', 'skip', 'endEarly'] as const
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
    /** The target score. */
    target: number
    /**
     * Each player's score once the step is reached, before the helper steps; null for whatever
     * the turns on the way leave, mostly none. Any score takes a scoring round first, so the
     * moment is in the second round or later.
     */
    scores: number[] | null
    /** Played after the step is reached, in order. */
    helpers: HelperStep[]
    /**
     * The player whose phone the view is for; null for the active player, or once the game is
     * over, the player who was active last.
     */
    viewer: number | null
    /**
     * The players not at the table. Absence isn't part of the rules, so it's only an overlay
     * beside the state and the view, as a phone adds it from presence; `skip` acts on it.
     */
    absent: number[]
    /**
     * The players the host removed, while the table was still being seated: they keep their
     * numbers, listed as removed, with no seat or timeline. Never the host, player 1.
     */
    removed: number[]
}

export const defaultRecipe: Recipe = {
    seed: 1,
    players: 2,
    activePlayer: null,
    step: 'placing',
    unlocked: null,
    target: defaultTargetScore,
    scores: null,
    helpers: [],
    viewer: null,
    absent: [],
    removed: [],
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

/**
 * How one recipe field is spelled as a URL query parameter. `decode` returns the value, or a
 * `ParamProblem` saying why the text is malformed.
 */
type ParamCodec<T> = { encode: (value: T) => string; decode: (text: string) => T | ParamProblem }

class ParamProblem {
    constructor(readonly reason: string) {}
}

const numberParam: ParamCodec<number> = {
    encode: String,
    // Any decimal, so a recipe the builder will refuse (2.5 players) still round-trips and gets
    // the builder's error, naming its field.
    decode: (text) =>
        /^-?\d+(\.\d+)?(e[+-]?\d+)?$/.test(text)
            ? Number(text)
            : new ParamProblem(`a number, not "${text}"`),
}

const optionParam = <T extends string>(options: readonly T[]): ParamCodec<T> => ({
    encode: (value) => value,
    decode: (text) =>
        options.includes(text as T)
            ? (text as T)
            : new ParamProblem(`one of ${options.join(', ')}, not "${text}"`),
})

/** A comma-separated list; an empty parameter is an empty list. */
const listParam = <T>(item: ParamCodec<T>): ParamCodec<T[]> => ({
    encode: (values) => values.map(item.encode).join(','),
    decode: (text) => {
        if (text === '') return []
        const values = text.split(',').map(item.decode)
        return values.find((value) => value instanceof ParamProblem) ?? (values as T[])
    },
})

/** `none` for null. */
const nullableParam = <T>(codec: ParamCodec<T>): ParamCodec<T | null> => ({
    encode: (value) => (value === null ? 'none' : codec.encode(value)),
    decode: (text) => (text === 'none' ? null : codec.decode(text)),
})

/**
 * Each recipe field as a query parameter of its own name. A new field needs its spelling here;
 * `recipeToParams` and `recipeFromParams` then carry it as they are.
 */
const recipeParams: { [K in keyof Recipe]-?: ParamCodec<Recipe[K]> } = {
    seed: numberParam,
    players: numberParam,
    activePlayer: nullableParam(numberParam),
    step: optionParam(scenarioSteps),
    unlocked: nullableParam(numberParam),
    target: numberParam,
    scores: nullableParam(listParam(numberParam)),
    helpers: listParam(optionParam(helperSteps)),
    viewer: nullableParam(numberParam),
    absent: listParam(numberParam),
    removed: listParam(numberParam),
}

/** A query parameter that isn't a recipe field, or is malformed. `param` is its name. */
export class RecipeParamError extends Error {
    constructor(
        readonly param: string,
        reason: string,
    ) {
        super(`${param}: ${reason}`)
        this.name = new.target.name
    }
}

const recipeFields = Object.keys(recipeParams) as (keyof Recipe)[]

/** `recipe` as URL query parameters, leaving out the fields at their defaults. */
export function recipeToParams(recipe: Recipe): URLSearchParams {
    const params = new URLSearchParams()
    for (const field of recipeFields) {
        const codec = recipeParams[field] as ParamCodec<Recipe[typeof field]>
        const text = codec.encode(recipe[field])
        if (text !== codec.encode(defaultRecipe[field])) params.set(field, text)
    }
    return params
}

/**
 * The recipe in `params`, with the defaults for the fields left out. Throws a
 * `RecipeParamError` for a parameter that isn't a recipe field, is given twice, or is malformed.
 * Whether the rules can reach the recipe is for `buildScenario` to say.
 */
export function recipeFromParams(params: URLSearchParams): Recipe {
    const recipe: Record<string, unknown> = { ...defaultRecipe }
    for (const param of new Set(params.keys())) {
        if (!recipeFields.includes(param as keyof Recipe)) {
            throw new RecipeParamError(
                param,
                `not a recipe field; one of ${recipeFields.join(', ')}`,
            )
        }
        const texts = params.getAll(param)
        if (texts.length > 1) throw new RecipeParamError(param, 'given more than once')
        const value = recipeParams[param as keyof Recipe].decode(texts[0])
        if (value instanceof ParamProblem) throw new RecipeParamError(param, value.reason)
        recipe[param] = value
    }
    return recipe as Recipe
}

/** A built recipe: the full state, the view for the viewer's seat, and who is absent. */
export type Scenario = { recipe: Recipe; state: GameState; view: SeatView; absent: string[] }

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
    target: (target: number) => scenario({ ...recipe, target }),
    scores: (scores: number[]) => scenario({ ...recipe, scores }),
    misplace: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'misplace'] }),
    missedSteal: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'missedSteal'] }),
    correctSteal: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'correctSteal'] }),
    skip: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'skip'] }),
    endEarly: () => scenario({ ...recipe, helpers: [...recipe.helpers, 'endEarly'] }),
    absent: (absent: number[]) => scenario({ ...recipe, absent }),
    removed: (removed: number[]) => scenario({ ...recipe, removed }),
    viewer: (viewer: number) => scenario({ ...recipe, viewer }),
    build: () => buildScenario(recipe),
})

/** Play the real game to the moment `recipe` describes. Throws a `ScenarioError` if it can't. */
export function buildScenario(recipe: Recipe): Scenario {
    const {
        seed,
        players,
        activePlayer,
        step,
        unlocked,
        target,
        scores,
        helpers,
        viewer,
        absent,
        removed,
    } = recipe
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
    if (!isTargetScore(target)) {
        throw new ScenarioError(
            'target',
            `a whole number from ${minTargetScore} to ${maxTargetScore}`,
        )
    }
    if (
        scores !== null &&
        (scores.length !== players || !scores.every((n) => Number.isInteger(n) && n >= 0))
    ) {
        throw new ScenarioError('scores', `${players} whole numbers from 0, one per player`)
    }
    for (const helper of helpers) {
        if (!helperSteps.includes(helper)) {
            throw new ScenarioError('helpers', `one of ${helperSteps.join(', ')}, not ${helper}`)
        }
    }
    checkPlayerNumber('viewer', viewer, players)
    checkPlayerList('absent', absent, players)
    checkPlayerList('removed', removed, players)
    if (removed.includes(1)) throw new ScenarioError('removed', 'the host, player 1, stays')
    if (players - removed.length < 2) {
        throw new ScenarioError('removed', 'a game plays on with at least two players left')
    }
    if (activePlayer !== null && removed.includes(activePlayer)) {
        throw new ScenarioError('activePlayer', `player ${activePlayer} is removed`)
    }
    const absentRemoved = absent.find((n) => removed.includes(n))
    if (absentRemoved !== undefined) {
        throw new ScenarioError('absent', `player ${absentRemoved} is removed, not absent`)
    }
    const scoringRemoved = removed.find((n) => (scores?.[n - 1] ?? 0) > 0)
    if (scoringRemoved !== undefined) {
        throw new ScenarioError('scores', `player ${scoringRemoved} is removed and scores nothing`)
    }

    const ids = names.slice(0, players).map((name) => name.toLowerCase())
    let state = create({
        players: ids.map((id, i) => ({
            id,
            name: names[i],
            icon: playerIcons[i],
            host: i === 0,
        })),
        settings: { targetScore: target, exactYear: false, cardLanguage: 'en' },
        seating: ids,
        // Waiting for a choice can take many turns, since continuing until one comes would add
        // unlocked cards: enough copies of the deck that it doesn't run dry first, and more for
        // the scores.
        cards: syntheticDeck(
            seed,
            'en',
            2 * players +
                Math.ceil(
                    (scores ?? []).reduce((sum, n) => sum + n, 0) /
                        syntheticDeck(seed, 'en').length,
                ),
        ),
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

    // Players sit in their numbered order; the host removes anyone to remove, then confirms it.
    for (const n of removed) play({ type: 'remove', by: ids[0], playerId: ids[n - 1] }, 'removed')
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

    /** The active player places the card in play correctly, as a choice picks the first category. */
    const correctPlay = (field: keyof Recipe) => {
        const { activeId, cardId } = dealt(field)
        const slot = correctSlot(state.timelines[activeId], state.cards[cardId].date)
        play({ type: 'place', by: activeId, slot }, field)
    }

    /** The active player's turn: `points` correct plays, locked in. */
    const scoringTurn = (points: number) => {
        const { activeId } = playing(state, 'scores')
        for (let i = 0; i < points; i++) {
            if (i > 0) play({ type: 'continue', by: activeId }, 'scores')
            correctPlay('scores')
        }
        play({ type: 'lockIn', by: activeId }, 'scores')
    }

    /** The active player's turn: a misplaced card, missed by every stealer before `stealer`. */
    const stolenTurn = (stealer: string) => {
        const { activeId, cardId } = dealt('scores')
        const date = state.cards[cardId].date
        const noSlot = () => new ScenarioError('seed', 'a card fits every gap; try another seed')
        const slot = wrongSlot(state.timelines[activeId], date)
        if (slot === undefined) throw noSlot()
        play({ type: 'place', by: activeId, slot }, 'scores')
        for (;;) {
            const current = playing(state, 'scores')
            if (current.step !== 'stealing') throw new Error('The misplaced card is not stolen.')
            const timeline = state.timelines[current.stealerId]
            const slot =
                current.stealerId === stealer
                    ? correctSlot(timeline, date)
                    : wrongSlot(timeline, date)
            if (slot === undefined) throw noSlot()
            play({ type: 'steal', by: current.stealerId, slot }, 'scores')
            if (current.stealerId === stealer) return
        }
    }

    const choice = step === 'readersChoice' || step === 'freeChoice' ? step : null
    const chosen = activePlayer === null ? null : ids[activePlayer - 1]

    // Scores come from real turns. A first round gives each player theirs up to one below the
    // target, since a round can't end with anyone at it; the round the moment is in gives the
    // rest. A player who has had their turn in it scores the rest in that turn. One still to
    // play can only get there by stealing: a point from each earlier turn of a player with
    // nothing more to score, who misplaces their card.
    const turns = new Map<string, () => void>()
    if (scores !== null) {
        const round = startingFrom(state.seating, state.startingPlayerId!)
        const base = scores.map((n) => Math.min(n, target - 1))
        if (base.some((n) => n > 0)) {
            for (const id of round) {
                const points = base[ids.indexOf(id)]
                if (points > 0) scoringTurn(points)
                else turnPlayed('scores')
            }
        }
        const pointsThisRound = (id: string) => scores[ids.indexOf(id)] - base[ids.indexOf(id)]
        if (ids.some((id) => pointsThisRound(id) > 0) && chosen === null) {
            throw new ScenarioError(
                'scores',
                'nobody is at the target when a round opens; name an active player later in it',
            )
        }
        const played = chosen === null ? [] : round.slice(0, round.indexOf(chosen))
        const stealers = round
            .filter((id) => !played.includes(id))
            .flatMap((id) => Array.from({ length: pointsThisRound(id) }, () => id))
        const stolenFrom = played.filter((id) => pointsThisRound(id) === 0)
        if (stealers.length > stolenFrom.length) {
            throw new ScenarioError(
                'scores',
                `players still to play this round need ${stealers.length} steals to be at or above ` +
                    `the target, and the turns before theirs from the starting player give ` +
                    `${stolenFrom.length}`,
            )
        }
        for (const id of played) {
            if (pointsThisRound(id) > 0) turns.set(id, () => scoringTurn(pointsThisRound(id)))
        }
        stealers.forEach((stealer, i) => turns.set(stolenFrom[i], () => stolenTurn(stealer)))
    }

    // Real turns until it's the chosen player's, with their unlocked cards played, drawing the
    // chosen choice, or with a card they can misplace. A turn that doesn't get there is played
    // out and the table goes round again; with turns that score on the way, the round is played
    // again from its start a round later, so they still come in the round the moment is in.
    const field = choice === null ? 'activePlayer' : 'step'
    // Correct plays before the one the recipe stops in; at the lock-in choice, that one counts.
    const earlier = Math.max(0, (unlocked ?? 0) - (step === 'deciding' ? 1 : 0))
    let roundStart = state
    for (;;) {
        const { activeId } = playing(state, field)
        if (chosen !== null && activeId !== chosen) {
            const turn = turns.get(activeId)
            if (turn) turn()
            else turnPlayed(field)
            continue
        }
        for (let i = 0; i < earlier; i++) {
            correctPlay('unlocked')
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
        if (turns.size === 0) {
            turnPlayed(field)
            continue
        }
        state = roundStart
        for (let i = 0; i < state.seating.length; i++) turnPlayed(field)
        roundStart = state
    }

    if (step === 'placing' || step === 'deciding') {
        const { activeId, cardId } = dealt('step')
        if (step === 'deciding') {
            const slot = correctSlot(state.timelines[activeId], state.cards[cardId].date)
            play({ type: 'place', by: activeId, slot }, 'step')
        }
    }

    if (scores !== null) {
        ids.forEach((id, i) => {
            if (score(state, id) !== scores[i]) {
                throw new ScenarioError(
                    'seed',
                    `player ${i + 1} has ${score(state, id)}, not ${scores[i]}; try another seed`,
                )
            }
        })
    }

    const absentIds = absent.map((n) => ids[n - 1])
    let lastActive = playing(state, 'step').activeId
    for (const helper of helpers) {
        const current = playing(state, 'helpers')
        lastActive = current.activeId
        if (helper === 'endEarly') {
            play({ type: 'endEarly', by: ids[0] }, 'helpers')
            continue
        }
        if (helper === 'skip') {
            // The first absent player holding up play: an absent active player before the
            // reader, as a new reader wouldn't help them.
            const { activeId, ...rest } = current
            const playerId = holdingUp(rest, activeId)
                .map((held) => held.playerId)
                .find((id) => absentIds.includes(id))
            if (playerId === undefined) {
                throw new ScenarioError(
                    'helpers',
                    `skip needs an absent player holding up play at ${current.step}; name them in absent`,
                )
            }
            play({ type: 'skip', by: ids[0], playerId }, 'helpers')
            continue
        }
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

    const seat =
        viewer !== null
            ? ids[viewer - 1]
            : state.phase.name === 'playing'
              ? state.phase.activeId
              : lastActive
    return { recipe, state, view: redact(state, seat), absent: absentIds }
}

/** An error on `field` unless `n` is null or numbers one of the `players`. */
function checkPlayerNumber(
    field: 'activePlayer' | 'viewer' | 'absent' | 'removed',
    n: number | null,
    players: number,
) {
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > players)) {
        throw new ScenarioError(field, `there is no player ${n}`)
    }
}

/** An error on `field` unless `list` numbers players of the `players`, each once. */
function checkPlayerList(field: 'absent' | 'removed', list: number[], players: number) {
    for (const n of list) checkPlayerNumber(field, n, players)
    if (new Set(list).size !== list.length) {
        throw new ScenarioError(field, 'names each player once')
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
