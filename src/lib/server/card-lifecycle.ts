// A card's lifecycle (Draft → Published → Archived, glossary) and its date verification.
// Every step is an rpc taking the actor first (migration `20261023003800_card_lifecycle.sql`),
// so the audit log names who did it, as 'publish', 'archive', 'unarchive', 'delete',
// 'verify' or 'unverify'. The database enforces the transitions and the publish rule; callers
// check `publishBlockers` first to explain a refusal, and catch `CardLifecycleError`.

import type { Database } from '../database.types'
import type { Db } from './supabase'

/** Why the database refused a lifecycle step. */
export type CardLifecycleErrorCode =
    | 'not_found'
    | 'invalid_transition'
    | 'publish_blocked'
    | 'not_admin'
    | 'not_draft'

const codes = new Set<string>([
    'not_found',
    'invalid_transition',
    'publish_blocked',
    'not_admin',
    'not_draft',
])

/** A refused step; `message` says why, in a sentence the editor can show. */
export class CardLifecycleError extends Error {
    constructor(
        readonly code: CardLifecycleErrorCode,
        message: string,
    ) {
        super(message)
        this.name = 'CardLifecycleError'
    }
}

type Rpc = keyof Database['public']['Functions']

async function step(db: Db, rpc: Rpc, args: Record<string, unknown>): Promise<void> {
    const { error } = await db.rpc(rpc, args as never)
    if (!error) return
    if (codes.has(error.message)) {
        throw new CardLifecycleError(
            error.message as CardLifecycleErrorCode,
            error.details || error.message,
        )
    }
    throw new Error(error.message, { cause: error })
}

/** Draft → Published. Refused (`publish_blocked`) while the publish rule blocks the card. */
export const publishCard = (db: Db, actorId: string, cardId: string) =>
    step(db, 'publish_card', { actor: actorId, card_id: cardId })

/** Published → Archived: kept, but no longer dealt. */
export const archiveCard = (db: Db, actorId: string, cardId: string) =>
    step(db, 'archive_card', { actor: actorId, card_id: cardId })

/** Archived → Published, again only when the publish rule allows it. */
export const unarchiveCard = (db: Db, actorId: string, cardId: string) =>
    step(db, 'unarchive_card', { actor: actorId, card_id: cardId })

/** Hard-deletes a never-published draft. Admins only (`not_admin`), drafts only (`not_draft`). */
export const deleteDraft = (db: Db, actorId: string, cardId: string) =>
    step(db, 'delete_draft', { actor: actorId, card_id: cardId })

/** Records that `actorId` checked the card's date against a source, now. */
export const markVerified = (db: Db, actorId: string, cardId: string) =>
    step(db, 'set_card_verified', { actor: actorId, card_id: cardId, verified: true })

/** Takes the verification back (the date is no longer known to be checked). */
export const clearVerification = (db: Db, actorId: string, cardId: string) =>
    step(db, 'set_card_verified', { actor: actorId, card_id: cardId, verified: false })
