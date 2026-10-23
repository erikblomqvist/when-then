// Reading cards for export against the local database: filters, explicit ids and paging.
// Uses the seeded made-up cards; "Sample" matches exactly three of them, one archived (the
// balloonist), which only the Archived tab's filter exports.

import { expect, test } from '@playwright/test'
import { localServiceClient } from '../testing/e2e-auth'
import { exportedCards } from './card-export'
import type { ExportSelection } from '../cards/card-export'

const db = localServiceClient()

const sampleby = '00000000-0000-4000-9000-000000000004'
const balloonist = '00000000-0000-4000-9000-000000000005'
const samplebridge = '00000000-0000-4000-9000-000000000006'

async function all(selection: ExportSelection, options?: { batchSize?: number }) {
    const cards = []
    for await (const card of exportedCards(db, selection, options)) cards.push(card)
    return cards
}

test('exports the cards matching a filter, in full, in id order', async () => {
    const cards = await all({ filter: { search: 'Sample' } })
    expect(cards.map((card) => card.id)).toEqual([sampleby, samplebridge])
    const archived = await all({ filter: { search: 'Sample', archived: true } })
    expect(archived.map((card) => card.id)).toEqual([balloonist])
    expect(cards[0]).toMatchObject({
        status: 'published',
        category: { id: '00000000-0000-4000-8000-000000000004', name: 'Places' },
        date: { decade: -49, year: -44, month: null, day: null },
        sourceUrl: 'https://example.com/sampleby',
        sourceQuote: 'the lighthouse was lit in 44 BC',
        tags: [],
        translations: {
            en: {
                text: 'The made-up port of Sampleby lights its first lighthouse',
                status: 'reviewed',
            },
            sv: { text: 'Den påhittade hamnen Sampleby tänder sitt första fyrtorn' },
            nb: { status: 'machine' },
        },
    })
    expect(cards[0]!.verifiedAt).not.toBeNull()
})

test('pages through more cards than one batch without repeats or gaps', async () => {
    const cards = await all({ filter: { search: 'Sample' } }, { batchSize: 1 })
    expect(cards.map((card) => card.id)).toEqual([sampleby, samplebridge])
    const everything = await all({ filter: {} }, { batchSize: 2 })
    expect(everything.length).toBeGreaterThanOrEqual(5)
    expect(new Set(everything.map((card) => card.id)).size).toBe(everything.length)
})

test('exports exactly the selected ids, and nothing for none', async () => {
    const cards = await all({ ids: [samplebridge, sampleby] })
    expect(cards.map((card) => card.id)).toEqual([sampleby, samplebridge])
    expect(await all({ ids: [] })).toEqual([])
})
