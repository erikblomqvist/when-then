// The card editor's form: field names, parsing (server side, in the form action) and the
// values the editor starts from. The browser posts plain fields; dates come in as an era
// (AD/BC) plus unsigned numbers, the way people write them, and leave here as signed parts.
//
// Later tickets add fields (per-locale `text_sv`, `note_sv`, difficulty, tags) by extending
// `CardFormValues`, `parseCardForm` and `cardFormValues` together.

import type { CardFields, CardInput, CardLocale } from './card'
import {
    decadeFromLabel,
    decadeLabel,
    decadeOf,
    validateDateParts,
    type DateParts,
} from './date-parts'

export type CardFormValues = {
    text_en: string
    category_id: string
    era: 'AD' | 'BC'
    decade: string
    year: string
    month: string
    day: string
    source_url: string
    source_quote: string
}

export type CardFormErrors = Partial<Record<keyof CardFormValues, string>>

export type ParsedCardForm = { ok: true; card: CardInput } | { ok: false; errors: CardFormErrors }

export const cardTextMaxLength = 500
export const sourceQuoteMaxLength = 500

export const emptyCardFormValues: CardFormValues = {
    text_en: '',
    category_id: '',
    era: 'AD',
    decade: '',
    year: '',
    month: '',
    day: '',
    source_url: '',
    source_quote: '',
}

const field = (form: FormData, name: keyof CardFormValues) => {
    const value = form.get(name)
    return typeof value === 'string' ? value.trim() : ''
}

/** The fields as posted, for showing the form again after a failed save without JavaScript. */
export function readCardFormValues(form: FormData): CardFormValues {
    const values = { ...emptyCardFormValues }
    for (const name of Object.keys(values) as (keyof CardFormValues)[]) {
        const value = form.get(name)
        if (typeof value === 'string') Object.assign(values, { [name]: value })
    }
    values.era = values.era === 'BC' ? 'BC' : 'AD'
    return values
}

/** A whole, non-negative number from a field: null when empty, NaN when not a number. */
const wholeNumber = (value: string) => {
    if (value === '') return null
    return /^\d+$/.test(value) ? Number(value) : Number.NaN
}

const isWebAddress = (value: string) => {
    try {
        const url = new URL(value)
        return url.protocol === 'https:' || url.protocol === 'http:'
    } catch {
        return false
    }
}

/**
 * Reads the editor's fields into a `CardInput`, or every problem keyed by field. With a year,
 * the decade is derived from it (the editor shows it filled in); without one, the decade field
 * is read as a decade in the chosen era (490 + BC → the 490s BC).
 */
export function parseCardForm(form: FormData): ParsedCardForm {
    const errors: CardFormErrors = {}
    const bc = field(form, 'era') === 'BC'

    const text = field(form, 'text_en')
    if (!text) errors.text_en = 'Write the card in English.'
    else if (text.length > cardTextMaxLength) {
        errors.text_en = `Keep the card under ${cardTextMaxLength} characters.`
    }

    const categoryId = field(form, 'category_id')
    if (!categoryId) errors.category_id = 'Pick a category.'

    const numbers = {
        year: wholeNumber(field(form, 'year')),
        month: wholeNumber(field(form, 'month')),
        day: wholeNumber(field(form, 'day')),
        decade: wholeNumber(field(form, 'decade')),
    }
    const messages = {
        year: 'Year must be a whole number.',
        month: 'Month must be 1 to 12.',
        day: 'Day must be a whole number.',
        decade: 'Not a decade.',
    }
    for (const part of ['year', 'month', 'day', 'decade'] as const) {
        if (Number.isNaN(numbers[part])) errors[part] = messages[part]
    }

    const year = numbers.year === null || numbers.year === 0 || !bc ? numbers.year : -numbers.year
    let decade: number | null = null
    if (numbers.year !== null) {
        if (year && !Number.isNaN(year)) decade = decadeOf(year)
    } else if (numbers.decade !== null && !Number.isNaN(numbers.decade)) {
        decade = decadeFromLabel(numbers.decade, bc)
        if (decade === null) errors.decade = messages.decade
    }

    const date: DateParts = { decade, year, month: numbers.month, day: numbers.day }
    const dateIsReadable = !errors.year && !errors.month && !errors.day && !errors.decade
    if (dateIsReadable) Object.assign(errors, validateDateParts(date))

    const sourceUrl = field(form, 'source_url')
    if (sourceUrl && !isWebAddress(sourceUrl)) {
        errors.source_url = 'Use a full web address, starting with https://.'
    }
    const sourceQuote = field(form, 'source_quote')
    if (sourceQuote.length > sourceQuoteMaxLength) {
        errors.source_quote = `Keep the quote under ${sourceQuoteMaxLength} characters.`
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors }
    return {
        ok: true,
        card: {
            categoryId,
            date,
            sourceUrl: sourceUrl || null,
            sourceQuote: sourceQuote || null,
            translations: { en: { text } },
            // Set by the editor when a verified date changed and the editor chose to clear it.
            ...(form.get('clear_verification') === 'true' && { clearVerification: true }),
        },
    }
}

const numberField = (value: number | null) => (value === null ? '' : String(value))

/** The fields the editor shows for a saved card: the inverse of `parseCardForm`. */
export function cardFormValues(
    card: CardFields & { translations: Partial<Record<CardLocale, { text: string }>> },
): CardFormValues {
    const { decade, year, month, day } = card.date
    const bc = (year ?? decade ?? 0) < 0
    return {
        text_en: card.translations.en?.text ?? '',
        category_id: card.categoryId,
        era: bc ? 'BC' : 'AD',
        decade: decade === null ? '' : String(decadeLabel(decade)),
        year: year === null ? '' : String(Math.abs(year)),
        month: numberField(month),
        day: numberField(day),
        source_url: card.sourceUrl ?? '',
        source_quote: card.sourceQuote ?? '',
    }
}
