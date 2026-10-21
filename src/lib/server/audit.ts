// Reading the audit log. Rows are written by database triggers (cards, categories and their
// translations) with the actor named by the rpc that made the change; see the migration
// `20261023003700_cards_categories_audit.sql`. App-written rows (AI calls) go in through
// `recordAction` once a ticket needs it, always with an explicit actor.

import type { Json } from '../database.types'
import type { CardLocale } from '../cards/card'
import type { Db } from './supabase'

export type AuditEntry = {
    id: number
    at: string
    actorId: string | null
    /** 'card', 'card_translation', 'category', 'category_translation', … */
    entity: string
    /** The card or category the entry is about, also for its translations. */
    entityId: string
    locale: CardLocale | null
    /** 'create', 'update', 'delete' from the triggers; app-written actions add their own. */
    action: string
    before: Record<string, Json> | null
    after: Record<string, Json> | null
    details: Json | null
}

const asRecord = (value: Json | null) =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, Json>)
        : null

/** Everything that happened to a card or category (and its translations), newest first. */
export async function historyOf(db: Db, entityId: string): Promise<AuditEntry[]> {
    const { data, error } = await db
        .from('audit_log')
        .select('*')
        .eq('entity_id', entityId)
        .order('id', { ascending: false })
    if (error) throw new Error(error.message, { cause: error })
    return data.map((row) => ({
        id: row.id,
        at: row.at,
        actorId: row.actor_id,
        entity: row.entity,
        entityId: row.entity_id,
        locale: row.locale,
        action: row.action,
        before: asRecord(row.before),
        after: asRecord(row.after),
        details: row.details,
    }))
}
