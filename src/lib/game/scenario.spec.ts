import { describe, expect, it } from 'vite-plus/test'
import { isDecade } from '../cards/date-parts'
import { invariantProblems } from './invariants'
import { buildScenario, scenario, ScenarioError, type Recipe } from './scenario'
import type { GameState } from './state'
import { syntheticCategories, syntheticDeck } from './synthetic-deck'

const playOf = (state: GameState) => {
    if (state.phase.name !== 'playing') throw new Error(`The game is ${state.phase.name}.`)
    return { activeId: state.phase.activeId, ...state.phase.play }
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
        const { activeId, cardId, step } = playOf(state)
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
        expect(copy).toEqual({ seed: 9, players: 2, step: 'deciding', viewer: 1 })
        expect(buildScenario(copy).state).toEqual(buildScenario(recipe).state)
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
        expect(fieldOf(() => scenario().players(3).build())).toBe('players')
        expect(fieldOf(() => scenario().viewer(3).build())).toBe('viewer')
        expect(fieldOf(() => scenario().viewer(0).build())).toBe('viewer')
        expect(fieldOf(() => scenario().seed(-1).build())).toBe('seed')
        expect(fieldOf(() => scenario().seed(1.5).build())).toBe('seed')
        expect(
            fieldOf(() =>
                scenario()
                    .step('stealing' as never)
                    .build(),
            ),
        ).toBe('step')
    })

    it('says what is wrong in the message', () => {
        expect(() => scenario().viewer(3).build()).toThrow('viewer: there is no player 3')
    })
})

describe('the invariant check the builder runs after every step', () => {
    const { state } = scenario().step('deciding').build()

    it('passes a state the machine made', () => {
        expect(invariantProblems(state)).toEqual([])
    })

    it('catches a card in two places', () => {
        const { cardId } = playOf(state)
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
