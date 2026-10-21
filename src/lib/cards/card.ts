// The card domain as the admin works with it, independent of the table layout. The server's
// card repository (`#lib/server/cards.js`) maps rows to these shapes and back.

import { Constants, type Database } from '../database.types'
import type { DateParts } from './date-parts'

type Enums = Database['public']['Enums']

/** Card languages (glossary): English is canonical, the others are translations. */
export const cardLocales = Constants.public.Enums.card_locale
export type CardLocale = Enums['card_locale']

/** Draft → Published → Archived (glossary). */
export type CardStatus = Enums['card_status']

/** A translation's state: machine until a person reviews it, stale when the English changed. */
export type TranslationStatus = Enums['translation_status']

/** One locale's text. `note` is the per-translation hook (ADR 0001); the editor adds it later. */
export type TranslationInput = { text: string; note?: string | null }

/**
 * What the editor saves: the language-neutral card plus the translations it touches. Only the
 * locales present are written, so the English form and later per-locale tabs share one save.
 */
export type CardInput = {
    categoryId: string
    date: DateParts
    sourceUrl: string | null
    sourceQuote: string | null
    translations: Partial<Record<CardLocale, TranslationInput>> & { en: TranslationInput }
}

/** The language-neutral part of a card. */
export type CardFields = Omit<CardInput, 'translations'>

export type Translation = { text: string; note: string | null; status: TranslationStatus }

/** A saved card as the editor loads it. */
export type Card = CardFields & {
    id: string
    status: CardStatus
    translations: Partial<Record<CardLocale, Translation>>
    createdAt: string
    updatedAt: string
}

/** The category facts the card list and editor show next to a card. */
export type CardCategory = { id: string; name: string; icon: string; colour: string }

/**
 * What the card list asks for. Search, filters (status, category, translation state, verified,
 * source, before/after 1500) and sort order are added here as the list grows.
 */
export type CardListQuery = { page: number; pageSize: number }

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
    updatedAt: string
}
