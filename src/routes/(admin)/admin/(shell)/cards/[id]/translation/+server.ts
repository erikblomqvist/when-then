// A translation edited in place in the card list's review mode: saves one locale's text as
// reviewed. Refused (409) when the translation changed since the list loaded.
//
// POST { locale: 'sv' | 'nb', text: string, was: string | null } → 204 | 4xx { message }

import { error, json } from '@sveltejs/kit'
import { cardTextMaxLength } from '#lib/cards/card-form.js'
import { translationLocales, type TranslationLocale } from '#lib/cards/translation.js'
import { editTranslation, EditTranslationError } from '#lib/server/edit-translation.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { RequestHandler } from './$types'

const isLocale = (value: unknown): value is TranslationLocale =>
    translationLocales.includes(value as TranslationLocale)

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const status = { invalid_locale: 400, empty_text: 400, not_found: 404, changed: 409 }

export const POST: RequestHandler = async (event) => {
    const { user } = await requireRole(event, 'editor')
    if (!uuid.test(event.params.id)) error(404, 'The card no longer exists.')
    const body = (await event.request.json().catch(() => null)) as {
        locale?: unknown
        text?: unknown
        was?: unknown
    } | null
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    if (!isLocale(body?.locale)) error(400, 'Unknown language.')
    if (text.length > cardTextMaxLength) {
        error(400, `Keep the card under ${cardTextMaxLength} characters.`)
    }
    const was = typeof body.was === 'string' ? body.was : null

    try {
        await editTranslation(supabaseService(), user.id, {
            cardId: event.params.id,
            locale: body.locale,
            text,
            was,
        })
        return new Response(null, { status: 204 })
    } catch (failure) {
        if (!(failure instanceof EditTranslationError)) throw failure
        return json({ message: failure.message }, { status: status[failure.code] })
    }
}
