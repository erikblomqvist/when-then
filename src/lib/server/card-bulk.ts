// Bulk lifecycle steps over many cards (publish, archive, move to category, delete drafts), one
// rpc per call (`public.bulk_card_action`, migrations `20261023004600_bulk_card_actions.sql`
// and `20261023006600_bulk_delete_drafts.sql`). Each card
// goes through the same single-card rpc as the editor's sidebar, in its own savepoint: a
// card the rule refuses is skipped with the reason, the rest still happen, and the audit log
// gets one row per affected card, naming the actor.

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
    const result: BulkResult = { done: [], skipped: [] }
    for (const row of data) {
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

/**
 * Deletes the never-published drafts (admins only, as from the editor); skips the rest, saying
 * why. An editor's call skips every card.
 */
export const deleteDrafts = (db: Db, actorId: string, cardIds: string[]) =>
    bulk(db, actorId, 'delete', cardIds)
