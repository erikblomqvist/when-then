import { describe, expect, it } from 'vite-plus/test'
import { cardFormValues, parseCardForm } from './card-form'

const categoryId = '6f1c1d5e-8f0a-4c43-9d1e-2b7a0f6c1a01'

function form(fields: Record<string, string>) {
    const data = new FormData()
    const defaults = { text_en: 'A made-up event happens', category_id: categoryId, era: 'AD' }
    for (const [name, value] of Object.entries({ ...defaults, ...fields })) data.set(name, value)
    return data
}

describe('parseCardForm', () => {
    it('reads English text, a year, category and source', () => {
        const result = parseCardForm(
            form({
                text_en: '  A made-up treaty is signed  ',
                year: '1492',
                month: '',
                day: '',
                source_url: 'https://example.com/treaty',
                source_quote: 'signed in 1492',
            }),
        )
        expect(result).toEqual({
            ok: true,
            card: {
                categoryId,
                date: { decade: 1490, year: 1492, month: null, day: null },
                sourceUrl: 'https://example.com/treaty',
                sourceQuote: 'signed in 1492',
                translations: { en: { text: 'A made-up treaty is signed' } },
            },
        })
    })

    it('asks to clear the verification only when the editor said so', () => {
        const cleared = parseCardForm(form({ year: '1492', clear_verification: 'true' }))
        expect(cleared.ok && cleared.card.clearVerification).toBe(true)
        const kept = parseCardForm(form({ year: '1492' }))
        expect(kept.ok && 'clearVerification' in kept.card).toBe(false)
    })

    it('fills the decade from the year, whatever the decade field says', () => {
        const result = parseCardForm(form({ year: '1969', decade: '1480', month: '7', day: '20' }))
        expect(result.ok && result.card.date).toEqual({
            decade: 1960,
            year: 1969,
            month: 7,
            day: 20,
        })
    })

    it('takes a decade alone, in the era chosen', () => {
        expect(parseCardForm(form({ decade: '1490' })).ok && 'ok').toBe('ok')
        const bc = parseCardForm(form({ decade: '490', era: 'BC' }))
        expect(bc.ok && bc.card.date).toEqual({ decade: -499, year: null, month: null, day: null })
        const zeros = parseCardForm(form({ decade: '0', era: 'BC' }))
        expect(zeros.ok && zeros.card.date.decade).toBe(-9)
    })

    it('reads a BC year as negative', () => {
        const result = parseCardForm(form({ year: '44', era: 'BC', month: '3', day: '15' }))
        expect(result.ok && result.card.date).toEqual({ decade: -49, year: -44, month: 3, day: 15 })
    })

    it('keeps a draft without a date or source', () => {
        const result = parseCardForm(form({}))
        expect(result).toEqual({
            ok: true,
            card: {
                categoryId,
                date: { decade: null, year: null, month: null, day: null },
                sourceUrl: null,
                sourceQuote: null,
                translations: { en: { text: 'A made-up event happens' } },
            },
        })
    })

    it('reports every problem by field', () => {
        const result = parseCardForm(
            form({
                text_en: '   ',
                category_id: '',
                year: 'soon',
                decade: '1495',
                source_url: 'example.com/no-scheme',
            }),
        )
        expect(result).toEqual({
            ok: false,
            errors: {
                text_en: 'Write the card in English.',
                category_id: 'Pick a category.',
                year: 'Year must be a whole number.',
                source_url: 'Use a full web address, starting with https://.',
            },
        })
    })

    it('reports date-part rules on their fields', () => {
        const result = parseCardForm(form({ year: '1969', day: '20' }))
        expect(result).toEqual({ ok: false, errors: { day: 'A day needs a month.' } })
        const decade = parseCardForm(form({ decade: '1495' }))
        expect(decade).toEqual({ ok: false, errors: { decade: 'Not a decade.' } })
        const zero = parseCardForm(form({ year: '0' }))
        expect(zero).toEqual({
            ok: false,
            errors: { year: 'There is no year 0: 1 BC is followed by AD 1.' },
        })
    })
})

describe('cardFormValues', () => {
    it('turns a saved card back into the fields the editor shows', () => {
        expect(
            cardFormValues({
                categoryId,
                date: { decade: -49, year: -44, month: 3, day: 15 },
                sourceUrl: null,
                sourceQuote: 'the Ides of March',
                translations: { en: { text: 'A made-up senator is late' } },
            }),
        ).toEqual({
            text_en: 'A made-up senator is late',
            category_id: categoryId,
            era: 'BC',
            decade: '40',
            year: '44',
            month: '3',
            day: '15',
            source_url: '',
            source_quote: 'the Ides of March',
        })
    })
})
