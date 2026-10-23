import { describe, expect, it } from 'vite-plus/test'
import { isDecade } from '../cards/date-parts'
import { apply, create, load, type ApplyResult, type CreateInput } from './machine'
import { score, type DeckCard, type DrawOutcome, type GameState } from './state'
import { redact } from './view'

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
        // A card is dealt, or waits for a Reader's or Free choice.
        expect(['placing', 'picking']).toContain(state.phase.play.step)
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

/** The play in progress with its card dealt, failing the test while a category waits. */
const dealtPlay = (state: GameState) => {
    const play = playOf(state)
    if (play.step === 'picking') throw new Error('The play is waiting for a category.')
    return play
}

/**
 * `state` with a card dealt: on a Reader's or Free choice, whoever picks takes the first
 * category they're offered.
 */
const dealt = (state: GameState) => {
    const play = playOf(state)
    if (play.step !== 'picking') return state
    const view = redact(state, play.activeId)
    if (view.phase.name !== 'playing' || view.phase.play.step !== 'picking') return state
    const { pickerId, categories } = view.phase.play
    const result = apply(state, { type: 'pickCategory', by: pickerId, category: categories[0] })
    if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
    return result.state
}

const anchorOf = (state: GameState, id: string) =>
    state.timelines[id].find((entry) => entry.kind === 'anchor')!.date

/** The first game (by seed) whose active player's anchor passes `test`. */
const gameWhere = (cards: DeckCard[], test: (anchor: number) => boolean) => {
    for (const seed of seeds) {
        const state = dealt(create(twoPlayers({ seed, cards })))
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
        const { activeId, cardId } = dealtPlay(state)
        const next = placed(state, 1)
        expect(playOf(next).step).toBe('deciding')
        expect(next.timelines[activeId]).toEqual([
            { kind: 'anchor', date: anchorOf(state, activeId) },
            { kind: 'card', cardId, date: 1950, locked: false },
        ])
    })

    it('is wrong on the other side of a later anchor', () => {
        const state = gameWhere(at1950, (anchor) => anchor < 1950)
        const { activeId, cardId } = dealtPlay(state)
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
        expect(placed(early, 1).discards).toEqual([dealtPlay(early).cardId])
    })

    it('refuses anyone but the active player', () => {
        const state = dealt(create(twoPlayers()))
        const other = playOf(state).readerId
        expect(place(state, 0, other)).toEqual({ ok: false, refusal: 'not_your_turn' })
        expect(place(state, 0, 'stranger')).toEqual({ ok: false, refusal: 'no_seat' })
    })

    it('refuses a gap that is not on the timeline', () => {
        const state = dealt(create(twoPlayers()))
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
        const { activeId, readerId, cardId } = dealtPlay(state)
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
        expect(lockIn(dealt(create(twoPlayers())))).toEqual({
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
            const seen: string[] = []
            while (state.phase.name === 'playing') {
                const play = playOf(state)
                if (play.step === 'picking') {
                    state = dealt(state)
                    continue
                }
                if (play.draw.kind === 'category') {
                    expect(state.cards[play.cardId].category).toBe(play.draw.category)
                }
                seen.push(play.cardId)
                const result = play.step === 'placing' ? place(state, 0) : lockIn(state)
                if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                state = result.state
            }
            expect(new Set(seen).size).toBe(cards.length)
        }
    })
})

describe('determinism', () => {
    const play = (seed: number) => {
        let state = create(twoPlayers({ seed }))
        for (let i = 0; i < 4; i++) {
            state = dealt(state)
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

describe('seating', () => {
    const cecilia = { id: 'cecilia', name: 'Cecilia', icon: 'bird', host: false } as const
    const dag = { id: 'dag', name: 'Dag', icon: 'fish', host: false } as const

    const fourPlayers = (overrides: Partial<CreateInput> = {}): CreateInput =>
        twoPlayers({
            players: [astrid, bjorn, cecilia, dag],
            seating: ['astrid', 'bjorn', 'cecilia', 'dag'],
            ...overrides,
        })

    const setSeating = (state: GameState, seating: string[], by = 'astrid') =>
        apply(state, { type: 'setSeating', by, seating })
    const confirm = (state: GameState, by = 'astrid', currentYear = 2026) =>
        apply(state, { type: 'confirmSeating', by, currentYear })

    /** The next state, failing the test on a refusal. */
    const ok = (result: ApplyResult) => {
        if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
        return result.state
    }
    const confirmed = (state: GameState) => ok(confirm(state))

    it('is where a game of three or more starts, with no anchors yet', () => {
        for (const players of [3, 4]) {
            const state = create(
                fourPlayers({
                    players: [astrid, bjorn, cecilia, dag].slice(0, players),
                    seating: ['astrid', 'bjorn', 'cecilia', 'dag'].slice(0, players),
                }),
            )
            expect(state.phase).toEqual({ name: 'seating' })
            expect(state.timelines).toEqual({})
            expect(state.startingPlayerId).toBeNull()
        }
    })

    it('takes the host’s seating straight away', () => {
        const result = setSeating(create(fourPlayers()), ['dag', 'bjorn', 'astrid', 'cecilia'])
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.state.seating).toEqual(['dag', 'bjorn', 'astrid', 'cecilia'])
        expect(result.state.phase).toEqual({ name: 'seating' })
    })

    it('refuses anyone but the host', () => {
        const state = create(fourPlayers())
        expect(setSeating(state, ['dag', 'bjorn', 'astrid', 'cecilia'], 'bjorn')).toEqual({
            ok: false,
            refusal: 'not_host',
        })
        expect(confirm(state, 'cecilia')).toEqual({ ok: false, refusal: 'not_host' })
    })

    it('refuses a seating that does not seat every player exactly once', () => {
        const state = create(fourPlayers())
        for (const seating of [
            ['astrid', 'bjorn', 'cecilia'],
            ['astrid', 'bjorn', 'cecilia', 'cecilia'],
            ['astrid', 'bjorn', 'cecilia', 'dag', 'erik'],
            ['astrid', 'bjorn', 'cecilia', 'erik'],
        ]) {
            expect(setSeating(state, seating)).toEqual({ ok: false, refusal: 'invalid_seating' })
        }
    })

    it('can’t be changed or confirmed once play has started', () => {
        const started = confirmed(create(fourPlayers()))
        expect(setSeating(started, ['dag', 'bjorn', 'astrid', 'cecilia'])).toEqual({
            ok: false,
            refusal: 'not_seating',
        })
        expect(confirm(started)).toEqual({ ok: false, refusal: 'not_seating' })
        // A two-player game never seats.
        expect(confirm(create(twoPlayers()))).toEqual({ ok: false, refusal: 'not_seating' })
    })

    it('refuses playing a card before the seating is confirmed', () => {
        expect(place(create(fourPlayers()), 0, 'astrid')).toEqual({
            ok: false,
            refusal: 'not_placing',
        })
    })

    it('on confirm, deals distinct anchors and starts the first play', () => {
        for (const seed of seeds) {
            const state = confirmed(create(fourPlayers({ seed })))
            const dates = anchors(state)
            expect(new Set(dates).size).toBe(4)
            for (const id of state.seating) expect(state.timelines[id]).toHaveLength(1)
            const { activeId, step } = playOf(state)
            expect(['placing', 'picking']).toContain(step)
            expect(state.startingPlayerId).toBe(activeId)
        }
    })

    it('deals anchors no later than the year the confirm comes with', () => {
        const cards = deckOf([2020, 2022, 2024, 2025, 2026])
        for (const seed of seeds) {
            const state = ok(confirm(create(fourPlayers({ seed, cards })), 'astrid', 2024))
            for (const anchor of anchors(state)) expect(anchor).toBeLessThanOrEqual(2024)
        }
    })

    it('throws on a current year that is not a whole number, rather than deal broken anchors', () => {
        for (const currentYear of [Number.NaN, 2026.5, Number.POSITIVE_INFINITY]) {
            expect(() => confirm(create(fourPlayers()), 'astrid', currentYear)).toThrow(
                'current year',
            )
            expect(() => create(twoPlayers({ currentYear }))).toThrow('current year')
        }
    })

    it('picks the starting player from the seed', () => {
        const starter = (seed: number) => confirmed(create(fourPlayers({ seed }))).startingPlayerId
        expect(starter(3)).toBe(starter(3))
        expect(new Set(seeds.map(starter))).toEqual(new Set(['astrid', 'bjorn', 'cecilia', 'dag']))
    })

    it('plays in the seating the host set, read by the player on the active player’s right', () => {
        const state = confirmed(
            ok(setSeating(create(fourPlayers()), ['astrid', 'cecilia', 'bjorn', 'dag'])),
        )
        const right = { astrid: 'dag', cecilia: 'astrid', bjorn: 'cecilia', dag: 'bjorn' }
        const { activeId, readerId } = playOf(state)
        expect(readerId).toBe(right[activeId as keyof typeof right])
    })
})

describe("Reader's choice and Free choice", () => {
    const cards = [
        ...deckOf(Array.from({ length: 6 }, (_, i) => 1900 + i)),
        ...deckOf(
            Array.from({ length: 6 }, (_, i) => 1950 + i),
            'people',
        ).map((card) => ({
            ...card,
            id: `people-${card.id}`,
        })),
    ]

    /** The first game (by seed) whose first draw lands on `kind`. */
    const drawing = (kind: DrawOutcome['kind'], deck = cards) => {
        for (const seed of seeds) {
            const state = create(twoPlayers({ seed, cards: deck }))
            if (playOf(state).draw.kind === kind) return state
        }
        throw new Error(`No seed draws ${kind}.`)
    }

    const pick = (state: GameState, by: string, category: string) =>
        apply(state, { type: 'pickCategory', by, category })

    it('are outcomes of the draw, alongside the categories', () => {
        const kinds = new Set(
            seeds.map((seed) => playOf(create(twoPlayers({ seed, cards }))).draw.kind),
        )
        expect(kinds).toEqual(new Set(['category', 'readersChoice', 'freeChoice']))
    })

    it('wait for someone to pick, with no card dealt yet', () => {
        for (const kind of ['readersChoice', 'freeChoice'] as const) {
            const play = playOf(drawing(kind))
            expect(play.step).toBe('picking')
            expect(play).not.toHaveProperty('cardId')
        }
    })

    it("lets only the reader pick on Reader's choice, and deals from what they picked", () => {
        const state = drawing('readersChoice')
        const { activeId, readerId } = playOf(state)
        expect(pick(state, activeId, 'people')).toEqual({ ok: false, refusal: 'not_your_pick' })
        const result = pick(state, readerId, 'people')
        if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
        const play = playOf(result.state)
        if (play.step !== 'placing') throw new Error(`The play is ${play.step}.`)
        expect(play).toMatchObject({ activeId, readerId, draw: { kind: 'readersChoice' } })
        expect(result.state.cards[play.cardId].category).toBe('people')
    })

    it('lets only the active player pick on Free choice', () => {
        const state = drawing('freeChoice')
        const { activeId, readerId } = playOf(state)
        expect(pick(state, readerId, 'events')).toEqual({ ok: false, refusal: 'not_your_pick' })
        expect(pick(state, 'stranger', 'events')).toEqual({ ok: false, refusal: 'no_seat' })
        const result = pick(state, activeId, 'events')
        if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
        const play = playOf(result.state)
        if (play.step !== 'placing') throw new Error(`The play is ${play.step}.`)
        expect(result.state.cards[play.cardId].category).toBe('events')
    })

    it('refuses a category with no cards left, or one the game does not have', () => {
        // One Places card among Events and People: once it's dealt, Places can't be picked.
        const deck = [
            ...deckOf(Array.from({ length: 8 }, (_, i) => 1900 + i)),
            ...deckOf(
                Array.from({ length: 8 }, (_, i) => 1920 + i),
                'people',
            ).map((card) => ({
                ...card,
                id: `people-${card.id}`,
            })),
            { id: 'only-place', category: 'places', text: 'A harbour opens', date: 1950 },
        ]
        for (const seed of seeds) {
            let state = create(twoPlayers({ seed, cards: deck }))
            let placesDealt = false
            while (state.phase.name === 'playing') {
                const play = playOf(state)
                if (play.step === 'picking') {
                    const by = play.draw.kind === 'readersChoice' ? play.readerId : play.activeId
                    if (placesDealt) {
                        expect(pick(state, by, 'places')).toEqual({
                            ok: false,
                            refusal: 'category_unavailable',
                        })
                        expect(pick(state, by, 'sports')).toEqual({
                            ok: false,
                            refusal: 'category_unavailable',
                        })
                        return
                    }
                    const result = pick(state, by, 'places')
                    if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                    state = result.state
                    continue
                }
                if (state.cards[play.cardId].category === 'places') placesDealt = true
                const result = play.step === 'placing' ? place(state, 0) : lockIn(state)
                if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                state = result.state
            }
        }
        throw new Error('No seed draws a choice after Places runs out.')
    })

    it('drop out of the draw once only one category has cards left', () => {
        // Two Places cards among the Events: once both are dealt, every draw is Events.
        const deck = [
            ...deckOf(Array.from({ length: 8 }, (_, i) => 1900 + i)),
            { id: 'place-1', category: 'places', text: 'A harbour opens', date: 1950 },
            { id: 'place-2', category: 'places', text: 'A bridge opens', date: 1960 },
        ]
        for (const seed of seeds.slice(0, 10)) {
            let state = create(twoPlayers({ seed, cards: deck }))
            let placesLeft = 2
            while (state.phase.name === 'playing') {
                const play = playOf(state)
                if (placesLeft === 0 && play.step !== 'deciding') {
                    expect(play.draw).toEqual({ kind: 'category', category: 'events' })
                }
                if (play.step === 'picking') {
                    const by = play.draw.kind === 'readersChoice' ? play.readerId : play.activeId
                    const result = pick(state, by, 'places')
                    if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                    state = result.state
                    continue
                }
                if (play.step === 'placing' && state.cards[play.cardId].category === 'places') {
                    placesLeft--
                }
                const result = play.step === 'placing' ? place(state, 0) : lockIn(state)
                if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                state = result.state
            }
        }
    })

    it('refuses a pick when no choice is waiting', () => {
        const state = dealt(create(twoPlayers()))
        const { activeId, readerId } = playOf(state)
        for (const by of [activeId, readerId]) {
            expect(pick(state, by, 'events')).toEqual({ ok: false, refusal: 'not_picking' })
        }
        const seating = create(
            twoPlayers({
                players: [
                    astrid,
                    bjorn,
                    { id: 'cecilia', name: 'Cecilia', icon: 'bird', host: false },
                ],
                seating: ['astrid', 'bjorn', 'cecilia'],
            }),
        )
        expect(pick(seating, 'astrid', 'events')).toEqual({ ok: false, refusal: 'not_picking' })
    })

    it('refuses placing a card before the category is picked', () => {
        for (const kind of ['readersChoice', 'freeChoice'] as const) {
            const state = drawing(kind)
            expect(place(state, 0)).toEqual({ ok: false, refusal: 'not_placing' })
            expect(lockIn(state)).toEqual({ ok: false, refusal: 'lock_in_unavailable' })
        }
    })
})
