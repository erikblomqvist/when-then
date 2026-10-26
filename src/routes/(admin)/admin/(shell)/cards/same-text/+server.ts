// The editor's duplicate warning: the cards (not archived) whose English text is the same as
// the one typed, case, punctuation and spacing aside, leaving out the card being edited.
//
// GET ?text=…&except=<card id> → 200 { cards: [{ id, text }] }

import { error, json } from '@sveltejs/kit'
import { cardTextMaxLength } from '#lib/cards/card-form.js'
import { cardsWithSameText } from '#lib/server/duplicate-cards.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { RequestHandler } from './$types'

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

export const GET: RequestHandler = async (event) => {
    await requireRole(event, 'editor')
    const text = event.url.searchParams.get('text')?.trim() ?? ''
    const except = event.url.searchParams.get('except') ?? undefined
    if (text.length > cardTextMaxLength) error(400, 'The text is too long.')
    if (except !== undefined && !uuid.test(except)) error(400, 'Unknown card.')
    if (!text) return json({ cards: [] })
    const [cards] = await cardsWithSameText(supabaseService(), [text], except)
    return json({ cards })
}
