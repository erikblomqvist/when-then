import { describe, expect, it } from 'vite-plus/test'
import type { ExportedCard } from '../cards/card-export'
import { encodeExport } from './card-export'

const card = (id: string, text: string): ExportedCard => ({
    id,
    status: 'draft',
    category: { id: 'c1', name: 'Events' },
    date: { decade: -499, year: null, month: null, day: null },
    sourceUrl: null,
    sourceQuote: null,
    tags: [],
    difficulty: null,
    translations: { en: { text, note: null, status: 'reviewed' } },
    verifiedAt: null,
    verifiedBy: null,
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T10:00:00Z',
})

async function* cards(...list: ExportedCard[]) {
    for (const item of list) yield item
}

const text = (stream: ReadableStream<Uint8Array>) => new Response(stream).text()

describe('encodeExport', () => {
    it('writes CSV with a byte order mark, the header and one line per card', async () => {
        const csv = await text(encodeExport(cards(card('a', 'First'), card('b', 'Två')), 'csv'))
        // Response.text() strips the BOM; check the raw bytes for it.
        const bytes = new Uint8Array(await new Response(encodeExport(cards(), 'csv')).arrayBuffer())
        expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf])
        expect(csv.split('\r\n')).toEqual([
            'text_en,decade,year,month,day,category,source_url,source_quote,text_sv,text_nb,tags,status,id',
            'First,-499,,,,Events,,,,,,draft,a',
            'Två,-499,,,,Events,,,,,,draft,b',
            '',
        ])
    })

    it('writes JSON as an array of full cards', async () => {
        const first = card('a', 'First')
        const json = await text(encodeExport(cards(first, card('b', 'Second')), 'json'))
        const parsed = JSON.parse(json) as ExportedCard[]
        expect(parsed.map((item) => item.id)).toEqual(['a', 'b'])
        expect(parsed[0]).toEqual(first)
    })

    it('writes an empty JSON array for no cards', async () => {
        expect(JSON.parse(await text(encodeExport(cards(), 'json')))).toEqual([])
    })
})
