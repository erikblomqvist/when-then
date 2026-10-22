import { describe, expect, it } from 'vite-plus/test'
import {
    cardFormErrors,
    cardFormValues,
    emptyCardFormValues,
    fillMachineTranslationField,
    parseCardForm,
    settledCardFormValues,
    translationDraft,
    withSuggestedDate,
} from './card-form'

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
        const yearless = parseCardForm(form({ decade: '1500' }))
        expect(yearless).toEqual({
            ok: false,
            errors: { decade: 'Cards from 1500 onwards need a year.' },
        })
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
            text_sv: '',
            note_sv: '',
            reviewed_sv: '',
            machine_text_sv: '',
            text_nb: '',
            note_nb: '',
            reviewed_nb: '',
            machine_text_nb: '',
        })
    })

    it('fills a locale tab from its saved translation, unticked', () => {
        const values = cardFormValues({
            categoryId,
            date: { decade: null, year: null, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            translations: {
                en: { text: 'A made-up bridge opens' },
                sv: { text: 'En påhittad bro öppnas', note: 'Bro, inte brygga' },
            },
        })
        expect(translationDraft(values, 'sv')).toEqual({
            text: 'En påhittad bro öppnas',
            note: 'Bro, inte brygga',
            reviewed: false,
            machineText: null,
        })
        expect(translationDraft(values, 'nb').text).toBe('')
    })
})

describe('locale tabs', () => {
    it('reads a translation, with no status unless the person ticked reviewed', () => {
        const edited = parseCardForm(form({ text_sv: ' En påhittad bro öppnas ', note_sv: '' }))
        expect(edited.ok && edited.card.translations).toEqual({
            en: { text: 'A made-up event happens' },
            sv: { text: 'En påhittad bro öppnas', note: null },
        })
        const ticked = parseCardForm(
            form({ text_nb: 'En oppdiktet bro åpner', note_nb: 'Om broen', reviewed_nb: 'true' }),
        )
        expect(ticked.ok && ticked.card.translations.nb).toEqual({
            text: 'En oppdiktet bro åpner',
            note: 'Om broen',
            status: 'reviewed',
        })
    })

    it('marks a machine translation left as it is', () => {
        const values = fillMachineTranslationField(
            cardFormValues({
                categoryId,
                date: { decade: null, year: null, month: null, day: null },
                sourceUrl: null,
                sourceQuote: null,
                translations: { en: { text: 'A made-up bridge opens' } },
            }),
            'sv',
            'En påhittad bro öppnas',
        )
        expect(values.text_sv).toBe('En påhittad bro öppnas')
        const result = parseCardForm(form({ ...values }))
        expect(result.ok && result.card.translations.sv).toEqual({
            text: 'En påhittad bro öppnas',
            note: null,
            status: 'machine',
        })
    })

    it('removes a translation whose text was cleared, and leaves out tabs not posted', () => {
        const result = parseCardForm(form({ text_sv: '  ', note_sv: '' }))
        expect(result.ok && result.card.translations).toEqual({
            en: { text: 'A made-up event happens' },
            sv: null,
        })
    })

    it('asks for the text before a note', () => {
        expect(parseCardForm(form({ text_nb: '', note_nb: 'Om broen' }))).toEqual({
            ok: false,
            errors: { text_nb: 'Write the Norwegian text, or clear the note.' },
        })
    })

    it('keeps a translation as short as a card', () => {
        const result = parseCardForm(form({ text_sv: 'x'.repeat(501) }))
        expect(result).toEqual({
            ok: false,
            errors: { text_sv: 'Keep the card under 500 characters.' },
        })
    })
})

describe('cardFormErrors', () => {
    it('finds what a save would refuse, from the values the editor holds', () => {
        expect(cardFormErrors(emptyCardFormValues)).toEqual({
            text_en: 'Write the card in English.',
            category_id: 'Pick a category.',
        })
    })

    it('finds nothing in a card that can be saved, with or without a translation', () => {
        const values = {
            ...emptyCardFormValues,
            text_en: 'A made-up event',
            category_id: categoryId,
        }
        expect(cardFormErrors(values)).toEqual({})
        expect(cardFormErrors({ ...values, text_sv: 'En påhittad händelse' })).toEqual({})
    })

    it('asks for a translation’s text when only its note is filled in', () => {
        const values = {
            ...emptyCardFormValues,
            text_en: 'A made-up event',
            category_id: categoryId,
        }
        expect(cardFormErrors({ ...values, note_nb: 'Ikke bro' })).toEqual({
            text_nb: 'Write the Norwegian text, or clear the note.',
        })
    })
})

describe('settledCardFormValues', () => {
    it('spends the ticks and machine marks once saved, keeping the text', () => {
        const values = {
            ...fillMachineTranslationField(
                cardFormValues({
                    categoryId,
                    date: { decade: null, year: null, month: null, day: null },
                    sourceUrl: null,
                    sourceQuote: null,
                    translations: { en: { text: 'A made-up bridge opens' } },
                }),
                'sv',
                'En påhittad bro öppnas',
            ),
            reviewed_nb: 'true',
        }
        const settled = settledCardFormValues(values)
        expect(translationDraft(settled, 'sv')).toEqual({
            text: 'En påhittad bro öppnas',
            note: '',
            reviewed: false,
            machineText: null,
        })
        expect(settled.reviewed_nb).toBe('')
    })
})

describe('withSuggestedDate', () => {
    const before = {
        ...emptyCardFormValues,
        year: '1900',
        decade: '1900',
        month: '5',
        day: '1',
        source_url: 'https://example.com/old',
        source_quote: 'Old quote',
    }

    it('fills the year and source, and drops a month and day that belonged to another year', () => {
        expect(
            withSuggestedDate(before, {
                year: 1908,
                sourceUrl: 'https://example.com/new',
                sourceQuote: 'In 1908',
            }),
        ).toEqual({
            ...before,
            year: '1908',
            month: '',
            day: '',
            source_url: 'https://example.com/new',
            source_quote: 'In 1908',
        })
    })

    it('keeps the month and day when the year stays the same', () => {
        const after = withSuggestedDate(before, { year: 1900, sourceUrl: null, sourceQuote: null })
        expect(after).toMatchObject({ month: '5', day: '1' })
    })

    it('writes a BCE year as BC with a positive number', () => {
        expect(
            withSuggestedDate(before, { year: -44, sourceUrl: null, sourceQuote: null }),
        ).toMatchObject({ era: 'BC', year: '44' })
    })

    it('leaves the source alone when the suggestion has none', () => {
        expect(
            withSuggestedDate(before, { year: 2012, sourceUrl: null, sourceQuote: null }),
        ).toMatchObject({ source_url: 'https://example.com/old', source_quote: 'Old quote' })
    })
})
