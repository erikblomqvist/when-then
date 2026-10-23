import { describe, expect, it } from 'vite-plus/test'
import { emptyCardFormValues, type CardFormValues } from './card-form'
import { publishChecklist, publishSuggestions } from './publish-checklist'

const form = (overrides: Partial<CardFormValues>): CardFormValues => ({
    ...emptyCardFormValues,
    ...overrides,
})
const ready = { text_en: 'A made-up kite flies', category_id: 'c1', year: '1969', decade: '1960' }
const state = (values: CardFormValues) =>
    Object.fromEntries(publishChecklist(values).map((check) => [check.key, check.done]))

describe('publishChecklist', () => {
    it('lists every requirement from the start, none done on an empty form', () => {
        expect(publishChecklist(form({}))).toEqual([
            { key: 'text', label: 'English text', done: false, detail: undefined },
            { key: 'category', label: 'Category', done: false },
            { key: 'date', label: 'Date, at least the decade', done: false, detail: undefined },
            { key: 'year', label: 'Year, for cards from 1500 on', done: false, detail: undefined },
        ])
    })

    it('ticks everything off for a card that can be published', () => {
        expect(state(form(ready))).toEqual({ text: true, category: true, date: true, year: true })
    })

    it('needs no year before 1500, and says so', () => {
        const checks = publishChecklist(form({ ...ready, year: '', decade: '1490' }))
        expect(checks.find((check) => check.key === 'year')).toMatchObject({
            done: true,
            detail: 'Not needed before 1500',
        })
    })

    it('keeps the date done but the year open for a decade from 1500 on', () => {
        expect(state(form({ ...ready, year: '', decade: '1960' }))).toMatchObject({
            date: true,
            year: false,
        })
    })

    it('leaves the date open, with the reason, while it does not add up', () => {
        const checks = publishChecklist(form({ ...ready, month: '2', day: '30' }))
        const date = checks.find((check) => check.key === 'date')
        expect(date?.done).toBe(false)
        expect(date?.detail).toBeTruthy()
    })

    it('says what is wrong with a too long text', () => {
        const checks = publishChecklist(form({ ...ready, text_en: 'x'.repeat(501) }))
        expect(checks[0]).toMatchObject({
            done: false,
            detail: 'Keep the card under 500 characters.',
        })
    })

    it('adds "Fix the marked fields" only while another field has a mistake', () => {
        expect(publishChecklist(form(ready)).map((check) => check.key)).not.toContain('fields')
        const checks = publishChecklist(form({ ...ready, source_url: 'example.com' }))
        expect(checks.at(-1)).toEqual({
            key: 'fields',
            label: 'Fix the marked fields',
            done: false,
            detail: 'Use a full web address, starting with https://.',
        })
    })
})

describe('publishSuggestions', () => {
    it('lists what is worth adding: translations, a source, a verified date', () => {
        expect(publishSuggestions(form(ready))).toEqual([
            { key: 'sv', label: 'Swedish translation' },
            { key: 'nb', label: 'Norwegian translation' },
            { key: 'source', label: 'Source' },
            { key: 'verified', label: 'Date verified' },
        ])
    })

    it('leaves out what the card has, and asks to review a machine translation', () => {
        const values = form({
            ...ready,
            text_sv: 'En påhittad drake flyger',
            text_nb: 'En oppdiktet drage flyr',
            machine_text_nb: 'En oppdiktet drage flyr',
            source_url: 'https://example.com/kite',
        })
        expect(publishSuggestions(values)).toEqual([
            {
                key: 'nb',
                label: 'Review the Norwegian translation',
                detail: 'Machine translated, not reviewed yet',
            },
            { key: 'verified', label: 'Date verified' },
        ])
    })
})
