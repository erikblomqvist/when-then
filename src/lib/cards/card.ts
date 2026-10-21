// The card domain as the admin works with it, independent of the table layout. The server's
// card repository (`#lib/server/cards.js`) maps rows to these shapes and back.

import type { DateParts } from './date-parts'

/** Card languages (glossary): English is canonical, the others are translations. */
export const cardLocales = ['en', 'sv', 'nb'] as const
export type CardLocale = (typeof cardLocales)[number]

/** Draft → Published → Archived (glossary). */
export type CardStatus = 'draft' | 'published' | 'archived'

/** A translation's state: machine until a person reviews it, stale when the English changed. */
export type TranslationStatus = 'machine' | 'reviewed' | 'stale'

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
