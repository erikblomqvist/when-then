// "Find date" on a card read from a photo (#60): the editor's "Suggest date" (#42) for a card
// that isn't saved yet, grounded in Wikidata first and web search second. Audited against the
// photo reading the card came from. Nothing is saved: the review page fills the date in.
//
// POST { english: string, categoryId?: string, requestKey: string }
//   → 200 { suggestion } | 4xx/5xx { message }

import { error, json } from '@sveltejs/kit'
import { cardTextMaxLength } from '#lib/cards/card-form.js'
import {
    AiCallError,
    AiRateLimitError,
    AiRefusedError,
    AiUnavailableError,
} from '#lib/server/ai.js'
import { aiDeps } from '#lib/server/ai-client.js'
import { suggestCardDate } from '#lib/server/ai-suggest-date.js'
import { listCategories } from '#lib/server/categories.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import { wikidataLookup } from '#lib/server/wikidata-client.js'
import type { RequestHandler } from './$types'

// A web search turn can take a while.
export const config = { maxDuration: 120 }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const POST: RequestHandler = async (event) => {
    const { user } = await requireRole(event, 'admin')
    const body = (await event.request.json().catch(() => null)) as {
        english?: unknown
        categoryId?: unknown
        requestKey?: unknown
    } | null
    const english = typeof body?.english === 'string' ? body.english.trim() : ''
    if (!english) error(400, 'Write the English text first.')
    if (english.length > cardTextMaxLength) error(400, 'The English text is too long.')
    const requestKey = typeof body?.requestKey === 'string' ? body.requestKey : ''
    if (!uuid.test(requestKey)) error(400, 'Read the photo first.')

    const category = (await listCategories(supabaseService())).find(
        ({ id }) => id === body?.categoryId,
    )

    try {
        const { suggestion } = await suggestCardDate(
            { ...aiDeps(), lookupWikidata: wikidataLookup() },
            {
                actorId: user.id,
                entity: 'photo',
                entityId: requestKey,
                english,
                category: category?.name ?? null,
            },
        )
        return json({ suggestion })
    } catch (failure) {
        const status =
            failure instanceof AiUnavailableError
                ? 503
                : failure instanceof AiRateLimitError
                  ? 429
                  : failure instanceof AiRefusedError
                    ? 422
                    : failure instanceof AiCallError
                      ? 502
                      : null
        if (status === null) throw failure
        return json({ message: (failure as Error).message }, { status })
    }
}
