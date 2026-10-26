// The deck a game is dealt from (ADR 0004): every published card the lobby's settings let in,
// snapshotted at Start so a card edited mid-game can't change a game in progress. The lifecycle
// service (`#lib/server/game-lifecycle.js`) reads the rows; this turns them into the machine's
// `DeckCard`s, and the machine shuffles them into one queue per category.

import type { CardLocale } from '../cards/card'
import type { DeckCard } from './state'

/** A published card as read for the deck: its category's place, date parts and texts. */
export type DeckRow = {
    id: string
    categoryId: string
    /** The category's place in the admin's order, which the queues keep. */
    categoryPosition: number
    year: number | null
    decade: number | null
    texts: Partial<Record<CardLocale, string>>
}

/**
 * The deck from `rows`, categories in their order: each card's text in `cardLanguage`, falling
 * back to English, and its date by year, or by decade when no year is known. A card without a
 * text or a date can't be played and is left out.
 */
export function deckFromRows(rows: readonly DeckRow[], cardLanguage: CardLocale): DeckCard[] {
    return rows
        .toSorted((a, b) => a.categoryPosition - b.categoryPosition)
        .flatMap((row) => {
            const text = row.texts[cardLanguage] ?? row.texts.en
            const date = row.year ?? row.decade
            if (text === undefined || date === null) return []
            return [{ id: row.id, category: row.categoryId, text, date }]
        })
}
