// Bulk lifecycle steps over many cards (publish, archive, move to category, delete), one
// rpc per call (`public.bulk_card_action`, migrations `20261023004600_bulk_card_actions.sql`
// and `20261023006600_bulk_delete_drafts.sql`, `20261023085950_delete_any_card.sql`). Each card
// goes through the same single-card rpc as the editor's sidebar, in its own savepoint: a
// card the rule refuses is skipped with the reason, the rest still happen, and the audit log
// gets one row per affected card, naming the actor. Reviewing translations
// (`public.review_translations`, `20261023160000_review_translations.sql`) reports the same way.

import type { TranslationLocale } from '../cards/translation'
import type { Db } from './supabase'

/** A card a bulk action left alone, with its English text and why. */
export type SkippedCard = { id: string; text: string | null; reason: string }

/** The cards a bulk action changed (in the given order) and the ones it skipped. */
export type BulkResult = { done: string[]; skipped: SkippedCard[] }

async function bulk(
    db: Db,
    actorId: string,
    action: 'publish' | 'archive' | 'move' | 'delete',
    cardIds: string[],
    categoryId?: string,
): Promise<BulkResult> {
    if (cardIds.length === 0) return { done: [], skipped: [] }
    const { data, error } = await db.rpc('bulk_card_action', {
        actor: actorId,
        action,
        card_ids: cardIds,
        category_id: categoryId,
    })
    if (error) throw new Error(error.details || error.message, { cause: error })
    return bulkResult(data)
}

type BulkRow = { card_id: string; done: boolean; reason: string; card_text: string }

function bulkResult(rows: BulkRow[]): BulkResult {
    const result: BulkResult = { done: [], skipped: [] }
    for (const row of rows) {
        if (row.done) result.done.push(row.card_id)
        else result.skipped.push({ id: row.card_id, text: row.card_text, reason: row.reason })
    }
    return result
}

/** Publishes the drafts the publish rule allows; skips the rest, saying why. */
export const publishCards = (db: Db, actorId: string, cardIds: string[]) =>
    bulk(db, actorId, 'publish', cardIds)

/** Archives the drafts and published cards; skips the archived ones, saying why. */
export const archiveCards = (db: Db, actorId: string, cardIds: string[]) =>
    bulk(db, actorId, 'archive', cardIds)

/**
 * Moves the cards to `categoryId` (status unchanged), skipping cards already there. Throws,
 * moving nothing, when the category doesn't exist or is archived.
 */
export const moveCards = (db: Db, actorId: string, cardIds: string[], categoryId: string) =>
    bulk(db, actorId, 'move', cardIds, categoryId)

/** Deletes the cards, whatever their status (admins only, as from the editor). An editor's call skips every card. */
export const deleteCards = (db: Db, actorId: string, cardIds: string[]) =>
    bulk(db, actorId, 'delete', cardIds)

/**
 * Marks the cards' translation in `locale` reviewed (its text unchanged), skipping cards with
 * none in that locale or a reviewed one, saying why.
 */
export async function reviewTranslations(
    db: Db,
    actorId: string,
    cardIds: string[],
    locale: TranslationLocale,
): Promise<BulkResult> {
    if (cardIds.length === 0) return { done: [], skipped: [] }
    const { data, error } = await db.rpc('review_translations', {
        actor: actorId,
        locale,
        card_ids: cardIds,
    })
    if (error) throw new Error(error.details || error.message, { cause: error })
    return bulkResult(data)
}
