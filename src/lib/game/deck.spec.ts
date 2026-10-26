import { describe, expect, it } from 'vite-plus/test'
import { deckFromRows, type DeckRow } from './deck'

const row = (overrides: Partial<DeckRow> = {}): DeckRow => ({
    id: 'card-1',
    categoryId: 'events',
    categoryPosition: 0,
    year: 1969,
    decade: 1960,
    texts: { en: 'The first Moon landing', sv: 'Den första månlandningen' },
    ...overrides,
})

describe('deckFromRows', () => {
    it('deals a card in the card language', () => {
        expect(deckFromRows([row()], 'sv')).toEqual([
            { id: 'card-1', category: 'events', text: 'Den första månlandningen', date: 1969 },
        ])
    })

    it('falls back to English when the card has no text in the card language', () => {
        expect(deckFromRows([row()], 'nb')[0].text).toBe('The first Moon landing')
    })

    it('leaves out a card with no text in the card language or English', () => {
        expect(deckFromRows([row({ texts: { sv: 'Bara svenska' } })], 'nb')).toEqual([])
    })

    it('dates a card by its year, or its decade when the year is not known', () => {
        const deck = deckFromRows(
            [
                row({ id: 'year', year: 1969, decade: 1960 }),
                row({ id: 'decade', year: null, decade: 1490 }),
            ],
            'en',
        )
        expect(deck.map((card) => card.date)).toEqual([1969, 1490])
    })

    it('leaves out a card with no date to place it by', () => {
        expect(deckFromRows([row({ year: null, decade: null })], 'en')).toEqual([])
    })

    it('lists the categories in their order, so the queues keep it', () => {
        const deck = deckFromRows(
            [
                row({ id: 'b', categoryId: 'people', categoryPosition: 2 }),
                row({ id: 'a', categoryId: 'events', categoryPosition: 1 }),
                row({ id: 'c', categoryId: 'people', categoryPosition: 2 }),
            ],
            'en',
        )
        expect(deck.map((card) => card.category)).toEqual(['events', 'people', 'people'])
    })
})
