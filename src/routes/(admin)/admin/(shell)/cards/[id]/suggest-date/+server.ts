// "Suggest date" beside the date fields (#42): asks the AI for the card's year, grounded in
// Wikidata first and web search second, for the English text as it is in the form. Nothing is
// saved: the editor accepts (fills the form) or rejects, and posts that to `./decision`.
//
// POST { english: string } → 200 { suggestion, requestId } | 4xx/5xx { message }

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
import { loadCard } from '#lib/server/card-editor.js'
import { listCategories } from '#lib/server/categories.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import { wikidataLookup } from '#lib/server/wikidata-client.js'
import type { RequestHandler } from './$types'

// A web search turn can take a while.
export const config = { maxDuration: 120 }

export const POST: RequestHandler = async (event) => {
    const { user } = await requireRole(event, 'editor')
    const body = (await event.request.json().catch(() => null)) as { english?: unknown } | null
    const english = typeof body?.english === 'string' ? body.english.trim() : ''
    if (!english) error(400, 'Write the English text first.')
    if (english.length > cardTextMaxLength) error(400, 'The English text is too long.')

    const card = await loadCard(event.params.id)
    const category = (await listCategories(supabaseService(), { includeArchived: true })).find(
        ({ id }) => id === card.categoryId,
    )

    try {
        const { suggestion, requestId } = await suggestCardDate(
            { ...aiDeps(), lookupWikidata: wikidataLookup() },
            {
                actorId: user.id,
                entity: 'card',
                entityId: card.id,
                english,
                category: category?.name ?? null,
            },
        )
        return json({ suggestion, requestId })
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
