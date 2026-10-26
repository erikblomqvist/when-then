// Suspected duplicates before a card is created again: the cards (not archived) whose English
// text is the same as a given one, case, punctuation and spacing aside (`public.cards_with_text`,
// migration `20261026150000_suspected_duplicates.sql`). The editor, the CSV import preview and
// "Add from photo" warn with it; the card list's `duplicates` filter shows the ones already in.

import { earlierSameText } from '../cards/card-text-key'
import type { Db } from './supabase'

/** An existing card with the same English text. */
export type SameTextCard = { id: string; text: string }

/**
 * Per given English text, in order: the cards with the same text, oldest first, leaving out
 * `exceptCardId` (the card being edited).
 */
export async function cardsWithSameText(
    db: Db,
    texts: readonly string[],
    exceptCardId?: string,
): Promise<SameTextCard[][]> {
    const found: SameTextCard[][] = texts.map(() => [])
    if (texts.length === 0) return found
    const { data, error } = await db.rpc('cards_with_text', {
        texts: [...texts],
        ...(exceptCardId === undefined ? {} : { except_card: exceptCardId }),
    })
    if (error) throw new Error(error.message, { cause: error })
    for (const row of data) found[row.text_index]?.push({ id: row.card_id, text: row.card_text })
    return found
}

/** Why a card about to be created looks like a duplicate: existing cards, an earlier one. */
export type SuspectedDuplicate = {
    /** Existing cards with the same text, oldest first. */
    cards: SameTextCard[]
    /** The index of an earlier text in the same batch that is the same, or null. */
    earlier: number | null
}

/**
 * Per text of a batch about to be created (a CSV file): why it looks like a duplicate, or null.
 * An empty text (a row that won't be created) never matches.
 */
export async function suspectedDuplicates(
    db: Db,
    texts: readonly string[],
): Promise<(SuspectedDuplicate | null)[]> {
    const existing = await cardsWithSameText(db, texts)
    const earlier = earlierSameText(texts)
    return texts.map((_, index) => {
        const cards = existing[index] ?? []
        return cards.length > 0 || earlier[index] !== null
            ? { cards, earlier: earlier[index] ?? null }
            : null
    })
}
