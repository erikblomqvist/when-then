import { readAuditLogQuery } from '#lib/audit/query.js'
import { auditKinds, auditLog, auditNames } from '#lib/server/audit.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { PageServerLoad } from './$types'

const pageSize = 50

// The global audit log: admins only (#14). Filters and paging live in the query string.
export const load: PageServerLoad = async (event) => {
    await requireRole(event, 'admin')
    const db = supabaseService()
    const { filters, before, after } = readAuditLogQuery(event.url.searchParams)
    const [page, kinds, names] = await Promise.all([
        auditLog(db, {
            actorId: filters.actor,
            entity: filters.entity,
            action: filters.action,
            before,
            after,
            pageSize,
        }),
        auditKinds(db),
        auditNames(db),
    ])
    return { ...page, filters, kinds, names }
}
