// The card domain as the admin works with it, independent of the table layout. The server's
// card repository (`#lib/server/cards.js`) maps rows to these shapes and back.

import { Constants, type Database } from '../database.types'
import type { CardFilter, CardSort } from './card-list'
import type { DateParts } from './date-parts'

type Enums = Database['public']['Enums']

/** Card languages (glossary): English is canonical, the others are translations. */
export const cardLocales = Constants.public.Enums.card_locale
export type CardLocale = Enums['card_locale']

export const isCardLocale = (value: unknown): value is CardLocale =>
    cardLocales.some((locale) => locale === value)

/** Draft → Published → Archived (glossary). */
export type CardStatus = Enums['card_status']

export const cardStatusLabel: Record<CardStatus, string> = {
    draft: 'Draft',
    published: 'Published',
    archived: 'Archived',
}

/** A translation's state: machine until a person reviews it, stale when the English changed. */
export type TranslationStatus = Enums['translation_status']

/**
 * One locale's text and its note for the reader (ADR 0001). A note left out keeps the saved
 * one. `status` only when someone decided it (ticked reviewed, a machine translation);
 * otherwise the save works it out (`#lib/cards/translation.js`).
 */
export type TranslationInput = { text: string; note?: string | null; status?: TranslationStatus }

/**
 * What the editor saves: the language-neutral card plus the translations it touches. Only the
 * locales present are written, so the English form and the locale tabs share one save; a
 * translation given as null is removed.
 */
export type CardInput = {
    categoryId: string
    date: DateParts
    sourceUrl: string | null
    sourceQuote: string | null
    /**
     * 1 (most people know it) to 4 (obscure), or null when not set. Left out, a save keeps the
     * card's difficulty as it is (imports that don't set one).
     */
    difficulty?: number | null
    translations: Partial<Record<CardLocale, TranslationInput | null>> & { en: TranslationInput }
    /** Clear the date's verification with this save (the editor asks when a verified date changes). */
    clearVerification?: boolean
}

/** The language-neutral part of a card. */
export type CardFields = Omit<CardInput, 'translations' | 'clearVerification'>

export type Translation = { text: string; note: string | null; status: TranslationStatus }

/** A saved card as the editor loads it. */
export type Card = CardFields & {
    id: string
    difficulty: number | null
    status: CardStatus
    translations: Partial<Record<CardLocale, Translation>>
    /** When and by whom the date was checked against a source; null when it wasn't. */
    verifiedAt: string | null
    verifiedBy: string | null
    /** What an archived card was before (where unarchiving returns it); null unless archived. */
    archivedFrom: CardStatus | null
    createdAt: string
    updatedAt: string
}

/** The category facts the card list and editor show next to a card. */
export type CardCategory = { id: string; name: string; icon: string; colour: string }

/** What the card list asks for: a view (`#lib/cards/card-list.js`) and the page size. */
export type CardListQuery = {
    page: number
    pageSize: number
    /** Defaults to every card. */
    filter?: CardFilter
    /** Defaults to most recently updated first. */
    sort?: CardSort
}

/** One row of the card list. */
export type CardSummary = {
    id: string
    status: CardStatus
    /** English text; null only for a card that has none yet. */
    text: string | null
    date: DateParts
    category: CardCategory
    /** Per-locale translation status, for the list's badges. A missing locale has no entry. */
    translations: Partial<Record<CardLocale, TranslationStatus>>
    /** Per-locale text, for the list's review mode. A missing locale has no entry. */
    texts: Partial<Record<CardLocale, string>>
    verified: boolean
    updatedAt: string
}
