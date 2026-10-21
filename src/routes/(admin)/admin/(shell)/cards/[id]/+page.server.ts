import { cardFormValues } from '#lib/cards/card-form.js'
import { publishBlockers } from '#lib/cards/publish-rule.js'
import { auditNames } from '#lib/server/audit.js'
import {
    cardLifecycleActions,
    editorCategories,
    loadCard,
    saveCardAction,
    verifierEmail,
} from '#lib/server/card-editor.js'
import { cardHistory } from '#lib/server/cards.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
    const card = await loadCard(params.id)
    const [categories, history, names, verifiedByEmail] = await Promise.all([
        editorCategories(card),
        cardHistory(supabaseService(), card.id),
        auditNames(supabaseService()),
        verifierEmail(card),
    ])
    return {
        card,
        values: cardFormValues(card),
        categories,
        history: { entries: history, names },
        publishBlockers: publishBlockers(card),
        verifiedByEmail,
    }
}

export const actions: Actions = {
    save: async (event) => {
        const saved = await saveCardAction(event, await loadCard(event.params.id))
        if (typeof saved !== 'string') return saved
        return { saved: true }
    },
    ...cardLifecycleActions,
}
