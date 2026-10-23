import { describe, expect, it } from 'vite-plus/test'
import { apply, create } from './machine'
import type { DeckCard } from './state'
import { redact } from './view'

const deck: DeckCard[] = Array.from({ length: 12 }, (_, i) => ({
    id: `card-${i}`,
    category: i % 2 ? 'events' : 'people',
    text: `Secret statement number ${i}`,
    date: 1950,
}))

const game = (seed = 3) =>
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
    const { activeId, readerId, cardId } = playOf(state)
    const text = state.cards[cardId].text

    it('gives the card text to the reader only', () => {
        expect(playOf(redact(state, readerId)).card.text).toBe(text)
        expect(playOf(redact(state, activeId)).card.text).toBeNull()
    })

    it("hides the card's date from every seat", () => {
        for (const seat of [activeId, readerId]) {
            expect(playOf(redact(state, seat)).card.date).toBeNull()
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

describe('what a seat sees after a correct play', () => {
    it('shows everyone the card, its date and its text', () => {
        const state = afterCorrectPlay()
        const { activeId, readerId, cardId } = playOf(state)
        for (const seat of [activeId, readerId]) {
            const view = redact(state, seat)
            expect(playOf(view).card).toEqual({
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
        for (const state of [game(), afterCorrectPlay()]) {
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
        const { activeId, readerId, cardId } = playOf(state)
        const { text } = state.cards[cardId]
        expect(JSON.stringify(redact(state, activeId))).not.toContain(text)
        for (const seat of [activeId, readerId]) {
            expect(JSON.stringify(redact(state, seat))).not.toContain(`"${cardId}"`)
        }
    })
})
