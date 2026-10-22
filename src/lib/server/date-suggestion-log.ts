// What the editor did with a date suggestion (#42): accepted it (or an alternative) into the
// form, or rejected it. Logged as its own audit row on the card, pointing at the request row
// (`ai_suggest_date`, written by `runModel`) and carrying that request's cost and model, so the
// card history reads "requested … accepted 1908 … $0.01" without trusting numbers from the
// browser. Not `ai_*` actions: they don't count towards the AI rate limit.

import type { AuditAction } from '../audit/actions'
import type { Json } from '../database.types'
import type { Db } from './supabase'

export type DateSuggestionDecision = 'accepted' | 'rejected'

export const decisionActions: Record<DateSuggestionDecision, AuditAction> = {
    accepted: 'accept_date_suggestion',
    rejected: 'reject_date_suggestion',
}

export class DateSuggestionNotFoundError extends Error {}

/**
 * Logs the decision on suggestion request `requestId`, which must be this person's successful
 * `ai_suggest_date` on this card. `year` is the year put into the form (accepted only).
 */
export async function logDateSuggestionDecision(
    db: Db,
    actorId: string,
    cardId: string,
    requestId: number,
    decision: DateSuggestionDecision,
    year: number | null,
): Promise<void> {
    const { data: request, error } = await db
        .from('audit_log')
        .select('details')
        .eq('id', requestId)
        .eq('action', 'ai_suggest_date')
        .eq('actor_id', actorId)
        .eq('entity_id', cardId)
        .maybeSingle()
    if (error) throw new Error(`Reading the suggestion failed: ${error.message}`)
    const asked = (request?.details ?? null) as Record<string, Json> | null
    if (!asked || asked.outcome !== 'ok') {
        throw new DateSuggestionNotFoundError('That date suggestion was not found.')
    }

    const { error: insertError } = await db.rpc('record_audit', {
        actor: actorId,
        entity: 'card',
        entity_id: cardId,
        action: decisionActions[decision],
        details: {
            request_id: requestId,
            ...(decision === 'accepted' ? { year } : {}),
            suggested_year: asked.year ?? null,
            source_url: asked.source_url ?? null,
            model: asked.model ?? null,
            cost_usd: asked.cost_usd ?? null,
        },
    })
    if (insertError) throw new Error(`Logging the decision failed: ${insertError.message}`)
}
