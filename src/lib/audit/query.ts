// The global audit log's address: filters and a paging cursor in the query string, so a
// filtered page can be bookmarked and shared, and the filter form is a plain GET form.

/** The log's filters, as the filter form names them. Absent means "any". */
export type AuditLogFilters = { actor?: string; entity?: string; action?: string }

export type AuditLogAddress = {
    filters: AuditLogFilters
    /** Show entries older than this entry id (the next page). */
    before: number | undefined
    /** Show entries newer than this entry id (the previous page). */
    after: number | undefined
}

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
// Entity and action names are snake_case words; anything else can't match an entry.
const name = /^[a-z][a-z0-9_]{0,63}$/

const cursor = (value: string | null) =>
    value && /^\d{1,15}$/.test(value) && Number(value) > 0 ? Number(value) : undefined

const matching = (value: string | null, pattern: RegExp) =>
    value && pattern.test(value) ? value : undefined

/** Reads the filters and cursor from the log's query string, dropping anything malformed. */
export function readAuditLogQuery(params: URLSearchParams): AuditLogAddress {
    const filters: AuditLogFilters = {}
    const actor = matching(params.get('actor'), uuid)
    const entity = matching(params.get('entity'), name)
    const action = matching(params.get('action'), name)
    if (actor) filters.actor = actor
    if (entity) filters.entity = entity
    if (action) filters.action = action
    return { filters, before: cursor(params.get('before')), after: cursor(params.get('after')) }
}

/** The log's address for these filters, optionally at a page either side of a cursor. */
export function auditLogHref(
    filters: AuditLogFilters,
    page: { before?: number; after?: number } = {},
): string {
    const params = new URLSearchParams()
    for (const key of ['actor', 'entity', 'action'] as const) {
        const value = filters[key]
        if (value) params.set(key, value)
    }
    if (page.before !== undefined) params.set('before', String(page.before))
    if (page.after !== undefined) params.set('after', String(page.after))
    const search = params.toString()
    return search ? `/admin/audit?${search}` : '/admin/audit'
}
