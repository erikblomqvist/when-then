import { describe, expect, it } from 'vite-plus/test'
import {
    dateNeeded,
    exactDateWanted,
    normaliseDate,
    photoDraftLimit,
    photoTextStatus,
    readPhotoDrafts,
    suggestedCategory,
} from './photo-import'

describe('normaliseDate', () => {
    it('fills the decade from the year', () => {
        expect(normaliseDate({ decade: null, year: 1628, month: 8, day: 10 })).toEqual({
            decade: 1620,
            year: 1628,
            month: 8,
            day: 10,
        })
    })

    it('keeps a decade without a year, dropping month and day', () => {
        expect(normaliseDate({ decade: 1490, year: null, month: 3, day: 2 })).toEqual({
            decade: 1490,
            year: null,
            month: null,
            day: null,
        })
    })

    it('drops a date that does not hold together', () => {
        const none = { decade: null, year: null, month: null, day: null }
        expect(normaliseDate({ year: 0 })).toEqual(none)
        expect(normaliseDate({ year: 1900, month: 2, day: 31 })).toEqual(none)
        expect(normaliseDate({ decade: 1495 })).toEqual(none)
    })
})

describe('dateNeeded', () => {
    it('needs a decade, and a year from 1500 onwards', () => {
        expect(dateNeeded({ decade: null, year: null, month: null, day: null })).toBe(true)
        expect(dateNeeded({ decade: 1490, year: null, month: null, day: null })).toBe(false)
        expect(dateNeeded({ decade: 1620, year: null, month: null, day: null })).toBe(true)
        expect(dateNeeded({ decade: 1620, year: 1628, month: null, day: null })).toBe(false)
    })
})

describe('exactDateWanted', () => {
    const date = (parts: Partial<Record<'decade' | 'year' | 'month' | 'day', number>>) => ({
        decade: null,
        year: null,
        month: null,
        day: null,
        ...parts,
    })

    it('wants a date for a card without one, whatever its era', () => {
        expect(exactDateWanted(date({}))).toBe(true)
    })

    it('wants the day from 1800 on, until it has one', () => {
        expect(exactDateWanted(date({ decade: 1960, year: 1969 }))).toBe(true)
        expect(exactDateWanted(date({ decade: 1960, year: 1969, month: 7 }))).toBe(true)
        expect(exactDateWanted(date({ decade: 1960, year: 1969, month: 7, day: 20 }))).toBe(false)
        expect(exactDateWanted(date({ decade: 1950 }))).toBe(true)
    })

    it('leaves earlier dates as they are', () => {
        expect(exactDateWanted(date({ decade: 1620, year: 1628 }))).toBe(false)
        expect(exactDateWanted(date({ decade: 1790, year: 1799 }))).toBe(false)
        expect(exactDateWanted(date({ decade: 1490 }))).toBe(false)
        expect(exactDateWanted(date({ decade: -50, year: -44 }))).toBe(false)
    })
})

describe('suggestedCategory', () => {
    it('needs an English name and falls back to a usable look', () => {
        expect(suggestedCategory({ names: { en: ' ', sv: 'Rymd' } })).toBeNull()
        expect(
            suggestedCategory({
                names: { en: 'Space', sv: 'Rymden' },
                icon: 'nope',
                colour: 'teal',
            }),
        ).toEqual({ names: { en: 'Space', sv: 'Rymden', nb: '' }, icon: 'flag', colour: 'teal' })
    })
})

describe('photoTextStatus', () => {
    const candidate = {
        sourceLocale: 'sv' as const,
        texts: { en: 'The Vasa sinks', sv: 'Vasa sjunker', nb: 'Vasa synker' },
    }

    it("reviews the photo's own language and keeps untouched AI translations machine", () => {
        expect(photoTextStatus(candidate, 'sv', 'Vasa sjunker')).toBe('reviewed')
        expect(photoTextStatus(candidate, 'nb', 'Vasa synker')).toBe('machine')
        expect(photoTextStatus(candidate, 'nb', 'Vasa går ned')).toBe('reviewed')
    })

    it('always reviews English, the canonical text', () => {
        expect(photoTextStatus(candidate, 'en', 'The Vasa sinks')).toBe('reviewed')
    })
})

describe('readPhotoDrafts', () => {
    const draft = {
        categoryId: 'cat-1',
        date: { decade: 1620, year: 1628, month: null, day: null },
        sourceUrl: null,
        sourceQuote: ' Vasa sank 1628 ',
        difficulty: 2,
        countrySpecific: 'SE',
        requestId: 41,
        translations: {
            en: { text: 'The Vasa sinks', status: 'machine' },
            sv: { text: 'Vasa sjunker', status: 'reviewed' },
            nb: { text: '', status: 'machine' },
        },
    }

    it('reads the posted drafts, leaving out empty texts', () => {
        expect(readPhotoDrafts(JSON.stringify([draft]))).toEqual([
            {
                draft: {
                    ...draft,
                    sourceQuote: 'Vasa sank 1628',
                    translations: {
                        en: { text: 'The Vasa sinks', status: 'machine' },
                        sv: { text: 'Vasa sjunker', status: 'reviewed' },
                    },
                },
                errors: [],
            },
        ])
    })

    it('allows a draft without a date but not without English or a category', () => {
        const [{ errors }] = readPhotoDrafts(
            JSON.stringify([
                {
                    ...draft,
                    categoryId: '',
                    date: { decade: null, year: null, month: null, day: null },
                    translations: { sv: { text: 'Vasa sjunker', status: 'reviewed' } },
                },
            ]),
        )!
        expect(errors).toEqual([
            'Pick a category or create the suggested one.',
            'The English text is missing.',
        ])
    })

    it('keeps a looked-up source that is a web address, and a request id that is one', () => {
        const [read] = readPhotoDrafts(
            JSON.stringify([
                { ...draft, sourceUrl: ' https://en.wikipedia.org/wiki/Vasa ', requestId: 'x' },
            ]),
        )!
        expect(read.draft.sourceUrl).toBe('https://en.wikipedia.org/wiki/Vasa')
        expect(read.draft.requestId).toBeNull()
        expect(read.errors).toEqual([])

        const [bad] = readPhotoDrafts(JSON.stringify([{ ...draft, sourceUrl: 'wikipedia' }]))!
        expect(bad.errors).toEqual(['The source is not a web address.'])
        const [country] = readPhotoDrafts(
            JSON.stringify([{ ...draft, countrySpecific: 'Sweden' }]),
        )!
        expect(country.errors).toEqual(['Pick a country, or none.'])
        const [none] = readPhotoDrafts(JSON.stringify([{ ...draft, countrySpecific: '' }]))!
        expect(none.draft.countrySpecific).toBeNull()
    })

    it('refuses what is not a list of drafts, or too long a one', () => {
        expect(readPhotoDrafts('nope')).toBeNull()
        expect(readPhotoDrafts('[]')).toBeNull()
        expect(readPhotoDrafts(JSON.stringify(Array(photoDraftLimit).fill(draft)))).toHaveLength(
            photoDraftLimit,
        )
        expect(readPhotoDrafts(JSON.stringify(Array(photoDraftLimit + 1).fill(draft)))).toBeNull()
    })
})
