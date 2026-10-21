import { error } from '@sveltejs/kit'
import { cardFormValues } from '#lib/cards/card-form.js'
import { editorCategories, saveCardAction } from '#lib/server/card-editor.js'
import { auditNames } from '#lib/server/audit.js'
import { cardHistory, getCard } from '#lib/server/cards.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

async function loadCard(id: string) {
    const card = await getCard(supabaseService(), id)
    if (!card) error(404, 'No such card.')
    return card
}

export const load: PageServerLoad = async ({ params }) => {
    const card = await loadCard(params.id)
    const [categories, history, names] = await Promise.all([
        editorCategories(card),
        cardHistory(supabaseService(), card.id),
        auditNames(supabaseService()),
    ])
    return { card, values: cardFormValues(card), categories, history: { entries: history, names } }
}

export const actions: Actions = {
    save: async (event) => {
        const saved = await saveCardAction(event, await loadCard(event.params.id))
        if (typeof saved !== 'string') return saved
        return { saved: true }
    },
}
