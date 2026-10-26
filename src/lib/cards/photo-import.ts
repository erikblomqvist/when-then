// Adding cards from a photo (#60): the candidate cards Claude reads from a photo
// (`#lib/server/ai-read-photo.ts`), as the review page edits them, and the drafts the admin
// saves from them. Pure, so the page and the save action check a card by the same rules.
//
// A candidate is written in the photo's language (that text is the admin's to review, so it is
// saved as reviewed) and translated by the AI into the other card languages (saved as machine
// unless the admin edits them). Whatever the AI inferred instead of reading it from the photo
// (the date, the difficulty, whether it is country-specific) is marked so the page can say so.

import type { CardLocale, TranslationStatus } from './card'
import { cardLocales } from './card'
import { cardTextMaxLength, isWebAddress, sourceQuoteMaxLength } from './card-form'
import { isCountryCode } from './country'
import { decadeOf, validateDateParts, type DateParts } from './date-parts'
import { yearRequiredFrom } from './publish-rule'
import type { CategoryColour, CategoryIconName } from '../categories/look'
import { isCategoryColour, isCategoryIcon } from '../categories/look'

/** A category the AI suggests creating when a candidate fits none of the existing ones. */
export type SuggestedCategory = {
    names: Record<CardLocale, string>
    icon: CategoryIconName
    colour: CategoryColour
}

/** An existing card a candidate probably repeats. */
/** An existing card a candidate may repeat: by the same text, or as the AI judged it. */
export type PossibleDuplicate = { id: string; text: string; sameText: boolean }

/** One card the AI read from a photo, before the admin edits it. */
export type PhotoCandidate = {
    /** Its place in the AI's answer, to key the list by. */
    key: number
    /** The language the photo is in, when it is a card language; its text is the reviewed one. */
    sourceLocale: CardLocale | null
    texts: Record<CardLocale, string>
    /** The passage in the photo the card is based on, as read. */
    sourceQuote: string
    /** All null when the AI couldn't date it precisely enough. */
    date: DateParts
    /** The date is printed in the photo (otherwise the AI supplied it from what it knows). */
    dateFromPhoto: boolean
    difficulty: number | null
    /** The country whose deep local knowledge it takes, as the AI guesses (`./country`). */
    countrySpecific: string | null
    /** An existing category it fits, or null with `newCategory` suggested. */
    categoryId: string | null
    newCategory: SuggestedCategory | null
    duplicateOf: PossibleDuplicate | null
}

/** The most candidates one photo gives, so the review list stays manageable. */
export const photoCandidateLimit = 15

/**
 * The most photos read at once (each is its own AI request, all in one upload). Even, so the
 * two sides of five double-sided cards fit.
 */
export const photoLimit = 10

/** The most drafts saved at once: a few readings' worth. */
export const photoDraftLimit = 100

export const emptyDate: DateParts = { decade: null, year: null, month: null, day: null }

const wholeOrNull = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) ? value : null

/**
 * The AI's date as valid date parts: the decade filled in from the year, and anything that
 * doesn't hold together (a year 0, a 31 February) dropped to no date at all.
 */
export function normaliseDate(raw: Partial<Record<keyof DateParts, unknown>>): DateParts {
    const year = wholeOrNull(raw.year)
    const date: DateParts = {
        decade: year !== null && year !== 0 ? decadeOf(year) : wholeOrNull(raw.decade),
        year,
        month: year === null ? null : wholeOrNull(raw.month),
        day: year === null ? null : wholeOrNull(raw.day),
    }
    if (date.month === null) date.day = null
    const errors = validateDateParts(date)
    if (Object.keys(errors).length > 0) return emptyDate
    return date
}

/** The date isn't precise enough to publish: no decade, or no year from 1500 onwards. */
export function dateNeeded({ decade, year }: DateParts): boolean {
    if (decade === null) return true
    return year === null && decade >= yearRequiredFrom
}

/**
 * From this year on, "Find date" looks up the exact day. Earlier dates are too often known only
 * to the year to be worth a lookup. Later than the game's own rule (a year from 1500).
 */
export const exactDateFrom = 1800

/** Whether "Find date" is worth offering: no date at all, or no day from `exactDateFrom` on. */
export function exactDateWanted({ decade, year, day }: DateParts): boolean {
    const when = year ?? decade
    if (when === null) return true
    return when >= exactDateFrom && day === null
}

export const isDifficulty = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4

/** A suggested category with a usable look, or null. */
export function suggestedCategory(raw: unknown): SuggestedCategory | null {
    if (!raw || typeof raw !== 'object') return null
    const { names, icon, colour } = raw as { names?: unknown; icon?: unknown; colour?: unknown }
    const named = (names ?? {}) as Partial<Record<CardLocale, unknown>>
    const text = (locale: CardLocale) =>
        typeof named[locale] === 'string' ? (named[locale] as string).trim() : ''
    if (!text('en')) return null
    return {
        names: Object.fromEntries(cardLocales.map((locale) => [locale, text(locale)])) as Record<
            CardLocale,
            string
        >,
        icon: isCategoryIcon(icon) ? icon : 'flag',
        colour: isCategoryColour(colour) ? colour : 'blue',
    }
}

/** A draft as the review page posts it and `import_photo_cards` creates it. */
export type PhotoDraft = {
    categoryId: string
    date: DateParts
    /** Where the date was looked up, when it was (otherwise the photo is the source). */
    sourceUrl: string | null
    sourceQuote: string | null
    difficulty: number | null
    countrySpecific: string | null
    translations: { en: PhotoTranslation } & Partial<Record<CardLocale, PhotoTranslation>>
    /** The AI request (audit row) the card was read in. */
    requestId: number | null
}

export type PhotoTranslation = { text: string; status: TranslationStatus }

/** The text is the AI's translation, untouched (not the photo's own language, not edited). */
export const isAiTranslation = (
    candidate: Pick<PhotoCandidate, 'sourceLocale' | 'texts'>,
    locale: CardLocale,
    text: string,
) => locale !== candidate.sourceLocale && text.trim() === candidate.texts[locale].trim()

/**
 * The status a candidate's text is saved with: an untouched AI translation is machine, the rest
 * reviewed (editing counts as review). English is always reviewed, as the database requires of
 * the canonical text, so the page marks an AI-written English text for checking instead.
 */
export function photoTextStatus(
    candidate: Pick<PhotoCandidate, 'sourceLocale' | 'texts'>,
    locale: CardLocale,
    text: string,
): TranslationStatus {
    return locale !== 'en' && isAiTranslation(candidate, locale, text) ? 'machine' : 'reviewed'
}

/** Why a draft can't be saved, in words for the review page; empty when it can. */
export function photoDraftErrors(draft: PhotoDraft): string[] {
    const errors: string[] = []
    if (!draft.categoryId) errors.push('Pick a category or create the suggested one.')
    for (const locale of cardLocales) {
        const text = draft.translations[locale]?.text ?? ''
        if (text.length > cardTextMaxLength) {
            errors.push(`Keep the card under ${cardTextMaxLength} characters.`)
            break
        }
    }
    if (!draft.translations.en?.text.trim()) errors.push('The English text is missing.')
    if (Object.keys(validateDateParts(draft.date)).length > 0) errors.push('The date is not valid.')
    if (draft.difficulty !== null && !isDifficulty(draft.difficulty)) {
        errors.push('Difficulty is 1 to 4.')
    }
    if (draft.countrySpecific !== null && !isCountryCode(draft.countrySpecific)) {
        errors.push('Pick a country, or none.')
    }
    if (draft.sourceUrl !== null && !isWebAddress(draft.sourceUrl)) {
        errors.push('The source is not a web address.')
    }
    if ((draft.sourceQuote ?? '').length > sourceQuoteMaxLength) {
        errors.push(`Keep the quote under ${sourceQuoteMaxLength} characters.`)
    }
    return errors
}

const statuses: TranslationStatus[] = ['machine', 'reviewed']

/**
 * The drafts in a posted JSON list, read defensively (the browser sends them): null when the
 * list isn't one, otherwise every draft with its errors.
 */
export function readPhotoDrafts(json: string): { draft: PhotoDraft; errors: string[] }[] | null {
    let raw: unknown
    try {
        raw = JSON.parse(json)
    } catch {
        return null
    }
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > photoDraftLimit) return null
    return raw.map((item: Record<string, unknown>) => {
        const translations = {} as PhotoDraft['translations']
        const posted = (item?.translations ?? {}) as Record<
            string,
            { text?: unknown; status?: unknown }
        >
        for (const locale of cardLocales) {
            const text = typeof posted[locale]?.text === 'string' ? posted[locale].text.trim() : ''
            if (!text) continue
            const status = statuses.find((one) => one === posted[locale].status) ?? 'reviewed'
            translations[locale] = { text, status }
        }
        const date = (item?.date ?? {}) as Partial<Record<keyof DateParts, unknown>>
        const draft: PhotoDraft = {
            categoryId: typeof item?.categoryId === 'string' ? item.categoryId : '',
            date: {
                decade: wholeOrNull(date.decade),
                year: wholeOrNull(date.year),
                month: wholeOrNull(date.month),
                day: wholeOrNull(date.day),
            },
            sourceUrl:
                typeof item?.sourceUrl === 'string' && item.sourceUrl.trim()
                    ? item.sourceUrl.trim()
                    : null,
            sourceQuote:
                typeof item?.sourceQuote === 'string' && item.sourceQuote.trim()
                    ? item.sourceQuote.trim()
                    : null,
            difficulty: item?.difficulty === null ? null : (item?.difficulty as number),
            countrySpecific:
                typeof item?.countrySpecific === 'string' && item.countrySpecific
                    ? item.countrySpecific
                    : null,
            translations,
            requestId:
                typeof item?.requestId === 'number' &&
                Number.isInteger(item.requestId) &&
                item.requestId > 0
                    ? item.requestId
                    : null,
        }
        if (draft.difficulty === undefined) draft.difficulty = null
        return { draft, errors: photoDraftErrors(draft) }
    })
}
