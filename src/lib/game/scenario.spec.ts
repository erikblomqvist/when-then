import { describe, expect, it } from 'vite-plus/test'
import { isDecade } from '../cards/date-parts'
import { invariantProblems } from './invariants'
import { buildScenario, scenario, ScenarioError, type Recipe } from './scenario'
import { leftOf } from './seating'
import { score, type GameState } from './state'
import { syntheticCategories, syntheticDeck } from './synthetic-deck'

const playOf = (state: GameState) => {
    if (state.phase.name !== 'playing') throw new Error(`The game is ${state.phase.name}.`)
    return { activeId: state.phase.activeId, ...state.phase.play }
}

/** The play in progress with its card dealt, failing the test while a category waits. */
const dealtPlay = (state: GameState) => {
    const play = playOf(state)
    if (play.step === 'picking') throw new Error('The play is waiting for a category.')
    return play
}

describe('building a two-player scenario', () => {
    it('stops with the card waiting to be placed', () => {
        const { state, view } = scenario().players(2).step('placing').build()
        const { activeId, step } = playOf(state)
        expect(step).toBe('placing')
        expect(state.timelines[activeId]).toHaveLength(1)
        // Seen from the active player by default.
        expect(view.seat).toBe(activeId)
    })

    it('stops at the lock-in choice after a correct play', () => {
        const { state } = scenario().players(2).step('deciding').build()
        const { activeId, cardId, step } = dealtPlay(state)
        expect(step).toBe('deciding')
        expect(state.timelines[activeId]).toContainEqual(
            expect.objectContaining({ kind: 'card', cardId, locked: false }),
        )
    })

    it('shows the moment from the chosen player', () => {
        const { state, view } = scenario().step('placing').viewer(2).build()
        expect(view.seat).toBe('björn')
        expect(state.seating).toEqual(['astrid', 'björn'])
    })

    it('reaches the same state every time, and another with another seed', () => {
        expect(scenario().seed(5).step('deciding').build().state).toEqual(
            scenario().seed(5).step('deciding').build().state,
        )
        expect(scenario().seed(5).build().state).not.toEqual(scenario().seed(6).build().state)
    })

    it('is a flat recipe that survives JSON', () => {
        const { recipe } = scenario().seed(9).step('deciding').viewer(1)
        const copy: Recipe = JSON.parse(JSON.stringify(recipe))
        expect(copy).toEqual({
            seed: 9,
            players: 2,
            activePlayer: null,
            step: 'deciding',
            unlocked: null,
            target: 10,
            scores: null,
            helpers: [],
            viewer: 1,
            absent: [],
            removed: [],
        })
        expect(buildScenario(copy).state).toEqual(buildScenario(recipe).state)
    })
})

describe('building a scenario for 3 to 10 players', () => {
    const counts = Array.from({ length: 9 }, (_, i) => i + 2)

    it('confirms the seating and starts play for every number of players', () => {
        for (const players of counts) {
            const { state } = scenario().players(players).build()
            expect(state.seating).toHaveLength(players)
            expect(Object.keys(state.timelines)).toHaveLength(players)
            expect(playOf(state).step).toBe('placing')
        }
    })

    it('reaches every active player, read by the player on their right', () => {
        for (const players of counts) {
            for (let k = 1; k <= players; k++) {
                for (const step of ['placing', 'deciding'] as const) {
                    const { state, view } = scenario()
                        .players(players)
                        .activePlayer(k)
                        .step(step)
                        .build()
                    const { activeId, readerId } = playOf(state)
                    expect(activeId).toBe(state.seating[k - 1])
                    expect(readerId).toBe(state.seating[(k - 2 + players) % players])
                    expect(playOf(state).step).toBe(step)
                    expect(view.seat).toBe(activeId)
                }
            }
        }
    })

    it('gets there by playing real turns, in seating order', () => {
        const { state } = scenario().seed(3).players(5).build()
        const start = state.seating.indexOf(playOf(state).activeId)
        const twoTurnsOn = ((start + 2) % 5) + 1
        const { state: reached } = scenario().seed(3).players(5).activePlayer(twoTurnsOn).build()
        expect(reached.startingPlayerId).toBe(state.startingPlayerId)
        // Two turns played, a card each, and the third card in play.
        const dealt =
            Object.keys(reached.cards).length - Object.values(reached.queues).flat().length
        expect(dealt).toBe(3)
    })
})

describe("stopping at a Reader's or Free choice", () => {
    const counts = Array.from({ length: 9 }, (_, i) => i + 2)
    const kinds = ['readersChoice', 'freeChoice'] as const

    it("waits for the reader to pick on Reader's choice, and the active player on Free choice", () => {
        for (const players of counts) {
            for (const step of kinds) {
                const { state, view } = scenario().players(players).step(step).build()
                const play = playOf(state)
                expect(play).toMatchObject({ step: 'picking', draw: { kind: step } })
                if (view.phase.name !== 'playing') throw new Error('Not playing.')
                expect(view.phase.play).toMatchObject({
                    step: 'picking',
                    pickerId: step === 'readersChoice' ? play.readerId : play.activeId,
                })
            }
        }
    })

    // 108 scenarios, each searching for its setup: about 6 s, over the default 5 s.
    it('reaches either choice for every active player', { timeout: 30_000 }, () => {
        for (const players of counts) {
            for (let k = 1; k <= players; k++) {
                for (const step of kinds) {
                    const { state } = scenario().players(players).activePlayer(k).step(step).build()
                    expect(playOf(state)).toMatchObject({
                        activeId: state.seating[k - 1],
                        step: 'picking',
                        draw: { kind: step },
                    })
                }
            }
        }
    })

    it('picks a category to get past a choice on the way to placing', () => {
        const passed = Array.from({ length: 30 }, (_, i) => scenario().seed(i).build().state)
            .map(playOf)
            .filter((play) => play.draw.kind !== 'category')
        expect(passed.length).toBeGreaterThan(0)
        for (const play of passed) expect(play.step).toBe('placing')
    })
})

/** The active player's unlocked cards. */
const unlockedOf = (state: GameState) =>
    state.timelines[playOf(state).activeId].filter(
        (entry) => entry.kind === 'card' && !entry.locked,
    )

describe('unlocked cards', () => {
    it('are the turn’s earlier correct plays when a card waits to be placed', () => {
        for (const players of [2, 4, 7]) {
            for (const n of [0, 1, 3]) {
                const { state } = scenario().players(players).activePlayer(2).unlocked(n).build()
                const { activeId, step } = playOf(state)
                expect(step).toBe('placing')
                expect(activeId).toBe(state.seating[1])
                const cardIds = unlockedOf(state).map((entry) =>
                    entry.kind === 'card' ? entry.cardId : '',
                )
                expect(cardIds).toHaveLength(n)
                // The log is in the order they were played; the timeline in date order.
                expect(state.log).toHaveLength(n)
                expect(state.log).toEqual(
                    expect.arrayContaining(
                        cardIds.map((cardId) => ({
                            kind: 'play',
                            playerId: activeId,
                            cardId,
                            correct: true,
                        })),
                    ),
                )
            }
        }
    })

    it('include the card just placed at the lock-in choice, one by default', () => {
        expect(unlockedOf(scenario().step('deciding').build().state)).toHaveLength(1)
        for (const n of [1, 2, 4]) {
            const { state } = scenario().players(3).step('deciding').unlocked(n).build()
            expect(unlockedOf(state)).toHaveLength(n)
            expect(unlockedOf(state)).toContainEqual(
                expect.objectContaining({ cardId: dealtPlay(state).cardId }),
            )
        }
    })

    it("come before a Reader's or Free choice too", () => {
        for (const step of ['readersChoice', 'freeChoice'] as const) {
            const { state } = scenario().players(4).activePlayer(3).step(step).unlocked(2).build()
            expect(playOf(state)).toMatchObject({
                activeId: state.seating[2],
                step: 'picking',
                draw: { kind: step },
            })
            expect(unlockedOf(state)).toHaveLength(2)
        }
    })
})

describe('stopping at a steal', () => {
    it('has the card misplaced and the player on the active player’s left stealing', () => {
        for (const players of [2, 3, 5, 10]) {
            for (let k = 1; k <= players; k++) {
                const { state, view } = scenario()
                    .players(players)
                    .activePlayer(k)
                    .step('stealing')
                    .build()
                const play = dealtPlay(state)
                if (play.step !== 'stealing') throw new Error(`The play is ${play.step}.`)
                expect(play.activeId).toBe(state.seating[k - 1])
                expect(play.stealerId).toBe(leftOf(state.seating, play.activeId))
                expect(unlockedOf(state)).toEqual([])
                expect(state.log.at(-1)).toEqual({
                    kind: 'play',
                    playerId: play.activeId,
                    cardId: play.cardId,
                    correct: false,
                })
                expect(view.seat).toBe(play.activeId)
            }
        }
    })
})

describe('helper steps', () => {
    const stealerOf = (state: GameState) => {
        const play = dealtPlay(state)
        if (play.step !== 'stealing') throw new Error(`The play is ${play.step}.`)
        return play.stealerId
    }

    it('misplace the card in play, losing the unlocked cards', () => {
        const before = scenario().players(4).activePlayer(1).unlocked(2)
        const { state } = before.misplace().build()
        const { activeId, cardId } = dealtPlay(state)
        expect(playOf(state).step).toBe('stealing')
        expect(unlockedOf(state)).toEqual([])
        expect(state.log).toEqual([
            ...before.build().state.log,
            { kind: 'play', playerId: activeId, cardId, correct: false },
        ])
    })

    it('miss a steal, passing the card on, and steal it, locking it for a point', () => {
        const misplaced = scenario().players(4).activePlayer(2).step('stealing')
        const first = stealerOf(misplaced.build().state)
        const missed = misplaced.missedSteal().build().state
        const { activeId, cardId } = dealtPlay(missed)
        expect(stealerOf(missed)).toBe(leftOf(missed.seating, first))
        expect(missed.log.at(-1)).toEqual({
            kind: 'steal',
            playerId: first,
            cardId,
            correct: false,
        })

        const second = stealerOf(missed)
        const stolen = misplaced.missedSteal().correctSteal().build().state
        expect(stolen.timelines[second]).toContainEqual(
            expect.objectContaining({ cardId, locked: true }),
        )
        expect(score(stolen, second)).toBe(score(missed, second) + 1)
        expect(playOf(stolen).activeId).toBe(leftOf(stolen.seating, activeId))
    })

    it('play exactly the steps named, in order', () => {
        const { state } = scenario()
            .players(3)
            .activePlayer(1)
            .unlocked(1)
            .misplace()
            .missedSteal()
            .build()
        const [first, second, third] = state.seating
        const { cardId } = dealtPlay(state)
        expect(state.log).toEqual([
            expect.objectContaining({ kind: 'play', playerId: first, correct: true }),
            { kind: 'play', playerId: first, cardId, correct: false },
            { kind: 'steal', playerId: second, cardId, correct: false },
        ])
        expect(stealerOf(state)).toBe(third)
        // The reader misses too: the card is discarded and the second player is up.
        const misplaced = scenario().players(3).activePlayer(1).misplace()
        const discarded = misplaced.missedSteal().missedSteal().build().state
        expect(discarded.discards.at(-1)).toBe(dealtPlay(misplaced.build().state).cardId)
        expect(playOf(discarded).activeId).toBe(second)
        expect(discarded.log).toEqual([])
    })
})

describe('absent players', () => {
    it('are an overlay beside the state and the view, never in them', () => {
        const built = scenario().players(4).activePlayer(2).absent([3, 1]).build()
        expect(built.absent).toEqual(['cecilia', 'astrid'])
        expect(JSON.stringify(built.state)).not.toMatch(/absent/i)
        expect(JSON.stringify(built.view)).not.toMatch(/absent/i)
        expect(built.state).toEqual(scenario().players(4).activePlayer(2).build().state)
        expect(scenario().build().absent).toEqual([])
    })

    it('are skipped by the skip helper when they hold up play', () => {
        // An absent reader: the reading moves on, and the new reader has the text.
        const reading = scenario().players(4).activePlayer(2).absent([1]).skip().build()
        const play = dealtPlay(reading.state)
        expect(play).toMatchObject({ activeId: 'björn', step: 'placing', readerId: 'dag' })
        expect(reading.state.log.at(-1)).toEqual({
            kind: 'skip',
            playerId: 'astrid',
            what: 'reading',
        })

        // An absent stealer, mid-steal: the card passes on.
        const steal = scenario().players(4).activePlayer(1).step('stealing').absent([2]).skip()
        expect(dealtPlay(steal.build().state)).toMatchObject({ stealerId: 'cecilia' })

        // An absent active player, and their reader: the turn is skipped.
        const turn = scenario().players(4).activePlayer(2).absent([1, 2]).skip().build()
        expect(playOf(turn.state).activeId).toBe('cecilia')
    })

    it('throw on a skip with nobody absent holding up play, naming helpers', () => {
        const fieldOf = (build: () => unknown) => {
            try {
                build()
            } catch (error) {
                if (error instanceof ScenarioError) return error.field
                throw error
            }
            throw new Error('It built.')
        }
        expect(fieldOf(() => scenario().players(4).activePlayer(2).skip().build())).toBe('helpers')
        expect(
            fieldOf(() => scenario().players(4).activePlayer(2).absent([4]).skip().build()),
        ).toBe('helpers')
        expect(fieldOf(() => scenario().players(4).absent([5]).build())).toBe('absent')
        expect(fieldOf(() => scenario().players(4).absent([2, 2]).build())).toBe('absent')
    })
})

describe('target and scores', () => {
    const scoresOf = (state: GameState) => state.seating.map((id) => score(state, id))

    /** Player numbers in the order of a round: the starting player first. */
    const roundOf = (seed: number, players: number) => {
        const { state } = scenario().seed(seed).players(players).build()
        const start = state.seating.indexOf(state.startingPlayerId!)
        return Array.from({ length: players }, (_, i) => ((start + i) % players) + 1)
    }

    /** `scores` given by round position, as the recipe's list by player number. */
    const byPlayer = (round: number[], scores: number[]) =>
        round.map((_, n) => scores[round.indexOf(n + 1)])

    it('sets the target score', () => {
        expect(scenario().build().state.settings.targetScore).toBe(10)
        expect(scenario().target(3).build().state.settings.targetScore).toBe(3)
        expect(scenario().target(30).build().view.settings.targetScore).toBe(30)
    })

    it('reaches scores below the target for every player count and active player', () => {
        for (const players of [2, 4, 10]) {
            const scores = Array.from({ length: players }, (_, i) => (i * 3) % 10)
            for (const k of [1, players]) {
                for (const step of ['placing', 'deciding', 'stealing', 'freeChoice'] as const) {
                    const { state } = scenario()
                        .players(players)
                        .activePlayer(k)
                        .step(step)
                        .scores(scores)
                        .build()
                    expect(scoresOf(state)).toEqual(scores)
                    expect(playOf(state).activeId).toBe(state.seating[k - 1])
                    expect(state.phase.name).toBe('playing')
                }
            }
        }
    })

    it('reaches scores at and past the target for players who have had their turn this round', () => {
        const round = roundOf(4, 4)
        // The first two of the round have played: one at the target, one past it.
        const scores = byPlayer(round, [10, 14, 9, 2])
        const { state } = scenario()
            .seed(4)
            .players(4)
            .activePlayer(round[2])
            .unlocked(2)
            .scores(scores)
            .build()
        expect(scoresOf(state)).toEqual(scores)
        expect(state.phase.name).toBe('playing')
        expect(unlockedOf(state)).toHaveLength(2)
    })

    it('reaches them at a choice or a steal too, however long the wait', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const round = roundOf(seed, 3)
            const scores = byPlayer(round, [12, 0, 9])
            for (const step of ['readersChoice', 'freeChoice', 'stealing'] as const) {
                const { state } = scenario()
                    .seed(seed)
                    .players(3)
                    .activePlayer(round[2])
                    .step(step)
                    .scores(scores)
                    .build()
                expect(scoresOf(state)).toEqual(scores)
                expect(playOf(state)).toMatchObject({ activeId: state.seating[round[2] - 1] })
            }
        }
    })

    it('reaches the target for a player still to play by a steal in an earlier turn', () => {
        const round = roundOf(4, 4)
        const scores = byPlayer(round, [3, 0, 7, 10])
        const { state } = scenario()
            .seed(4)
            .players(4)
            .activePlayer(round[2])
            .scores(scores)
            .build()
        expect(scoresOf(state)).toEqual(scores)
    })

    it('counts the scores before the helper steps', () => {
        const round = roundOf(1, 3)
        const scores = byPlayer(round, [4, 5, 6])
        const misplaced = scenario().players(3).activePlayer(round[0]).scores(scores).misplace()
        const { state } = misplaced.correctSteal().build()
        const stealer = round[1]
        expect(scoresOf(state)).toEqual(scores.map((n, i) => (i === stealer - 1 ? n + 1 : n)))
    })
})

describe('an impossible recipe', () => {
    const fieldOf = (build: () => unknown) => {
        try {
            build()
        } catch (error) {
            if (error instanceof ScenarioError) return error.field
            throw error
        }
        throw new Error('It built.')
    }

    it('throws, naming the field at fault', () => {
        expect(fieldOf(() => scenario().players(1).build())).toBe('players')
        expect(fieldOf(() => scenario().players(11).build())).toBe('players')
        expect(fieldOf(() => scenario().players(4).activePlayer(0).build())).toBe('activePlayer')
        expect(fieldOf(() => scenario().players(4).activePlayer(5).build())).toBe('activePlayer')
        expect(fieldOf(() => scenario().activePlayer(1.5).build())).toBe('activePlayer')
        expect(fieldOf(() => scenario().viewer(3).build())).toBe('viewer')
        expect(fieldOf(() => scenario().viewer(0).build())).toBe('viewer')
        expect(fieldOf(() => scenario().seed(-1).build())).toBe('seed')
        expect(fieldOf(() => scenario().seed(1.5).build())).toBe('seed')
        expect(
            fieldOf(() =>
                scenario()
                    .step('flying' as never)
                    .build(),
            ),
        ).toBe('step')
    })

    it('throws on unlocked cards the step can’t have, naming unlocked', () => {
        expect(fieldOf(() => scenario().unlocked(-1).build())).toBe('unlocked')
        expect(fieldOf(() => scenario().unlocked(1.5).build())).toBe('unlocked')
        expect(fieldOf(() => scenario().step('deciding').unlocked(0).build())).toBe('unlocked')
        expect(fieldOf(() => scenario().step('stealing').unlocked(1).build())).toBe('unlocked')
    })

    it('throws on a helper step the moment can’t take, naming helpers', () => {
        expect(fieldOf(() => scenario().missedSteal().build())).toBe('helpers')
        expect(fieldOf(() => scenario().correctSteal().build())).toBe('helpers')
        expect(fieldOf(() => scenario().step('deciding').misplace().build())).toBe('helpers')
        expect(fieldOf(() => scenario().step('stealing').misplace().build())).toBe('helpers')
        expect(fieldOf(() => scenario().step('freeChoice').misplace().build())).toBe('helpers')
        // With two players the reader is the only stealer; after their miss nobody is stealing.
        expect(fieldOf(() => scenario().misplace().missedSteal().missedSteal().build())).toBe(
            'helpers',
        )
        expect(
            fieldOf(() => buildScenario({ ...scenario().recipe, helpers: ['skip' as never] })),
        ).toBe('helpers')
    })

    it('throws on a target out of range, naming target', () => {
        for (const target of [2, 31, 9.5]) {
            expect(fieldOf(() => scenario().target(target).build())).toBe('target')
        }
    })

    it('throws on scores the rules can’t reach, naming scores', () => {
        expect(fieldOf(() => scenario().scores([1]).build())).toBe('scores')
        expect(fieldOf(() => scenario().scores([1, 2, 3]).build())).toBe('scores')
        expect(fieldOf(() => scenario().scores([1, -1]).build())).toBe('scores')
        expect(fieldOf(() => scenario().scores([1, 1.5]).build())).toBe('scores')
        // Nobody is at the target when a round opens: the last round would have been won.
        const { state } = scenario().players(3).build()
        const opener = state.seating.indexOf(state.startingPlayerId!) + 1
        const atTarget = [3, 3, 3].map((n, i) => (i === opener - 1 ? 0 : n))
        expect(
            fieldOf(() =>
                scenario().players(3).target(3).activePlayer(opener).scores(atTarget).build(),
            ),
        ).toBe('scores')
        // Nor by default, when the opener is active.
        expect(fieldOf(() => scenario().players(3).target(3).scores([3, 0, 0]).build())).toBe(
            'scores',
        )
        // A player still to play gets one steal per earlier turn with nothing else to score.
        const round = Array.from({ length: 3 }, (_, i) => ((opener - 1 + i) % 3) + 1)
        const twoSteals = [0, 0, 0]
        twoSteals[round[2] - 1] = 4
        expect(
            fieldOf(() =>
                scenario().players(3).target(3).activePlayer(round[1]).scores(twoSteals).build(),
            ),
        ).toBe('scores')
    })

    it('says what is wrong in the message', () => {
        expect(() => scenario().viewer(3).build()).toThrow('viewer: there is no player 3')
    })
})

describe('removed players', () => {
    const fieldOf = (build: () => unknown) => {
        try {
            build()
        } catch (error) {
            if (error instanceof ScenarioError) return error.field
            throw error
        }
        throw new Error('It built.')
    }

    it('are out of the seating with no timeline, listed as removed, before play begins', () => {
        const { state, view } = scenario().players(5).removed([3, 5]).activePlayer(4).build()
        expect(state.seating).toEqual(['astrid', 'björn', 'dag'])
        expect(Object.keys(state.timelines).sort()).toEqual(['astrid', 'björn', 'dag'])
        expect(state.players.filter((player) => player.removed).map((player) => player.id)).toEqual(
            ['cecilia', 'eira'],
        )
        expect(playOf(state).activeId).toBe('dag')
        expect(view.players).toHaveLength(5)
    })

    it('can be the viewer, but not the active player, absent or scoring', () => {
        expect(scenario().players(4).removed([2]).viewer(2).build().view.seat).toBe('björn')
        expect(fieldOf(() => scenario().players(4).removed([2]).activePlayer(2).build())).toBe(
            'activePlayer',
        )
        expect(fieldOf(() => scenario().players(4).removed([2]).absent([2]).build())).toBe('absent')
        expect(
            fieldOf(() => scenario().players(3).removed([2]).target(3).scores([1, 1, 0]).build()),
        ).toBe('scores')
    })

    it('throw for the host, a player twice, someone not there, or fewer than two left', () => {
        expect(fieldOf(() => scenario().players(4).removed([1]).build())).toBe('removed')
        expect(fieldOf(() => scenario().players(4).removed([2, 2]).build())).toBe('removed')
        expect(fieldOf(() => scenario().players(4).removed([5]).build())).toBe('removed')
        expect(fieldOf(() => scenario().players(3).removed([2, 3]).build())).toBe('removed')
    })

    it('leave the rest scoring and stealing as recipes ask', () => {
        const { state } = scenario()
            .players(4)
            .removed([3])
            .target(3)
            .scores([2, 1, 0, 2])
            .activePlayer(2)
            .step('stealing')
            .build()
        expect(state.seating.map((id) => score(state, id))).toEqual([2, 1, 2])
        expect(playOf(state).step).toBe('stealing')
    })
})

describe('ending early', () => {
    it('ends the game with no winner, seen from the player who was active', () => {
        const { state, view } = scenario().players(4).activePlayer(3).endEarly().build()
        expect(state.phase).toEqual({ name: 'ended' })
        expect(view.phase).toEqual({ name: 'ended' })
        expect(view.seat).toBe('cecilia')
    })

    it('throws on a helper step after the game has ended, naming helpers', () => {
        expect(() => scenario().players(3).endEarly().misplace().build()).toThrow(
            'helpers: the game is ended, not playing',
        )
    })
})

describe('the moments the lifecycle spec names', () => {
    it('all build', () => {
        const moments = [
            ...Array.from({ length: 9 }, (_, i) => scenario().players(i + 2)),
            // An absent reader, skipped.
            scenario().players(4).activePlayer(2).absent([1]).skip(),
            // A skip mid-steal.
            scenario().players(4).activePlayer(1).step('stealing').absent([2]).skip(),
            // A removed player.
            scenario().players(4).removed([3]),
            // A game ended early.
            scenario().players(4).endEarly(),
        ]
        for (const moment of moments) expect(moment.build).not.toThrow()
    })
})

describe('the invariant check the builder runs after every step', () => {
    const { state } = scenario().step('deciding').build()

    it('passes a state the machine made', () => {
        expect(invariantProblems(state)).toEqual([])
    })

    it('catches a card in two places', () => {
        const { cardId } = dealtPlay(state)
        const [category] = Object.keys(state.queues)
        const broken = { ...state, queues: { ...state.queues, [category]: [cardId] } }
        expect(invariantProblems(broken).join()).toContain(`${cardId} is in 2 places`)
    })

    it('catches a timeline out of order', () => {
        const { activeId } = playOf(state)
        const broken = {
            ...state,
            timelines: { ...state.timelines, [activeId]: [...state.timelines[activeId]].reverse() },
        }
        expect(invariantProblems(broken).join()).toContain('out of order')
    })
})

describe('the synthetic deck', () => {
    const deck = syntheticDeck(1, 'en')

    it('has eight cards in each of five categories', () => {
        expect(deck).toHaveLength(40)
        for (const category of syntheticCategories) {
            expect(deck.filter((card) => card.category === category)).toHaveLength(8)
        }
    })

    it('comes round again under new ids, keeping the first copy', () => {
        const three = syntheticDeck(1, 'en', 3)
        expect(three).toHaveLength(120)
        expect(new Set(three.map((card) => card.id)).size).toBe(120)
        expect(three.slice(0, 40)).toEqual(deck)
        expect(three[40]).toMatchObject({ id: deck[0].id + '-2', text: deck[0].text })
    })

    it('has different text in English, Swedish and Norwegian', () => {
        const sv = syntheticDeck(1, 'sv')
        const nb = syntheticDeck(1, 'nb')
        deck.forEach((card, i) => {
            expect(sv[i].id).toBe(card.id)
            expect(new Set([card.text, sv[i].text, nb[i].text]).size).toBe(3)
        })
    })

    it('mixes short and long card texts', () => {
        const lengths = deck.map((card) => card.text.length)
        expect(Math.min(...lengths)).toBeLessThan(35)
        expect(Math.max(...lengths)).toBeGreaterThan(100)
    })

    it('dates its cards from the seed, by decade before 1500', () => {
        expect(syntheticDeck(1, 'sv').map((card) => card.date)).toEqual(
            deck.map((card) => card.date),
        )
        expect(syntheticDeck(2, 'en').map((card) => card.date)).not.toEqual(
            deck.map((card) => card.date),
        )
        for (const { date } of deck) {
            expect(date).toBeLessThanOrEqual(2026)
            if (date < 1500) expect(isDecade(date)).toBe(true)
        }
        expect(deck.some((card) => card.date < 1500)).toBe(true)
    })
})
