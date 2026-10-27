import { describe, expect, it } from 'vite-plus/test'
import { apply, create, type ApplyResult, type Command } from './machine'
import { fits, type DeckCard, type GameState } from './state'
import { scenario } from './scenario'
import { redact, standings } from './view'

const deck: DeckCard[] = Array.from({ length: 12 }, (_, i) => ({
    id: `card-${i}`,
    category: ['people', 'events', 'places'][i % 3],
    text: `Secret statement number ${i}.`,
    date: 1950,
}))

const created = (seed: number) =>
    create({
        players: [
            { id: 'astrid', name: 'Astrid', icon: 'cat', host: true },
            { id: 'bjorn', name: 'Björn', icon: 'dog', host: false },
        ],
        settings: { targetScore: 10, exactYear: false, cardLanguage: 'en' },
        seating: ['astrid', 'bjorn'],
        cards: deck,
        seed,
        currentYear: 2026,
    })

/** The play in progress, in the state or a view, failing the test when there is none. */
const playOf = <P>(of: {
    phase: { name: string } | { name: 'playing'; activeId: string; play: P }
}) => {
    if (!('play' in of.phase)) throw new Error(`The game is ${of.phase.name}.`)
    return { activeId: of.phase.activeId, ...of.phase.play }
}

/** The play in progress with its card dealt, failing the test while a category waits. */
const dealtPlay = <P extends { step: string }>(of: {
    phase: { name: string } | { name: 'playing'; activeId: string; play: P }
}) => {
    const play = playOf(of)
    if (play.step === 'picking') throw new Error('The play is waiting for a category.')
    return play as Exclude<typeof play, { step: 'picking' }>
}

/** A game with a card dealt: on a Reader's or Free choice, the picker takes the first category. */
const game = (seed = 3) => {
    const state = created(seed)
    const play = playOf(redact(state, 'astrid'))
    if (play.step !== 'picking') return state
    const result = apply(state, {
        type: 'pickCategory',
        by: play.pickerId,
        category: play.categories[0],
    })
    if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
    return result.state
}

/** The first game (by seed) whose first draw lands on `kind`. */
const drawing = (kind: 'readersChoice' | 'freeChoice') => {
    for (let seed = 1; seed < 50; seed++) {
        const state = created(seed)
        if (playOf(state).draw.kind === kind) return state
    }
    throw new Error(`No seed draws ${kind}.`)
}

/** A game where the active player has just placed the card correctly. */
const afterCorrectPlay = () => {
    for (let seed = 1; seed < 50; seed++) {
        const state = game(seed)
        const anchor = state.timelines[playOf(state).activeId][0].date
        if (anchor < 1950) {
            const result = apply(state, { type: 'place', by: playOf(state).activeId, slot: 1 })
            if (result.ok) return result.state
        }
    }
    throw new Error('No seed gives an early anchor.')
}

describe('what a seat sees while a card waits to be placed', () => {
    const state = game()
    const { activeId, readerId, cardId } = dealtPlay(state)
    const text = state.cards[cardId].text

    it('gives the card text to the reader only', () => {
        expect(dealtPlay(redact(state, readerId)).card.text).toBe(text)
        expect(dealtPlay(redact(state, activeId)).card.text).toBeNull()
    })

    it("hides the card's date from every seat", () => {
        for (const seat of [activeId, readerId]) {
            expect(dealtPlay(redact(state, seat)).card.date).toBeNull()
        }
    })

    it('shows everyone the category, the roles, the timelines and the scores', () => {
        const view = redact(state, activeId)
        expect(playOf(view)).toMatchObject({
            activeId,
            readerId,
            step: 'placing',
            card: { category: state.cards[cardId].category },
        })
        expect(view.seat).toBe(activeId)
        expect(view.timelines).toEqual(state.timelines)
        expect(view.scores).toEqual({ astrid: 0, bjorn: 0 })
    })
})

describe("what a seat sees while a Reader's or Free choice waits", () => {
    it('shows everyone which choice it is, who picks and what they can pick', () => {
        for (const [kind, picker] of [
            ['readersChoice', 'readerId'],
            ['freeChoice', 'activeId'],
        ] as const) {
            const state = drawing(kind)
            const play = playOf(state)
            for (const seat of ['astrid', 'bjorn']) {
                expect(playOf(redact(state, seat))).toEqual({
                    activeId: play.activeId,
                    step: 'picking',
                    readerId: play.readerId,
                    draw: { kind },
                    pickerId: play[picker],
                    categories: ['people', 'events', 'places'],
                })
            }
        }
    })

    it('offers only the categories with cards left', () => {
        // Pick Events at every choice until it runs dry; the next choice offers the other two.
        for (let seed = 1; seed < 50; seed++) {
            let state = created(seed)
            while (state.phase.name === 'playing') {
                const view = playOf(redact(state, 'astrid'))
                if (view.step === 'picking' && !view.categories.includes('events')) {
                    expect(view.categories).toEqual(['people', 'places'])
                    return
                }
                const result = apply(
                    state,
                    view.step === 'picking'
                        ? { type: 'pickCategory', by: view.pickerId, category: 'events' }
                        : view.step === 'placing'
                          ? { type: 'place', by: view.activeId, slot: 0 }
                          : view.step === 'stealing'
                            ? { type: 'steal', by: view.stealerId, slot: 0 }
                            : { type: 'lockIn', by: view.activeId },
                )
                if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
                state = result.state
            }
        }
        throw new Error('No seed draws a choice after Events runs dry.')
    })
})

describe('what a seat sees after a correct play', () => {
    it('shows everyone the card, its date and its text', () => {
        const state = afterCorrectPlay()
        const { activeId, readerId, cardId } = dealtPlay(state)
        for (const seat of [activeId, readerId]) {
            const view = redact(state, seat)
            expect(dealtPlay(view).card).toEqual({
                category: state.cards[cardId].category,
                text: state.cards[cardId].text,
                date: 1950,
            })
            expect(view.cards[cardId]).toEqual(state.cards[cardId])
        }
    })
})

describe('what no seat ever sees', () => {
    it('leaves out the seed, the queues and every card not yet dealt', () => {
        for (const state of [game(), afterCorrectPlay(), drawing('readersChoice')]) {
            const undealt = Object.values(state.queues).flat()
            expect(undealt.length).toBeGreaterThan(0)
            for (const seat of ['astrid', 'bjorn']) {
                const serialised = JSON.stringify(redact(state, seat))
                expect(serialised).not.toMatch(/"(seed|rng|position|queues)"/)
                for (const id of undealt) {
                    expect(serialised).not.toContain(`"${id}"`)
                    expect(serialised).not.toContain(state.cards[id].text)
                }
            }
        }
    })

    it('leaves out the card in play, but for its text on the reader’s phone', () => {
        const state = game()
        const { activeId, readerId, cardId } = dealtPlay(state)
        const { text } = state.cards[cardId]
        expect(JSON.stringify(redact(state, activeId))).not.toContain(text)
        for (const seat of [activeId, readerId]) {
            expect(JSON.stringify(redact(state, seat))).not.toContain(`"${cardId}"`)
        }
    })
})

describe('what a seat sees during the steals', () => {
    const players = ['astrid', 'bjorn', 'cecilia', 'dag']
    const ok = (result: ApplyResult) => {
        if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
        return result.state
    }
    const run = (state: GameState, command: Command) => ok(apply(state, command))

    /** A slot on `playerId`'s timeline where the card in play fits, or doesn't. */
    const slotFor = (state: GameState, playerId: string, right: boolean) => {
        const { date } = state.cards[dealtPlay(state).cardId]
        const timeline = state.timelines[playerId]
        for (let slot = 0; slot <= timeline.length; slot++) {
            if (fits(timeline, slot, date) === right) return slot
        }
        throw new Error('No such slot.')
    }

    /**
     * A four-player game where the active player has placed one card correctly, continued and
     * misplaced the next: the first stealer is up. Every anchor is off 1950, so anyone can miss.
     */
    const misplaced = () => {
        for (let seed = 1; seed < 50; seed++) {
            let state = create({
                players: players.map((id, i) => ({
                    id,
                    name: id,
                    icon: (['cat', 'dog', 'bird', 'fish'] as const)[i],
                    host: i === 0,
                })),
                settings: { targetScore: 10, exactYear: false, cardLanguage: 'en' },
                seating: players,
                cards: deck,
                seed,
                currentYear: 2026,
            })
            state = run(state, { type: 'confirmSeating', by: 'astrid', currentYear: 2026 })
            const anchors = players.map((id) => state.timelines[id][0].date)
            if (anchors.includes(1950)) continue
            const pick = (s: GameState) => {
                const play = playOf(redact(s, 'astrid'))
                if (play.step !== 'picking') return s
                return run(s, {
                    type: 'pickCategory',
                    by: play.pickerId,
                    category: play.categories[0],
                })
            }
            state = pick(state)
            const by = playOf(state).activeId
            state = run(state, { type: 'place', by, slot: slotFor(state, by, true) })
            state = pick(run(state, { type: 'continue', by }))
            return run(state, { type: 'place', by, slot: slotFor(state, by, false) })
        }
        throw new Error('No seed keeps every anchor off 1950.')
    }

    it('for each attempt, hides the date from every seat and keeps the text for the reader', () => {
        let state = misplaced()
        const { activeId, readerId, cardId } = dealtPlay(state)
        const { text } = state.cards[cardId]
        let attempts = 0
        for (;;) {
            const play = dealtPlay(state)
            if (play.step !== 'stealing' || play.activeId !== activeId) break
            attempts++
            for (const seat of players) {
                const view = dealtPlay(redact(state, seat))
                expect(view).toMatchObject({ step: 'stealing', stealerId: play.stealerId })
                expect(view.card.date).toBeNull()
                expect(view.card.text).toBe(seat === readerId ? text : null)
            }
            const bystander = players.find(
                (id) => ![activeId, readerId, play.stealerId].includes(id),
            )
            expect(bystander).toBeDefined()
            expect(dealtPlay(redact(state, play.stealerId)).card.text).toBe(
                play.stealerId === readerId ? text : null,
            )
            expect(dealtPlay(redact(state, bystander!)).card.text).toBeNull()
            state = run(state, {
                type: 'steal',
                by: play.stealerId,
                slot: slotFor(state, play.stealerId, false),
            })
        }
        expect(attempts).toBe(3)
    })

    it('shows everyone the card the active player lost, with its date', () => {
        const state = misplaced()
        const [lost] = state.log
        if (lost.kind !== 'play') throw new Error('The log starts with a play.')
        for (const seat of players) {
            expect(redact(state, seat).cards[lost.cardId]).toEqual(state.cards[lost.cardId])
        }
    })

    it('reveals a card nobody steals, with its date, to every seat', () => {
        let state = misplaced()
        const { cardId } = dealtPlay(state)
        for (let i = 0; i < 3; i++) {
            const play = dealtPlay(state)
            if (play.step !== 'stealing') throw new Error('Not stealing.')
            state = run(state, {
                type: 'steal',
                by: play.stealerId,
                slot: slotFor(state, play.stealerId, false),
            })
        }
        for (const seat of players) {
            const view = redact(state, seat)
            expect(view.discards).toEqual([cardId])
            expect(view.cards[cardId]).toEqual(state.cards[cardId])
        }
    })
})

describe('what a seat sees of the last turn', () => {
    it('shows every seat how it ended, and the cards it lost, with their dates', () => {
        // The active player plays a correct card, continues and misplaces; nobody steals it.
        const { state } = scenario()
            .players(3)
            .unlocked(1)
            .misplace()
            .missedSteal()
            .missedSteal()
            .build()
        const lost = state.lastTurn.find((entry) => entry.kind === 'play' && entry.correct)
        if (lost?.kind !== 'play') throw new Error('No correct play in the last turn.')
        expect(state.lastTurn.at(-1)).toMatchObject({ kind: 'discard' })
        for (const seat of state.seating) {
            const view = redact(state, seat)
            expect(view.lastTurn).toEqual(state.lastTurn)
            expect(view.cards[lost.cardId]).toEqual(state.cards[lost.cardId])
        }
    })
})

describe('what a seat sees of the reseat flag', () => {
    it('shows every seat whether the host asked to reseat after this round', () => {
        const state = game()
        expect(redact(state, 'bjorn').reseat).toBe(false)
        const result = apply(state, { type: 'setReseat', by: 'astrid', reseat: true })
        if (!result.ok) throw new Error(`Refused: ${result.refusal}`)
        for (const seat of ['astrid', 'bjorn']) expect(redact(result.state, seat).reseat).toBe(true)
    })
})

describe('the standings at the end', () => {
    it('ranks the seated players by locked score, a tie in seating order, with no winner when ended early', () => {
        const { view } = scenario().players(4).scores([2, 5, 2, 0]).endEarly().build()
        const [first, second, third, fourth] = view.seating
        expect(
            standings(view).map(({ player, score, winner }) => [player.id, score, winner]),
        ).toEqual([
            [second, 5, false],
            [first, 2, false],
            [third, 2, false],
            [fourth, 0, false],
        ])
    })

    it('marks the winners of a won game', () => {
        const { view } = scenario().players(3).scores([4, 4, 1]).endEarly().build()
        const [first, second] = view.seating
        const won = { ...view, phase: { name: 'finished' as const, winners: [first, second] } }
        expect(standings(won).map(({ winner }) => winner)).toEqual([true, true, false])
    })

    it('leaves out the players the host removed', () => {
        const { view } = scenario().players(3).removed([3]).endEarly().build()
        const removed = view.players.find((player) => player.removed)!
        expect(standings(view).map(({ player }) => player.id)).toEqual(view.seating)
        expect(standings(view).map(({ player }) => player.id)).not.toContain(removed.id)
    })
})
