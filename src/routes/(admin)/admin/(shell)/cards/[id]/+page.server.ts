import { cardFormValues } from '#lib/cards/card-form.js'
import { publishBlockers } from '#lib/cards/publish-rule.js'
import {
    cardLifecycleActions,
    editorCategories,
    loadCard,
    saveCardAction,
    verifierEmail,
} from '#lib/server/card-editor.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
    const card = await loadCard(params.id)
    return {
        card,
        values: cardFormValues(card),
        categories: await editorCategories(card),
        publishBlockers: publishBlockers(card),
        verifiedByEmail: await verifierEmail(card),
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
