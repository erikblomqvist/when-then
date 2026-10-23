// The card editor's form: field names, parsing (server side, in the form action) and the
// values the editor starts from. The browser posts plain fields; dates come in as an era
// (AD/BC) plus unsigned numbers, the way people write them, and leave here as signed parts.
// The locale tabs post `text_<locale>`, `note_<locale>`, `reviewed_<locale>` (ticked) and
// `machine_text_<locale>` (the text a machine translation filled in); see
// `#lib/cards/translation.js` for how they become a status.
//
// Later tickets add fields (tags) by extending `CardFormValues`, `parseCardForm`
// and `cardFormValues` together.

import type { CardFields, CardInput, CardLocale, TranslationInput } from './card'
import { yearRequiredFrom, yearRequiredMessage } from './publish-rule'
import {
    decadeFromLabel,
    decadeLabel,
    decadeOf,
    validateDateParts,
    type DateParts,
} from './date-parts'
import {
    draftFromTranslation,
    fillMachineTranslation,
    localeName,
    postedStatus,
    translationLocales,
    type TranslationDraft,
    type TranslationLocale,
} from './translation'

/** One locale tab's fields, all strings like the rest of the form ('true' when ticked). */
type TranslationFields<L extends TranslationLocale> = Record<
    `text_${L}` | `note_${L}` | `reviewed_${L}` | `machine_text_${L}`,
    string
>

export type CardFormValues = {
    text_en: string
    /** A note on the card's English text (as each locale tab has its own). */
    note_en: string
    category_id: string
    era: 'AD' | 'BC'
    decade: string
    year: string
    month: string
    day: string
    source_url: string
    source_quote: string
    /** '' (not set) or '1' (most people know it) to '4' (obscure). */
    difficulty: string
} & TranslationFields<'sv'> &
    TranslationFields<'nb'>

export type CardFormErrors = Partial<Record<keyof CardFormValues, string>>

export type ParsedCardForm = { ok: true; card: CardInput } | { ok: false; errors: CardFormErrors }

export const cardTextMaxLength = 500
export const sourceQuoteMaxLength = 500

/** A card's difficulty levels, from 1 (most people know it) to 4 (obscure). */
export const cardDifficulties = [1, 2, 3, 4]

function translationFields<L extends TranslationLocale>(
    locale: L,
    draft: TranslationDraft,
): TranslationFields<L> {
    return {
        [`text_${locale}`]: draft.text,
        [`note_${locale}`]: draft.note,
        [`reviewed_${locale}`]: draft.reviewed ? 'true' : '',
        [`machine_text_${locale}`]: draft.machineText ?? '',
    } as TranslationFields<L>
}

/** A locale tab's draft, from the form's values. */
export function translationDraft(
    values: CardFormValues,
    locale: TranslationLocale,
): TranslationDraft {
    const fields = values as unknown as TranslationFields<typeof locale>
    const machineText = fields[`machine_text_${locale}`]
    return {
        text: fields[`text_${locale}`],
        note: fields[`note_${locale}`],
        reviewed: fields[`reviewed_${locale}`] === 'true',
        machineText: machineText === '' ? null : machineText,
    }
}

/** The form's values with a locale tab's draft replaced. */
export const withTranslationDraft = (
    values: CardFormValues,
    locale: TranslationLocale,
    draft: TranslationDraft,
): CardFormValues => ({ ...values, ...translationFields(locale, draft) })

/**
 * The form's values after a machine translation filled a locale tab: the text is replaced and
 * saving it as it is marks it machine. Nothing is saved until the person saves the card.
 */
export const fillMachineTranslationField = (
    values: CardFormValues,
    locale: TranslationLocale,
    text: string,
): CardFormValues =>
    withTranslationDraft(
        values,
        locale,
        fillMachineTranslation(translationDraft(values, locale), text),
    )

/**
 * The form's values once saved: the "reviewed" ticks and machine-translation marks are spent,
 * since the saved status now carries them (an untouched machine translation stays machine).
 */
export const settledCardFormValues = (values: CardFormValues): CardFormValues => {
    let settled = values
    for (const locale of translationLocales) {
        const draft = translationDraft(settled, locale)
        settled = withTranslationDraft(settled, locale, {
            ...draft,
            reviewed: false,
            machineText: null,
        })
    }
    return settled
}

/** A year to put into the form, from an AI date suggestion (#42); source null = keep. */
export type SuggestedDate = {
    /** Signed: BCE negative. */
    year: number
    sourceUrl: string | null
    sourceQuote: string | null
}

/**
 * The form with a suggested year (and its source, when it has one) filled in. A month and day
 * that belonged to a different year are dropped. The decade follows the year in the editor.
 */
export function withSuggestedDate(values: CardFormValues, date: SuggestedDate): CardFormValues {
    const era = date.year < 0 ? 'BC' : 'AD'
    const year = String(Math.abs(date.year))
    const sameYear = values.era === era && values.year.trim() === year
    return {
        ...values,
        era,
        year,
        ...(sameYear ? {} : { month: '', day: '' }),
        ...(date.sourceUrl
            ? { source_url: date.sourceUrl, source_quote: date.sourceQuote ?? '' }
            : {}),
    }
}

export const emptyCardFormValues: CardFormValues = {
    text_en: '',
    note_en: '',
    category_id: '',
    era: 'AD',
    decade: '',
    year: '',
    month: '',
    day: '',
    source_url: '',
    source_quote: '',
    difficulty: '',
    ...translationFields('sv', draftFromTranslation(undefined)),
    ...translationFields('nb', draftFromTranslation(undefined)),
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

/** Whether a source URL is a full http(s) address (the editor and the CSV import). */
export const isWebAddress = (value: string) => {
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

    // The English note; a form without the field (an older page) leaves it as saved.
    const englishTranslation: TranslationInput = form.has('note_en')
        ? { text, note: field(form, 'note_en') || null }
        : { text }

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
    // The publish rule's year, asked for already when saving: a decade alone from 1500 on is
    // never enough (on the decade, the field that was filled in).
    if (dateIsReadable && year === null && decade !== null && decade >= yearRequiredFrom) {
        errors.decade = yearRequiredMessage
    }

    const sourceUrl = field(form, 'source_url')
    if (sourceUrl && !isWebAddress(sourceUrl)) {
        errors.source_url = 'Use a full web address, starting with https://.'
    }
    const sourceQuote = field(form, 'source_quote')
    if (sourceQuote.length > sourceQuoteMaxLength) {
        errors.source_quote = `Keep the quote under ${sourceQuoteMaxLength} characters.`
    }

    // Not posted at all (a form from before the field): left out, so the save keeps it.
    const difficulty = form.has('difficulty') ? wholeNumber(field(form, 'difficulty')) : undefined
    if (difficulty !== undefined && difficulty !== null && !cardDifficulties.includes(difficulty)) {
        errors.difficulty = 'Difficulty is 1 to 4.'
    }

    const translations: Partial<Record<TranslationLocale, TranslationInput | null>> = {}
    for (const locale of translationLocales) {
        // A form without the tab (an older page) leaves the translation alone.
        if (!form.has(`text_${locale}`)) continue
        const draft = translationDraft(readCardFormValues(form), locale)
        const text = draft.text.trim()
        const note = draft.note.trim()
        if (!text) {
            if (note)
                errors[`text_${locale}`] =
                    `Write the ${localeName[locale]} text, or clear the note.`
            translations[locale] = null
        } else if (text.length > cardTextMaxLength) {
            errors[`text_${locale}`] = `Keep the card under ${cardTextMaxLength} characters.`
        } else {
            const status = postedStatus(draft)
            translations[locale] = { text, note: note || null, ...(status && { status }) }
        }
    }

    if (Object.keys(errors).length > 0) return { ok: false, errors }
    return {
        ok: true,
        card: {
            categoryId,
            date,
            sourceUrl: sourceUrl || null,
            sourceQuote: sourceQuote || null,
            ...(difficulty !== undefined && { difficulty }),
            translations: { en: englishTranslation, ...translations },
            // Set by the editor when a verified date changed and the editor chose to clear it.
            ...(form.get('clear_verification') === 'true' && { clearVerification: true }),
        },
    }
}

/** `parseCardForm` of the values the editor holds, as if they were posted. */
export function parseCardFormValues(values: CardFormValues): ParsedCardForm {
    const form = new FormData()
    for (const [name, value] of Object.entries(values)) form.set(name, value)
    return parseCardForm(form)
}

/** What `parseCardForm` would find wrong with these values, for live validation in the editor. */
export function cardFormErrors(values: CardFormValues): CardFormErrors {
    const parsed = parseCardFormValues(values)
    return parsed.ok ? {} : parsed.errors
}

const numberField = (value: number | null) => (value === null ? '' : String(value))

/** The fields the editor shows for a saved card: the inverse of `parseCardForm`. */
export function cardFormValues(
    card: CardFields & {
        difficulty?: number | null
        translations: Partial<Record<CardLocale, { text: string; note?: string | null }>>
    },
): CardFormValues {
    const { decade, year, month, day } = card.date
    const bc = (year ?? decade ?? 0) < 0
    return {
        text_en: card.translations.en?.text ?? '',
        note_en: card.translations.en?.note ?? '',
        category_id: card.categoryId,
        era: bc ? 'BC' : 'AD',
        decade: decade === null ? '' : String(decadeLabel(decade)),
        year: year === null ? '' : String(Math.abs(year)),
        month: numberField(month),
        day: numberField(day),
        source_url: card.sourceUrl ?? '',
        source_quote: card.sourceQuote ?? '',
        difficulty: numberField(card.difficulty ?? null),
        ...translationFields('sv', draftFromTranslation(card.translations.sv)),
        ...translationFields('nb', draftFromTranslation(card.translations.nb)),
    }
}
