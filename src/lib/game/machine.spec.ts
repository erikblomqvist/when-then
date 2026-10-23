import { describe, expect, it } from 'vite-plus/test'
import { isDecade } from '../cards/date-parts'
import { apply, create, load, type CreateInput } from './machine'
import { score, type DeckCard, type GameState } from './state'

const astrid = { id: 'astrid', name: 'Astrid', icon: 'cat', host: true } as const
const bjorn = { id: 'bjorn', name: 'Björn', icon: 'dog', host: false } as const

/** A deck of one card per date, all in one category. */
const deckOf = (dates: number[], category = 'events'): DeckCard[] =>
    dates.map((date, i) => ({ id: `card-${i}`, category, text: `Card ${i} (${date})`, date }))

const twoPlayers = (overrides: Partial<CreateInput> = {}): CreateInput => ({
    players: [astrid, bjorn],
    settings: { targetScore: 10, exactYear: false, cardLanguage: 'en' },
    seating: ['astrid', 'bjorn'],
    cards: deckOf([1905, 1920, 1950, 1969, 1989, 2001]),
    seed: 1,
    currentYear: 2026,
    ...overrides,
})

const anchors = (state: GameState) =>
    state.seating.map((id) => state.timelines[id].find((entry) => entry.kind === 'anchor')?.date)

const seeds = Array.from({ length: 50 }, (_, i) => i + 1)

describe('creating a two-player game', () => {
    it('skips seating and starts the first play', () => {
        const state = create(twoPlayers())
        expect(state.phase.name).toBe('playing')
        if (state.phase.name !== 'playing') return
        expect(['astrid', 'bjorn']).toContain(state.phase.activeId)
        expect(state.phase.play.step).toBe('placing')
        // With two players, the other one reads.
        expect(state.phase.play.readerId).not.toBe(state.phase.activeId)
        expect(state.startingPlayerId).toBe(state.phase.activeId)
    })

    it('picks either player to start, depending on the seed', () => {
        const starters = new Set(seeds.map((seed) => create(twoPlayers({ seed })).startingPlayerId))
        expect(starters).toEqual(new Set(['astrid', 'bjorn']))
    })

    it('gives each player a different anchor year, and nothing else', () => {
        for (const seed of seeds) {
            const state = create(twoPlayers({ seed }))
            const [a, b] = anchors(state)
            expect(a).not.toBe(b)
            expect(state.timelines.astrid).toHaveLength(1)
            expect(state.timelines.bjorn).toHaveLength(1)
        }
    })

    it('follows the spread of the cards', () => {
        const cards = deckOf([1900, 1902, 1905, 1907, 1910])
        for (const seed of seeds) {
            for (const anchor of anchors(create(twoPlayers({ seed, cards })))) {
                expect(anchor).toBeGreaterThanOrEqual(1895)
                expect(anchor).toBeLessThanOrEqual(1915)
            }
        }
    })

    it('never deals an anchor past the current year', () => {
        const cards = deckOf([2020, 2022, 2024, 2025, 2026])
        for (const seed of seeds) {
            for (const anchor of anchors(create(twoPlayers({ seed, cards })))) {
                expect(anchor).toBeLessThanOrEqual(2026)
            }
        }
    })

    it('gives decades before 1500', () => {
        const cards = deckOf([-499, -49, 1, 1210, 1490])
        for (const seed of seeds) {
            for (const anchor of anchors(create(twoPlayers({ seed, cards })))) {
                expect(anchor! < 1500 ? isDecade(anchor!) : true).toBe(true)
            }
        }
    })

    it('carries schema 1 and every player, none removed', () => {
        const state = create(twoPlayers())
        expect(state.schema).toBe(1)
        expect(state.players.every((player) => !player.removed)).toBe(true)
    })
})

/** The play in progress, failing the test when there is none. */
const playOf = (state: GameState) => {
    if (state.phase.name !== 'playing') throw new Error(`The game is ${state.phase.name}.`)
    return { activeId: state.phase.activeId, ...state.phase.play }
}

const anchorOf = (state: GameState, id: string) =>
    state.timelines[id].find((entry) => entry.kind === 'anchor')!.date

/** The first game (by seed) whose active player's anchor passes `test`. */
const gameWhere = (cards: DeckCard[], test: (anchor: number) => boolean) => {
    for (const seed of seeds) {
        const state = create(twoPlayers({ seed, cards }))
        if (test(anchorOf(state, playOf(state).activeId))) return state
    }
    throw new Error('No seed gives that anchor.')
}

const place = (state: GameState, slot: number, by = playOf(state).activeId) =>
    apply(state, { type: 'place', by, slot })

const placed = (state: GameState, slot: number) => {
    const result = place(state, slot)
    if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
    return result.state
}

describe('placing a card', () => {
    const at1950 = deckOf(Array.from({ length: 10 }, () => 1950))

    it('is correct when the card fits between its neighbours, and sits unlocked', () => {
        const state = gameWhere(at1950, (anchor) => anchor < 1950)
        const { activeId, cardId } = playOf(state)
        const next = placed(state, 1)
        expect(playOf(next).step).toBe('deciding')
        expect(next.timelines[activeId]).toEqual([
            { kind: 'anchor', date: anchorOf(state, activeId) },
            { kind: 'card', cardId, date: 1950, locked: false },
        ])
    })

    it('is wrong on the other side of a later anchor', () => {
        const state = gameWhere(at1950, (anchor) => anchor < 1950)
        const { activeId, cardId } = playOf(state)
        const next = placed(state, 0)
        // The turn is over: the card is gone from the game and the other player is up.
        expect(next.timelines[activeId]).toHaveLength(1)
        expect(next.discards).toEqual([cardId])
        expect(playOf(next).activeId).not.toBe(activeId)
    })

    it('counts an equal year on either side', () => {
        const state = gameWhere(at1950, (anchor) => anchor === 1950)
        expect(playOf(placed(state, 0)).step).toBe('deciding')
        expect(playOf(placed(state, 1)).step).toBe('deciding')
    })

    it('compares cards before 1500 by decade', () => {
        // A card from 1493 and an anchor in the 1490s are equal: either side is right.
        const state = gameWhere(deckOf(Array.from({ length: 10 }, () => 1493)), (anchor) =>
            [1490].includes(anchor),
        )
        expect(playOf(placed(state, 0)).step).toBe('deciding')
        expect(playOf(placed(state, 1)).step).toBe('deciding')
        // A card from the 1480s goes before the 1490s.
        const early = gameWhere(deckOf(Array.from({ length: 10 }, () => 1485)), (anchor) =>
            [1490].includes(anchor),
        )
        expect(playOf(placed(early, 0)).step).toBe('deciding')
        expect(playOf(placed(early, 1)).step).toBe('placing')
    })

    it('refuses anyone but the active player', () => {
        const state = create(twoPlayers())
        const other = playOf(state).readerId
        expect(place(state, 0, other)).toEqual({ ok: false, refusal: 'not_your_turn' })
        expect(place(state, 0, 'stranger')).toEqual({ ok: false, refusal: 'no_seat' })
    })

    it('refuses a gap that is not on the timeline', () => {
        const state = create(twoPlayers())
        expect(place(state, 2)).toEqual({ ok: false, refusal: 'invalid_slot' })
        expect(place(state, -1)).toEqual({ ok: false, refusal: 'invalid_slot' })
        expect(place(state, 0.5)).toEqual({ ok: false, refusal: 'invalid_slot' })
    })

    it('refuses placing the same card twice', () => {
        const state = gameWhere(at1950, (anchor) => anchor < 1950)
        expect(place(placed(state, 1), 1)).toEqual({ ok: false, refusal: 'not_placing' })
    })
})

const lockIn = (state: GameState, by = playOf(state).activeId) =>
    apply(state, { type: 'lockIn', by })

describe('locking in', () => {
    const at1950 = deckOf(Array.from({ length: 10 }, () => 1950))

    it('locks the unlocked cards, scores them and passes the turn on', () => {
        const state = placed(
            gameWhere(at1950, (anchor) => anchor < 1950),
            1,
        )
        const { activeId, readerId, cardId } = playOf(state)
        const result = lockIn(state)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.state.timelines[activeId][1]).toEqual({
            kind: 'card',
            cardId,
            date: 1950,
            locked: true,
        })
        expect(score(result.state, activeId)).toBe(1)
        expect(score(result.state, readerId)).toBe(0)
        // The other player's turn, with the first player reading.
        expect(playOf(result.state)).toMatchObject({
            activeId: readerId,
            readerId: activeId,
            step: 'placing',
        })
    })

    it('scores nothing for an unlocked card', () => {
        const state = placed(
            gameWhere(at1950, (anchor) => anchor < 1950),
            1,
        )
        expect(score(state, playOf(state).activeId)).toBe(0)
    })

    it('is refused before a correct play', () => {
        expect(lockIn(create(twoPlayers()))).toEqual({
            ok: false,
            refusal: 'lock_in_unavailable',
        })
    })

    it('is refused for anyone but the active player', () => {
        const state = placed(
            gameWhere(at1950, (anchor) => anchor < 1950),
            1,
        )
        expect(lockIn(state, playOf(state).readerId)).toEqual({
            ok: false,
            refusal: 'not_your_turn',
        })
    })
})

describe('the Category draw', () => {
    it('never lands on a category with no cards left', () => {
        // One Places card among many Events: once it's dealt, only Events can be drawn.
        const cards = [
            ...deckOf(Array.from({ length: 12 }, (_, i) => 1900 + i)),
            { id: 'only-place', category: 'places', text: 'A harbour opens', date: 1950 },
        ]
        for (const seed of seeds.slice(0, 10)) {
            let state = create(twoPlayers({ seed, cards }))
            const dealt: string[] = []
            while (state.phase.name === 'playing') {
                const { draw, cardId } = playOf(state)
                expect(state.cards[cardId].category).toBe(draw.category)
                dealt.push(cardId)
                const result = playOf(state).step === 'placing' ? place(state, 0) : lockIn(state)
                if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                state = result.state
            }
            expect(new Set(dealt).size).toBe(cards.length)
        }
    })
})

describe('determinism', () => {
    const play = (seed: number) => {
        let state = create(twoPlayers({ seed }))
        for (let i = 0; i < 4; i++) {
            const result = place(state, 1)
            state = result.ok ? result.state : state
            const locked = lockIn(state)
            state = locked.ok ? locked.state : state
        }
        return state
    }

    it('gives the same state for the same seed and commands', () => {
        expect(play(7)).toEqual(play(7))
    })

    it('gives different games for different seeds', () => {
        expect(play(7)).not.toEqual(play(8))
    })
})

describe('loading a saved state', () => {
    it('keeps a current state as it is', () => {
        const state = create(twoPlayers())
        expect(load(JSON.parse(JSON.stringify(state)))).toEqual(state)
    })

    it('ends a game whose schema it cannot upgrade, with no winner', () => {
        const state = create(twoPlayers())
        for (const schema of [0, 99, undefined]) {
            const loaded = load({ ...JSON.parse(JSON.stringify(state)), schema })
            expect(loaded.phase).toEqual({ name: 'ended' })
            expect(loaded.schema).toBe(1)
            expect(lockIn(loaded, 'astrid').ok).toBe(false)
        }
    })
})
