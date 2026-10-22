import { describe, expect, it } from 'vite-plus/test'
import {
    dateNeeded,
    normaliseDate,
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
        sourceQuote: ' Vasa sank 1628 ',
        difficulty: 2,
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

    it('refuses what is not a list of drafts', () => {
        expect(readPhotoDrafts('nope')).toBeNull()
        expect(readPhotoDrafts('[]')).toBeNull()
    })
})
