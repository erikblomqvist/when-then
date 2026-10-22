import { describe, expect, it } from 'vite-plus/test'
import { datedStatements, lookupWikidata, wikidataDate } from './wikidata'

const time = (value: string, precision: number) => ({
    mainsnak: {
        snaktype: 'value',
        datavalue: {
            type: 'time',
            value: {
                time: value,
                precision,
                calendarmodel: 'http://www.wikidata.org/entity/Q1985727',
            },
        },
    },
})

describe('wikidataDate', () => {
    it('reads a day-precision date as its year, month and day', () => {
        expect(wikidataDate('+1879-03-14T00:00:00Z', 11)).toEqual({
            year: 1879,
            month: 3,
            day: 14,
            precision: 'day',
        })
    })

    it('reads a year-precision date as a year only', () => {
        expect(wikidataDate('+1908-00-00T00:00:00Z', 9)).toEqual({
            year: 1908,
            month: null,
            day: null,
            precision: 'year',
        })
    })

    it('reads a month-precision date without a day', () => {
        expect(wikidataDate('+2007-06-00T00:00:00Z', 10)).toEqual({
            year: 2007,
            month: 6,
            day: null,
            precision: 'month',
        })
    })

    it('gives no year when Wikidata only knows the decade or century', () => {
        expect(wikidataDate('+1490-00-00T00:00:00Z', 8)).toEqual({
            year: null,
            month: null,
            day: null,
            precision: 'decade',
        })
        expect(wikidataDate('+1500-00-00T00:00:00Z', 7)).toEqual({
            year: null,
            month: null,
            day: null,
            precision: 'century',
        })
    })

    it('keeps BCE years negative, with 1 BCE as -1 (no year 0)', () => {
        expect(wikidataDate('-0044-03-15T00:00:00Z', 11)?.year).toBe(-44)
        expect(wikidataDate('-0001-00-00T00:00:00Z', 9)?.year).toBe(-1)
    })

    it('ignores a value it cannot read', () => {
        expect(wikidataDate('sometime', 9)).toBeNull()
    })
})

describe('datedStatements', () => {
    it('lists the dated properties with a readable quote, skipping unknown values', () => {
        const statements = datedStatements({
            P569: [time('+1879-03-14T00:00:00Z', 11)],
            P570: [{ mainsnak: { snaktype: 'somevalue' } }],
            P31: [{ mainsnak: { snaktype: 'value', datavalue: { type: 'wikibase-entityid' } } }],
            P571: [time('+1490-00-00T00:00:00Z', 8)],
        })
        expect(statements).toEqual([
            {
                property: 'P569',
                label: 'date of birth',
                year: 1879,
                month: 3,
                day: 14,
                precision: 'day',
                quote: 'date of birth: 14 March 1879',
            },
            {
                property: 'P571',
                label: 'inception',
                year: null,
                month: null,
                day: null,
                precision: 'decade',
                quote: 'inception: the 1490s (decade precision only)',
            },
        ])
    })

    it('writes BCE years in the quote', () => {
        const [statement] = datedStatements({ P585: [time('-0044-03-15T00:00:00Z', 11)] })
        expect(statement.quote).toBe('point in time: 15 March 44 BC')
    })
})

describe('lookupWikidata', () => {
    const apiUrl = 'https://wikidata.test/w/api.php'

    it('searches, then reads the matching items with their links and dated statements', async () => {
        const asked: { url: URL; userAgent: string | null }[] = []
        const fetchFake = async (input: string | URL | Request, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : input)
            asked.push({ url, userAgent: new Headers(init?.headers).get('user-agent') })
            const body =
                url.searchParams.get('action') === 'wbsearchentities'
                    ? { search: [{ id: 'Q937' }, { id: 'Q42' }] }
                    : {
                          entities: {
                              Q937: {
                                  id: 'Q937',
                                  labels: { en: { value: 'Albert Einstein' } },
                                  descriptions: { en: { value: 'physicist' } },
                                  sitelinks: {
                                      enwiki: {
                                          url: 'https://en.wikipedia.org/wiki/Albert_Einstein',
                                      },
                                  },
                                  claims: { P569: [time('+1879-03-14T00:00:00Z', 11)] },
                              },
                              Q42: { id: 'Q42', labels: {}, claims: {} },
                          },
                      }
            return new Response(JSON.stringify(body))
        }

        const result = await lookupWikidata({ fetch: fetchFake, apiUrl }, 'Albert Einstein')

        expect(asked[0].url.searchParams.get('search')).toBe('Albert Einstein')
        expect(asked[1].url.searchParams.get('ids')).toBe('Q937|Q42')
        expect(asked.every(({ userAgent }) => userAgent?.startsWith('WhenThen'))).toBe(true)
        expect(result.items).toEqual([
            {
                id: 'Q937',
                label: 'Albert Einstein',
                description: 'physicist',
                wikidataUrl: 'https://www.wikidata.org/wiki/Q937',
                wikipediaUrl: 'https://en.wikipedia.org/wiki/Albert_Einstein',
                statements: [expect.objectContaining({ property: 'P569', year: 1879 })],
            },
            {
                id: 'Q42',
                label: null,
                description: null,
                wikidataUrl: 'https://www.wikidata.org/wiki/Q42',
                wikipediaUrl: null,
                statements: [],
            },
        ])
        expect(result.urls).toEqual([
            'https://www.wikidata.org/wiki/Q937',
            'https://en.wikipedia.org/wiki/Albert_Einstein',
            'https://www.wikidata.org/wiki/Q42',
        ])
    })

    it('finds nothing without asking for items when the search has no hits', async () => {
        let calls = 0
        const fetchFake = async () => {
            calls++
            return new Response(JSON.stringify({ search: [] }))
        }
        expect(await lookupWikidata({ fetch: fetchFake, apiUrl }, 'nothing')).toEqual({
            items: [],
            urls: [],
        })
        expect(calls).toBe(1)
    })

    it('throws on an HTTP error', async () => {
        const fetchFake = async () => new Response('nope', { status: 503 })
        await expect(lookupWikidata({ fetch: fetchFake, apiUrl }, 'x')).rejects.toThrow('503')
    })
})
