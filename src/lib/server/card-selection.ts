// A bulk action's `CardSelection` (`#lib/cards/card-selection.js`) as card ids. "All matching"
// is resolved when the action runs, through the same `cards_matching` query as the list.

import type { CardSelection } from '../cards/card-selection'
import { matchingCardIds } from './cards'
import type { Db } from './supabase'

/** The ids of the selected cards: the picked ones, or every card matching the filter now. */
export async function resolveCardSelection(db: Db, selection: CardSelection): Promise<string[]> {
    if (selection.kind === 'cards') return selection.ids
    return matchingCardIds(db, selection.filter)
}
