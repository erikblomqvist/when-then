// Logs what the editor did with a date suggestion (#42): accepted it (or an alternative) into
// the form, or rejected it. The form itself is not saved here.
//
// POST { requestId: number, decision: 'accepted' | 'rejected', year?: number } → 204

import { error } from '@sveltejs/kit'
import {
    DateSuggestionNotFoundError,
    logDateSuggestionDecision,
} from '#lib/server/date-suggestion-log.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { RequestHandler } from './$types'

export const POST: RequestHandler = async (event) => {
    const { user } = await requireRole(event, 'editor')
    const body = (await event.request.json().catch(() => null)) as {
        requestId?: unknown
        decision?: unknown
        year?: unknown
    } | null
    const requestId = body?.requestId
    const decision = body?.decision
    if (typeof requestId !== 'number' || !Number.isInteger(requestId)) error(400, 'No suggestion.')
    if (decision !== 'accepted' && decision !== 'rejected') error(400, 'Unknown decision.')
    const year = typeof body?.year === 'number' && Number.isInteger(body.year) ? body.year : null

    try {
        await logDateSuggestionDecision(
            supabaseService(),
            user.id,
            event.params.id,
            requestId,
            decision,
            decision === 'accepted' ? year : null,
        )
    } catch (failure) {
        if (failure instanceof DateSuggestionNotFoundError) error(404, failure.message)
        throw failure
    }
    return new Response(null, { status: 204 })
}
