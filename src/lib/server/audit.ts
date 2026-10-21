// Reading the audit log. Rows are written by database triggers (cards, categories and their
// translations) with the actor named by the rpc that made the change; see the migration
// `20261023003700_cards_categories_audit.sql`. App-written rows (AI calls) go in through
// `recordAction` once a ticket needs it, always with an explicit actor.
//
// How entries read (labels, field diffs) is `#lib/audit/display.js`, shared with the pages.

import type { Database, Json } from '../database.types'
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

type AuditRow = Database['public']['Tables']['audit_log']['Row']

const asRecord = (value: Json | null) =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, Json>)
        : null

const toEntry = (row: AuditRow): AuditEntry => ({
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
})

const fail = (error: { message: string }): never => {
    throw new Error(error.message, { cause: error })
}

/** Everything that happened to a card or category (and its translations), newest first. */
export async function historyOf(db: Db, entityId: string): Promise<AuditEntry[]> {
    const { data, error } = await db
        .from('audit_log')
        .select('*')
        .eq('entity_id', entityId)
        .order('id', { ascending: false })
    if (error) fail(error)
    return (data ?? []).map(toEntry)
}

/**
 * What the global log asks for: optional filters, and a page of `pageSize` entries either
 * older than `before` or newer than `after` (entry ids, from a previous page's cursors).
 */
export type AuditLogQuery = {
    actorId?: string
    entity?: string
    action?: string
    before?: number
    after?: number
    pageSize: number
}

/** A page of the log, newest first, with cursors for the pages either side (null at the end). */
export type AuditLogPage = { entries: AuditEntry[]; newer: number | null; older: number | null }

/** The global audit log, filtered and paged by entry id (newest first). */
export async function auditLog(db: Db, query: AuditLogQuery): Promise<AuditLogPage> {
    const { actorId, entity, action, before, after, pageSize } = query
    const forward = after !== undefined
    let select = db.from('audit_log').select('*')
    if (actorId) select = select.eq('actor_id', actorId)
    if (entity) select = select.eq('entity', entity)
    if (action) select = select.eq('action', action)
    if (forward) select = select.gt('id', after)
    else if (before !== undefined) select = select.lt('id', before)
    // One extra row tells whether there is another page in the direction we're going.
    const { data, error } = await select.order('id', { ascending: forward }).limit(pageSize + 1)
    if (error) fail(error)

    const rows = data ?? []
    const more = rows.length > pageSize
    const page = rows.slice(0, pageSize).map(toEntry)
    if (forward) page.reverse()
    const first = page.at(0)?.id ?? null
    const last = page.at(-1)?.id ?? null
    // Coming from a cursor means there is something on its other side.
    return forward
        ? { entries: page, newer: more ? first : null, older: last ?? after }
        : {
              entries: page,
              newer: before !== undefined ? (first ?? before) : null,
              older: more ? last : null,
          }
}

export type AuditActor = { id: string; email: string }

/** Everyone who appears as an actor in the log, by email. */
export async function auditActors(db: Db): Promise<AuditActor[]> {
    const { data, error } = await db.rpc('audit_actors')
    if (error) fail(error)
    return data ?? []
}

/** The entities and actions present in the log, for its filters. */
export async function auditKinds(db: Db): Promise<{ entities: string[]; actions: string[] }> {
    const { data, error } = await db.rpc('audit_kinds')
    if (error) fail(error)
    const rows = data ?? []
    return {
        entities: [...new Set(rows.map((row) => row.entity))].sort(),
        actions: [...new Set(rows.map((row) => row.action))].sort(),
    }
}
