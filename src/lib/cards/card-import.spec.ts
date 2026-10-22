import { describe, expect, it } from 'vite-plus/test'
import { planCardImport, type ImportCategory } from './card-import'

const events: ImportCategory = { id: 'c-events', name: 'Events', archived: false }
const people: ImportCategory = { id: 'c-people', name: 'People', archived: false }
const categories = new Map([
    ['events', events],
    ['people', people],
])

const header = 'text_en,decade,year,month,day,category,source_url,source_quote,text_sv,text_nb,tags'

const plan = (...lines: string[]) => planCardImport([header, ...lines].join('\r\n'), categories)

describe('planCardImport', () => {
    it('turns a valid row into a draft card with its translations and tags', () => {
        const result = plan(
            'A made-up bridge opens,1890,1895,7,4,Events,https://example.com/bridge,"It opened, at last",En påhittad bro öppnas,En oppdiktet bro åpner,bridges; made-up',
        )

        expect(result).toEqual({
            ok: true,
            rows: [
                {
                    row: 1,
                    text: 'A made-up bridge opens',
                    category: 'Events',
                    errors: [],
                    card: {
                        categoryId: 'c-events',
                        date: { decade: 1890, year: 1895, month: 7, day: 4 },
                        sourceUrl: 'https://example.com/bridge',
                        sourceQuote: 'It opened, at last',
                        tags: ['bridges', 'made-up'],
                        translations: {
                            en: 'A made-up bridge opens',
                            sv: 'En påhittad bro öppnas',
                            nb: 'En oppdiktet bro åpner',
                        },
                    },
                },
            ],
        })
    })

    const rowsOf = (...lines: string[]) => {
        const result = plan(...lines)
        if (!result.ok) throw new Error(result.error)
        return result.rows
    }
    const errorsOf = (line: string) => rowsOf(line)[0]!.errors

    it('reads signed BC years and fills the decade from the year', () => {
        const [row] = rowsOf('Made-up Sampleby founded,,-44,,,events,,,,,')
        expect(row!.card?.date).toEqual({ decade: -49, year: -44, month: null, day: null })
        expect(row!.card?.categoryId).toBe('c-events')
        expect(row!.card?.translations).toEqual({ en: 'Made-up Sampleby founded' })
        expect(row!.card?.tags).toEqual([])
    })

    it('reports a missing English text and a missing category', () => {
        expect(errorsOf(',,1895,,,,,,Bara svenska,,')).toEqual([
            { column: 'text_en', message: 'The English text is missing.' },
            { column: 'category', message: 'The category is missing.' },
        ])
    })

    it('reports bad date parts', () => {
        expect(errorsOf('A,,1895,13,,Events,,,,,')).toEqual([
            { column: 'month', message: 'Month must be 1 to 12.' },
        ])
        expect(errorsOf('A,,0,,,Events,,,,,')).toEqual([
            { column: 'year', message: 'There is no year 0: 1 BC is followed by AD 1.' },
        ])
        expect(errorsOf('A,,1895,2,30,Events,,,,,')).toEqual([
            { column: 'day', message: 'February 1895 has 28 days.' },
        ])
        expect(errorsOf('A,1900,1895,,,Events,,,,,')).toEqual([
            { column: 'decade', message: 'The decade must contain the year (1890s).' },
        ])
        expect(errorsOf('A,,,5,,Events,,,,,')).toEqual([
            { column: 'month', message: 'A month needs a year.' },
        ])
        expect(errorsOf('A,1895,,,,Events,,,,,')).toEqual([
            { column: 'decade', message: 'Not a decade.' },
        ])
        expect(errorsOf('A,,about 1895,,,Events,,,,,')).toEqual([
            { column: 'year', message: 'Year must be a whole number, negative for BC.' },
        ])
    })

    it('reports an unknown or archived category, matching names regardless of case', () => {
        const withArchived = new Map([
            ...categories,
            ['places', { id: 'c-places', name: 'Places', archived: true }],
        ])
        const result = planCardImport(
            [
                header,
                'A,,1895,,,Gadgets,,,,,',
                'B,,1895,,,places,,,,,',
                'C,,1895,, , PEOPLE ,,,,,',
            ].join('\n'),
            withArchived,
        )
        expect(result.ok && result.rows.map((row) => row.errors)).toEqual([
            [{ column: 'category', message: 'There is no category "Gadgets".' }],
            [{ column: 'category', message: 'The category "Places" is archived.' }],
            [],
        ])
        expect(result.ok && result.rows[2]!.card?.categoryId).toBe('c-people')
    })

    it('reports a source that is not a web address', () => {
        expect(errorsOf('A,,1895,,,Events,example.com/bridge,,,,')).toEqual([
            { column: 'source_url', message: 'Use a full web address, starting with https://.' },
        ])
    })

    it('numbers rows from the first under the header and keeps going after a bad one', () => {
        const rows = rowsOf(
            'Good one,,1895,,,Events,,,,,',
            '',
            ',,,,,Events,,,,,',
            'Also good,,,,,People,,,,,',
        )
        expect(rows.map((row) => [row.row, row.card !== null])).toEqual([
            [1, true],
            [2, false],
            [3, true],
        ])
    })

    it('reads an exported file: extra columns ignored, columns in any order, optional ones left out', () => {
        const exported = planCardImport(
            `${header},status,id\r\nA,,1895,,,Events,,,,,,published,00000000-0000-4000-9000-000000000004\r\n`,
            categories,
        )
        expect(exported.ok && exported.rows[0]!.card).toMatchObject({ categoryId: 'c-events' })

        const reordered = planCardImport('Category,Text_EN\nPeople,Someone made up', categories)
        expect(reordered.ok && reordered.rows[0]!.card).toEqual({
            categoryId: 'c-people',
            date: { decade: null, year: null, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            tags: [],
            translations: { en: 'Someone made up' },
        })
    })

    it('refuses a file it cannot read as a whole', () => {
        expect(planCardImport('year,month\n1895,7', categories)).toEqual({
            ok: false,
            error: expect.stringContaining('text_en and category'),
        })
        expect(planCardImport(header, categories)).toEqual({
            ok: false,
            error: 'The file has no cards under its header.',
        })
        expect(planCardImport(`${header}\n"A,,1895`, categories)).toEqual({
            ok: false,
            error: 'The CSV has a quote that is never closed.',
        })
        const tooMany = Array.from({ length: 1001 }, () => 'A,,,,,Events,,,,,')
        expect(plan(...tooMany)).toEqual({
            ok: false,
            error: 'The file has 1001 rows; import at most 1000 at a time.',
        })
    })
})
