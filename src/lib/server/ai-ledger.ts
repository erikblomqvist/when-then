// The AI ledger on the audit log: every AI call is an app-written `audit_log` row with action
// `ai_*`, so the per-person rate limit just counts those rows.

import type { Json } from '../database.types'
import type { AiLedger } from './ai'
import type { Db } from './supabase'

export function dbLedger(db: Db): AiLedger {
    return {
        async callsSince(actorId, since) {
            const { count, error } = await db
                .from('audit_log')
                .select('id', { count: 'exact', head: true })
                .eq('actor_id', actorId)
                .like('action', 'ai_%')
                .gte('at', since.toISOString())
            if (error) throw new Error(`Counting AI calls failed: ${error.message}`)
            return count ?? 0
        },
        async record({ actorId, entity, entityId, locale, action, details }) {
            const { error } = await db.from('audit_log').insert({
                actor_id: actorId,
                entity,
                entity_id: entityId,
                locale,
                action,
                details: details as Json,
            })
            if (error) throw new Error(`Logging the AI call failed: ${error.message}`)
        },
    }
}
