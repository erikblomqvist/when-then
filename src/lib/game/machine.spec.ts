import { describe, expect, it } from 'vite-plus/test'
import { isDecade } from '../cards/date-parts'
import { apply, create, load, type ApplyResult, type CreateInput } from './machine'
import { scenario } from './scenario'
import { leftOf, rightOf, startingFrom } from './seating'
import { fits, score, type DeckCard, type DrawOutcome, type GameState } from './state'
import { redact } from './view'

const astrid = { id: 'astrid', name: 'Astrid', icon: 'cat', host: true } as const
const bjorn = { id: 'bjorn', name: 'Björn', icon: 'dog', host: false } as const
const cecilia = { id: 'cecilia', name: 'Cecilia', icon: 'bird', host: false } as const
const dag = { id: 'dag', name: 'Dag', icon: 'fish', host: false } as const

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

const fourPlayers = (overrides: Partial<CreateInput> = {}): CreateInput =>
    twoPlayers({
        players: [astrid, bjorn, cecilia, dag],
        seating: ['astrid', 'bjorn', 'cecilia', 'dag'],
        ...overrides,
    })

/** The next state, failing the test on a refusal. */
const ok = (result: ApplyResult) => {
    if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
    return result.state
}

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

    it('carries schema 2 and every player, none removed', () => {
        const state = create(twoPlayers())
        expect(state.schema).toBe(2)
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
        const { activeId, readerId, cardId } = dealtPlay(state)
        const next = placed(state, 0)
        // The card stays off the timeline, and with two players the reader may steal it.
        expect(next.timelines[activeId]).toHaveLength(1)
        expect(playOf(next)).toMatchObject({ step: 'stealing', stealerId: readerId, cardId })
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
        expect(playOf(placed(early, 1)).step).toBe('stealing')
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

/** Whoever is up places in the first gap: the active player, else the stealer. Locks in. */
const move = (state: GameState) => {
    const play = dealtPlay(state)
    if (play.step === 'stealing') return steal(state, 0)
    return play.step === 'placing' ? place(state, 0) : lockIn(state)
}

const continued = (state: GameState, by = playOf(state).activeId) =>
    apply(state, { type: 'continue', by })

/** A steal, by default by the current stealer (or the active player, when nobody is stealing). */
const steal = (state: GameState, slot: number, by?: string) => {
    if (by === undefined) {
        const play = dealtPlay(state)
        by = play.step === 'stealing' ? play.stealerId : play.activeId
    }
    return apply(state, { type: 'steal', by, slot })
}

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
                const result = move(state)
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
            while (playOf(state).step === 'stealing') state = ok(steal(state, 1))
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
            expect(loaded.schema).toBe(2)
            expect(lockIn(loaded, 'astrid').ok).toBe(false)
        }
    })

    it('upgrades a schema 1 state, with no last turn yet', () => {
        const state = create(twoPlayers())
        const { lastTurn: _, ...saved } = { ...JSON.parse(JSON.stringify(state)), schema: 1 }
        expect(load(saved)).toEqual(state)
    })
})

describe('seating', () => {
    const setSeating = (state: GameState, seating: string[], by = 'astrid') =>
        apply(state, { type: 'setSeating', by, seating })
    const confirm = (state: GameState, by = 'astrid', currentYear = 2026) =>
        apply(state, { type: 'confirmSeating', by, currentYear })

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
                const result = move(state)
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
                // The play that dealt the last Places card may still be deciding or stealing.
                if (placesLeft === 0 && play.step !== 'deciding' && play.step !== 'stealing') {
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
                const result = move(state)
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

/** A gap on `playerId`'s timeline where the card in play fits, or doesn't. */
const slotFor = (state: GameState, playerId: string, right: boolean) => {
    const { date } = state.cards[dealtPlay(state).cardId]
    const timeline = state.timelines[playerId]
    for (let slot = 0; slot <= timeline.length; slot++) {
        if (fits(timeline, slot, date) === right) return slot
    }
    throw new Error(`The card fits ${right ? 'no' : 'every'} gap on ${playerId}'s timeline.`)
}

/** The active player places the card in play rightly or wrongly. */
const play = (state: GameState, right: boolean) =>
    ok(place(state, slotFor(state, playOf(state).activeId, right)))

/** The current stealer tries to steal, rightly or wrongly. */
const stealing = (state: GameState, right: boolean) => {
    const play = dealtPlay(state)
    if (play.step !== 'stealing') throw new Error(`The play is ${play.step}.`)
    return ok(steal(state, slotFor(state, play.stealerId, right)))
}

describe('continuing', () => {
    const at1950 = deckOf(Array.from({ length: 10 }, () => 1950))
    const afterCorrectPlay = () =>
        placed(
            gameWhere(at1950, (anchor) => anchor < 1950),
            1,
        )

    it('starts a new play in the same turn, keeping the unlocked card', () => {
        const state = afterCorrectPlay()
        const { activeId, readerId, cardId } = dealtPlay(state)
        const next = ok(continued(state))
        const play = playOf(next)
        expect(play).toMatchObject({ activeId, readerId })
        expect(['placing', 'picking']).toContain(play.step)
        expect(next.timelines[activeId]).toContainEqual({
            kind: 'card',
            cardId,
            date: 1950,
            locked: false,
        })
        expect(next.log).toEqual([{ kind: 'play', playerId: activeId, cardId, correct: true }])
    })

    it('builds a bigger turn: lock in then scores every correct play', () => {
        const state = dealt(ok(continued(afterCorrectPlay())))
        const { activeId } = playOf(state)
        const next = ok(lockIn(play(state, true)))
        expect(score(next, activeId)).toBe(2)
        expect(playOf(next).activeId).not.toBe(activeId)
    })

    it('is offered only after a correct play', () => {
        const state = dealt(create(twoPlayers()))
        expect(continued(state)).toEqual({ ok: false, refusal: 'continue_unavailable' })
        const misplaced = gameWhere(at1950, (anchor) => anchor < 1950)
        expect(continued(placed(misplaced, 0))).toEqual({
            ok: false,
            refusal: 'continue_unavailable',
        })
        expect(continued(create(fourPlayers()), 'astrid')).toEqual({
            ok: false,
            refusal: 'continue_unavailable',
        })
    })

    it('is offered only to the active player', () => {
        const state = afterCorrectPlay()
        expect(continued(state, playOf(state).readerId)).toEqual({
            ok: false,
            refusal: 'not_your_turn',
        })
    })
})

describe('misplacing a card, and the steals', () => {
    const at1950 = deckOf(Array.from({ length: 20 }, () => 1950))

    /**
     * The first four-player game (by seed) with a card dealt where nobody's anchor is 1950, so
     * every player can place the card in play rightly or wrongly.
     */
    const fourPlayerGame = () => {
        for (const seed of seeds) {
            const state = dealt(ok(apply(create(fourPlayers({ seed, cards: at1950 })), confirm)))
            if (anchors(state).every((anchor) => anchor !== 1950)) return state
        }
        throw new Error('No seed keeps every anchor off 1950.')
    }
    const confirm = { type: 'confirmSeating', by: 'astrid', currentYear: 2026 } as const

    /** The players after `activeId` in seating order, the reader last. */
    const stealersAfter = (state: GameState, activeId: string) => {
        const order = [leftOf(state.seating, activeId)]
        while (order.length < state.seating.length - 1) {
            order.push(leftOf(state.seating, order[order.length - 1]))
        }
        return order
    }

    it('ends the turn’s plays and loses every unlocked card', () => {
        const state = dealt(ok(continued(play(fourPlayerGame(), true))))
        const { activeId } = playOf(state)
        const next = play(state, false)
        expect(next.timelines[activeId]).toEqual([
            { kind: 'anchor', date: anchorOf(next, activeId) },
        ])
        expect(score(next, activeId)).toBe(0)
        expect(playOf(next)).toMatchObject({ activeId, step: 'stealing' })
    })

    it('passes the card round in seating order, the reader last', () => {
        let state = play(fourPlayerGame(), false)
        const { activeId, readerId } = playOf(state)
        const stealers: string[] = []
        while (playOf(state).activeId === activeId) {
            const play = dealtPlay(state)
            if (play.step !== 'stealing') break
            stealers.push(play.stealerId)
            state = stealing(state, false)
        }
        expect(stealers).toEqual(stealersAfter(state, activeId))
        expect(stealers.at(-1)).toBe(readerId)
    })

    it('in a two-player game, gives the reader the only steal', () => {
        const state = gameWhere(at1950, (anchor) => anchor < 1950)
        const { activeId, readerId, cardId } = dealtPlay(state)
        const misplaced = placed(state, 0)
        expect(playOf(misplaced)).toMatchObject({ step: 'stealing', stealerId: readerId })
        const missed = stealing(misplaced, false)
        expect(missed.discards).toEqual([cardId])
        expect(playOf(missed).activeId).toBe(readerId)
        expect(score(missed, activeId)).toBe(0)
    })

    it('lets only the current stealer steal', () => {
        const state = play(fourPlayerGame(), false)
        const play_ = dealtPlay(state)
        if (play_.step !== 'stealing') throw new Error('Not stealing.')
        for (const other of state.seating.filter((id) => id !== play_.stealerId)) {
            expect(steal(state, 0, other)).toEqual({ ok: false, refusal: 'not_your_steal' })
        }
        expect(steal(state, 0, 'stranger')).toEqual({ ok: false, refusal: 'no_seat' })
        // Nor can the active player have another go.
        expect(place(state, 0)).toEqual({ ok: false, refusal: 'not_placing' })
        expect(lockIn(state)).toEqual({ ok: false, refusal: 'lock_in_unavailable' })
    })

    it('refuses a steal when no card is being stolen, or into a gap that is not there', () => {
        const state = fourPlayerGame()
        expect(steal(state, 0)).toEqual({ ok: false, refusal: 'not_stealing' })
        expect(steal(create(fourPlayers()), 0, 'astrid')).toEqual({
            ok: false,
            refusal: 'not_stealing',
        })
        const misplaced = play(state, false)
        expect(steal(misplaced, 2)).toEqual({ ok: false, refusal: 'invalid_slot' })
        expect(steal(misplaced, -1)).toEqual({ ok: false, refusal: 'invalid_slot' })
    })

    it('locks a correct steal on the stealer’s timeline for one point', () => {
        // The first stealer misses; the second steals it.
        const state = stealing(play(fourPlayerGame(), false), false)
        const play_ = dealtPlay(state)
        if (play_.step !== 'stealing') throw new Error('Not stealing.')
        const { activeId, stealerId, cardId } = play_
        const next = stealing(state, true)
        expect(next.timelines[stealerId]).toContainEqual({
            kind: 'card',
            cardId,
            date: 1950,
            locked: true,
        })
        expect(score(next, stealerId)).toBe(1)
        // The steal doesn't change the turn order: the player after the active one is up.
        expect(playOf(next).activeId).toBe(leftOf(next.seating, activeId))
        expect(playOf(next).activeId).not.toBe(leftOf(next.seating, stealerId))
    })

    it('costs nothing to miss', () => {
        const state = play(fourPlayerGame(), false)
        const play_ = dealtPlay(state)
        if (play_.step !== 'stealing') throw new Error('Not stealing.')
        const next = stealing(state, false)
        expect(next.timelines[play_.stealerId]).toEqual(state.timelines[play_.stealerId])
        expect(next.timelines).toEqual(state.timelines)
    })

    it('discards a card nobody places, never to be dealt again, and the next player is up', () => {
        let state = play(fourPlayerGame(), false)
        const { activeId, cardId } = dealtPlay(state)
        for (let i = 0; i < 3; i++) state = stealing(state, false)
        expect(state.discards).toEqual([cardId])
        expect(Object.values(state.queues).flat()).not.toContain(cardId)
        expect(playOf(state).activeId).toBe(leftOf(state.seating, activeId))
        for (const id of state.seating) expect(score(state, id)).toBe(0)
    })

    it('keeps the turn’s outcomes in the log, and moves them to the last turn when the next starts', () => {
        let state = dealt(ok(continued(play(fourPlayerGame(), true))))
        const { activeId } = playOf(state)
        const first = state.log[0]
        state = play(state, false)
        const { cardId } = dealtPlay(state)
        const stealers = stealersAfter(state, activeId)
        state = stealing(stealing(state, false), false)
        expect(state.log).toEqual([
            first,
            { kind: 'play', playerId: activeId, cardId, correct: false },
            { kind: 'steal', playerId: stealers[0], cardId, correct: false },
            { kind: 'steal', playerId: stealers[1], cardId, correct: false },
        ])
        expect(first).toMatchObject({ kind: 'play', playerId: activeId, correct: true })
        const next = stealing(state, false)
        expect(playOf(next).activeId).not.toBe(activeId)
        expect(next.log).toEqual([])
        expect(next.lastTurn).toEqual([
            ...state.log,
            { kind: 'steal', playerId: stealers[2], cardId, correct: false },
            { kind: 'discard', cardId },
        ])
        expect(create(fourPlayers()).lastTurn).toEqual([])
    })
})

describe('rounds and winning', () => {
    const at1950 = deckOf(Array.from({ length: 80 }, () => 1950))
    const threePlayers = (overrides: Partial<CreateInput> = {}) =>
        twoPlayers({
            players: [astrid, bjorn, cecilia],
            seating: ['astrid', 'bjorn', 'cecilia'],
            ...overrides,
        })
    const confirm = { type: 'confirmSeating', by: 'astrid', currentYear: 2026 } as const

    /**
     * The first three-player game (by seed) with a target of 3 where nobody's anchor is 1950, so
     * every player can place every card rightly or wrongly.
     */
    const threePlayerGame = (targetScore = 3) => {
        for (const seed of seeds) {
            const settings = { targetScore, exactYear: false, cardLanguage: 'en' } as const
            const state = ok(
                apply(create(threePlayers({ seed, cards: at1950, settings })), confirm),
            )
            if (anchors(state).every((anchor) => anchor !== 1950)) return state
        }
        throw new Error('No seed keeps every anchor off 1950.')
    }

    /** The active player's turn: `points` correct plays locked in, or with none, a misplaced card nobody steals. */
    const turn = (state: GameState, points: number) => {
        state = dealt(state)
        if (points === 0) {
            state = play(state, false)
            while (state.phase.name === 'playing' && playOf(state).step === 'stealing') {
                state = stealing(state, false)
            }
            return state
        }
        for (let i = 1; i < points; i++) state = dealt(ok(continued(play(state, true))))
        return ok(lockIn(play(state, true)))
    }

    /** Turns scoring `points` each, from whoever is active. */
    const turns = (state: GameState, ...points: number[]) =>
        points.reduce((next, n) => turn(next, n), state)

    /** The seated players from the starting player round, the order of every round. */
    const roundOrder = (state: GameState) => startingFrom(state.seating, state.startingPlayerId!)

    const setReseat = (state: GameState, reseat: boolean, by = 'astrid') =>
        apply(state, { type: 'setReseat', by, reseat })

    it('is one turn per player in seating order, and every round opens with the starting player', () => {
        let state = threePlayerGame()
        const active: string[] = []
        for (let i = 0; i < 6; i++) {
            active.push(playOf(state).activeId)
            state = turn(state, 0)
        }
        expect(active).toEqual([...roundOrder(state), ...roundOrder(state)])
    })

    it('doesn’t end the game when the target is reached mid-round', () => {
        const state = turn(threePlayerGame(), 3)
        const [first, second] = roundOrder(state)
        expect(score(state, first)).toBe(3)
        expect(playOf(state).activeId).toBe(second)
        expect(playOf(turn(state, 0)).activeId).not.toBe(first)
    })

    it('ends the game when the round ends, the highest score at or above the target winning', () => {
        const state = turns(threePlayerGame(), 3, 4, 0)
        const [, second] = roundOrder(state)
        expect(state.phase).toEqual({ name: 'finished', winners: [second] })
    })

    it('shares the win between equal top scores', () => {
        const state = turns(threePlayerGame(), 3, 0, 3)
        const [first, , third] = roundOrder(state)
        expect(state.phase).toEqual({
            name: 'finished',
            winners: state.seating.filter((id) => id === first || id === third),
        })
    })

    it('lets a player push past the target', () => {
        const state = turns(threePlayerGame(), 5, 0, 0)
        const [first] = roundOrder(state)
        expect(score(state, first)).toBe(5)
        expect(state.phase).toEqual({ name: 'finished', winners: [first] })
    })

    it('plays another round while nobody is at the target', () => {
        const state = turns(threePlayerGame(), 2, 2, 2)
        expect(state.phase.name).toBe('playing')
        expect(playOf(state).activeId).toBe(state.startingPlayerId)
    })

    it('counts only locked cards: unlocked cards lost at the end of the round never win', () => {
        let state = turns(threePlayerGame(), 0, 0)
        const [, , last] = roundOrder(state)
        // The last player of the round has the target unlocked, then misplaces.
        for (let i = 0; i < 3; i++) state = dealt(ok(continued(play(dealt(state), true))))
        state = play(state, false)
        while (playOf(state).step === 'stealing') state = stealing(state, false)
        expect(score(state, last)).toBe(0)
        expect(state.phase.name).toBe('playing')
        // Nor does an anchor count.
        for (const id of state.seating) expect(score(state, id)).toBe(0)
    })

    it('locks in the turn and ends the game when every category runs dry, the highest score winning', () => {
        // One card in all: the first player places it and presses on into an empty deck.
        const cards = deckOf([1950])
        for (const seed of seeds) {
            const state = dealt(create(twoPlayers({ seed, cards })))
            const { activeId } = playOf(state)
            if (anchorOf(state, activeId) === 1950) continue
            const next = ok(continued(play(state, true)))
            expect(next.phase).toEqual({ name: 'finished', winners: [activeId] })
            expect(next.timelines[activeId]).toContainEqual(
                expect.objectContaining({ kind: 'card', locked: true }),
            )
            expect(score(next, activeId)).toBe(1)
            return
        }
        throw new Error('No seed keeps the anchor off 1950.')
    })

    it('lets only the host flag or clear the reseat', () => {
        const state = threePlayerGame()
        expect(setReseat(state, true, 'bjorn')).toEqual({ ok: false, refusal: 'not_host' })
        const flagged = ok(setReseat(state, true))
        expect(flagged.reseat).toBe(true)
        expect(ok(setReseat(flagged, false)).reseat).toBe(false)
        // At any time: in the middle of a play too.
        expect(ok(setReseat(play(dealt(state), true), true)).reseat).toBe(true)
    })

    it('goes into seating at the end of a flagged round, and Confirm seating resumes play', () => {
        let state = ok(setReseat(turn(threePlayerGame(), 1), true))
        state = turns(state, 1, 1)
        expect(state.phase).toEqual({ name: 'seating' })
        expect(state.reseat).toBe(false)
        const timelines = state.timelines
        expect(place(state, 0, 'astrid')).toEqual({ ok: false, refusal: 'not_placing' })

        const [first, second, third] = roundOrder(state)
        // The host turns the table round; the next round still opens with the starting player.
        state = ok(
            apply(state, { type: 'setSeating', by: 'astrid', seating: [first, third, second] }),
        )
        state = ok(apply(state, confirm))
        expect(state.timelines).toEqual(timelines)
        expect(playOf(state)).toMatchObject({ activeId: first, readerId: second })
        expect(state.log).toEqual([])
        state = turn(state, 0)
        expect(playOf(state).activeId).toBe(third)
    })

    it('doesn’t reseat a round that was cleared, or one with a winner', () => {
        const cleared = ok(setReseat(ok(setReseat(threePlayerGame(), true)), false))
        expect(turns(cleared, 0, 0, 0).phase.name).toBe('playing')
        const won = turns(ok(setReseat(threePlayerGame(), true)), 3, 0, 0)
        expect(won.phase.name).toBe('finished')
    })

    it('never seats a two-player game', () => {
        for (const seed of seeds) {
            let state = create(twoPlayers({ seed, cards: at1950 }))
            if (anchors(state).includes(1950)) continue
            state = turns(ok(setReseat(state, true)), 0, 0)
            expect(state.phase.name).toBe('playing')
            expect(state.reseat).toBe(false)
            return
        }
    })

    it('clears a flag raised during seating when the host confirms it', () => {
        const flagged = ok(setReseat(turns(ok(setReseat(threePlayerGame(), true)), 0, 0, 0), true))
        expect(flagged.phase).toEqual({ name: 'seating' })
        const resumed = ok(apply(flagged, confirm))
        expect(resumed.reseat).toBe(false)
        expect(turns(resumed, 0, 0, 0).phase.name).toBe('playing')
        const first = ok(apply(ok(setReseat(create(threePlayers()), true)), confirm))
        expect(first.reseat).toBe(false)
    })

    it('refuses the reseat once the game is over', () => {
        const won = turns(threePlayerGame(), 3, 0, 0)
        expect(setReseat(won, true)).toEqual({ ok: false, refusal: 'game_over' })
    })
})

describe('skipping', () => {
    // Scenario players are astrid, björn, cecilia… in seating order, astrid the host.
    const skip = (state: GameState, playerId: string, by = 'astrid') =>
        apply(state, { type: 'skip', by, playerId })

    /** The active player's timeline with only what they had locked in. */
    const keptOf = (state: GameState, id: string) =>
        state.timelines[id].filter((entry) => entry.kind === 'anchor' || entry.locked)

    /** The views of every seat on the card in play. */
    const cardViews = (state: GameState) =>
        state.seating.map((seat) => {
            const view = redact(state, seat)
            if (view.phase.name !== 'playing' || view.phase.play.step === 'picking') {
                throw new Error('No card is in play.')
            }
            return { seat, ...view.phase.play.card }
        })

    it('of the active player while a card is in play discards it and ends the turn, the unlocked cards lost', () => {
        const state = scenario().players(4).activePlayer(2).unlocked(2).build().state
        const { activeId, cardId } = dealtPlay(state)
        const next = ok(skip(state, activeId))
        expect(next.discards).toEqual([...state.discards, cardId])
        expect(next.timelines[activeId]).toEqual(keptOf(state, activeId))
        expect(playOf(next).activeId).toBe(leftOf(next.seating, activeId))
        // The card left the game with its date revealed.
        expect(redact(next, 'astrid').cards[cardId]).toEqual(state.cards[cardId])
        // Everyone can still see how the skipped turn ended.
        expect(next.log).toEqual([])
        expect(redact(next, 'astrid').lastTurn).toEqual([
            ...state.log,
            { kind: 'skip', playerId: activeId, what: 'turn' },
            { kind: 'discard', cardId },
        ])
    })

    it('of the active player at the lock-in choice ends the turn, the unlocked cards lost', () => {
        const state = scenario()
            .players(3)
            .activePlayer(1)
            .step('deciding')
            .unlocked(2)
            .build().state
        const { activeId } = playOf(state)
        const next = ok(skip(state, activeId))
        expect(next.discards).toEqual(state.discards)
        expect(next.timelines[activeId]).toEqual(keptOf(state, activeId))
        expect(score(next, activeId)).toBe(score(state, activeId))
        expect(playOf(next).activeId).toBe(leftOf(next.seating, activeId))
    })

    it('of the active player at a Free choice ends the turn with nothing discarded', () => {
        const state = scenario().players(3).step('freeChoice').build().state
        const { activeId } = playOf(state)
        const next = ok(skip(state, activeId))
        expect(next.discards).toEqual(state.discards)
        expect(playOf(next).activeId).toBe(leftOf(next.seating, activeId))
    })

    it('of the current stealer passes the card to the next one, and is in the log', () => {
        const state = scenario().players(4).step('stealing').build().state
        const play = dealtPlay(state)
        if (play.step !== 'stealing') throw new Error('Not stealing.')
        const next = ok(skip(state, play.stealerId))
        expect(dealtPlay(next)).toMatchObject({
            step: 'stealing',
            stealerId: leftOf(next.seating, play.stealerId),
        })
        expect(next.timelines).toEqual(state.timelines)
        expect(next.log).toEqual([
            ...state.log,
            { kind: 'skip', playerId: play.stealerId, what: 'steal' },
        ])
    })

    it('of the second stealer leaves the next one stealing, the reader last, and no view has the date', () => {
        for (const players of [4, 5]) {
            const state = scenario().players(players).step('stealing').missedSteal().build().state
            const play = dealtPlay(state)
            if (play.step !== 'stealing') throw new Error('Not stealing.')
            const next = ok(skip(state, play.stealerId))
            const after = dealtPlay(next)
            if (after.step !== 'stealing') throw new Error('Not stealing.')
            expect(after.stealerId).toBe(leftOf(next.seating, play.stealerId))
            if (players === 4) expect(after.stealerId).toBe(play.readerId)
            for (const view of cardViews(next)) expect(view.date).toBeNull()
        }
    })

    it('of the last stealer discards the card, and the next player is up', () => {
        const state = scenario().players(3).step('stealing').missedSteal().build().state
        const { activeId, cardId, readerId } = dealtPlay(state)
        const next = ok(skip(state, readerId))
        expect(next.discards).toEqual([...state.discards, cardId])
        expect(playOf(next).activeId).toBe(leftOf(next.seating, activeId))
    })

    it('of the reader moves the reading and the card text to the next player before the active one', () => {
        const state = scenario().players(4).activePlayer(2).build().state
        const { activeId, readerId } = dealtPlay(state)
        const next = ok(skip(state, readerId))
        const reader = rightOf(next.seating, readerId)
        expect(dealtPlay(next)).toMatchObject({ activeId, step: 'placing', readerId: reader })
        for (const view of cardViews(next)) {
            expect(view.text !== null).toBe(view.seat === reader)
            expect(view.date).toBeNull()
        }
        expect(next.log).toEqual([
            ...state.log,
            { kind: 'skip', playerId: readerId, what: 'reading' },
        ])
    })

    it('of the reader goes round to the first reader again, never to the active player', () => {
        const state = scenario().players(3).activePlayer(1).build().state
        const { readerId } = dealtPlay(state)
        const once = ok(skip(state, readerId))
        const twice = ok(skip(once, dealtPlay(once).readerId))
        expect(dealtPlay(once).readerId).not.toBe(dealtPlay(once).activeId)
        expect(dealtPlay(twice).readerId).toBe(readerId)
    })

    it("of the reader passes a waiting Reader's choice to the new reader", () => {
        const state = scenario().players(4).step('readersChoice').build().state
        const { readerId } = playOf(state)
        const next = ok(skip(state, readerId))
        const reader = playOf(next).readerId
        const pick = (by: string) =>
            apply(next, { type: 'pickCategory', by, category: Object.keys(next.queues)[0] })
        expect(pick(readerId)).toEqual({ ok: false, refusal: 'not_your_pick' })
        expect(dealtPlay(ok(pick(reader)))).toMatchObject({ step: 'placing', readerId: reader })
    })

    it('of the reader is refused with nobody else to read', () => {
        const state = scenario().players(2).build().state
        expect(skip(state, dealtPlay(state).readerId)).toEqual({
            ok: false,
            refusal: 'no_other_reader',
        })
    })

    it('is refused for anyone but the host', () => {
        const placing = scenario().players(4).activePlayer(2).build().state
        const stealing = scenario().players(4).activePlayer(2).step('stealing').build().state
        const stealingPlay = dealtPlay(stealing)
        if (stealingPlay.step !== 'stealing') throw new Error('Not stealing.')
        const targets = [
            [placing, dealtPlay(placing).activeId],
            [placing, dealtPlay(placing).readerId],
            [stealing, stealingPlay.stealerId],
        ] as const
        for (const [state, playerId] of targets) {
            for (const by of state.seating.filter((id) => id !== 'astrid')) {
                expect(skip(state, playerId, by)).toEqual({ ok: false, refusal: 'not_host' })
            }
            expect(skip(state, playerId).ok).toBe(true)
        }
    })

    it('is refused for a player who is holding nothing up', () => {
        const placing = scenario().players(4).activePlayer(2).build().state
        const { activeId, readerId } = dealtPlay(placing)
        const bystander = placing.seating.find((id) => id !== activeId && id !== readerId)!
        expect(skip(placing, bystander)).toEqual({ ok: false, refusal: 'nothing_to_skip' })
        expect(skip(placing, 'stranger')).toEqual({ ok: false, refusal: 'nothing_to_skip' })

        const deciding = scenario().players(4).step('deciding').build().state
        expect(skip(deciding, dealtPlay(deciding).readerId)).toEqual({
            ok: false,
            refusal: 'nothing_to_skip',
        })

        const stealing = scenario().players(4).step('stealing').build().state
        expect(skip(stealing, dealtPlay(stealing).activeId)).toEqual({
            ok: false,
            refusal: 'nothing_to_skip',
        })

        const seating = create(fourPlayers())
        expect(skip(seating, 'bjorn')).toEqual({ ok: false, refusal: 'nothing_to_skip' })
    })

    it('is refused once the game is over', () => {
        const state = scenario().players(2).target(3).scores([3, 0]).activePlayer(2).build().state
        const won = ok(skip(state, playOf(state).activeId))
        expect(won.phase.name).toBe('finished')
        expect(skip(won, 'astrid')).toEqual({ ok: false, refusal: 'game_over' })
    })
})
