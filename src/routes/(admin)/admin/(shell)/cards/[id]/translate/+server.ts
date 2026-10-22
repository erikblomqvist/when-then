// "Translate from English" on a locale tab (#41): machine-translates the editor's current
// English text into one locale and returns it. Nothing is saved: the editor fills the tab and
// the person saves (as machine) or edits it first (as reviewed).
//
// POST { locale: 'sv' | 'nb', english: string } → 200 { text } | 4xx/5xx { message }

import { error, json } from '@sveltejs/kit'
import { cardTextMaxLength } from '#lib/cards/card-form.js'
import { translationLocales, type TranslationLocale } from '#lib/cards/translation.js'
import {
    AiCallError,
    AiRateLimitError,
    AiRefusedError,
    AiUnavailableError,
} from '#lib/server/ai.js'
import { aiDeps } from '#lib/server/ai-client.js'
import { translateCardText } from '#lib/server/ai-translate.js'
import { loadCard } from '#lib/server/card-editor.js'
import { listCategories } from '#lib/server/categories.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { RequestHandler } from './$types'

const isLocale = (value: unknown): value is TranslationLocale =>
    translationLocales.includes(value as TranslationLocale)

export const POST: RequestHandler = async (event) => {
    const { user } = await requireRole(event, 'editor')
    const body = (await event.request.json().catch(() => null)) as {
        locale?: unknown
        english?: unknown
    } | null
    const english = typeof body?.english === 'string' ? body.english.trim() : ''
    if (!isLocale(body?.locale)) error(400, 'Unknown language.')
    if (!english) error(400, 'Write the English text first.')
    if (english.length > cardTextMaxLength) error(400, 'The English text is too long.')

    const card = await loadCard(event.params.id)
    const category = (await listCategories(supabaseService(), { includeArchived: true })).find(
        ({ id }) => id === card.categoryId,
    )

    try {
        const texts = await translateCardText(aiDeps(), {
            actorId: user.id,
            cardId: card.id,
            english,
            category: category?.name ?? null,
            locales: [body.locale],
        })
        return json({ text: texts[body.locale] })
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
