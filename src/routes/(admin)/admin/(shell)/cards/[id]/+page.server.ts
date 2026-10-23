import { redirect } from '@sveltejs/kit'
import { cardFormValues } from '#lib/cards/card-form.js'
import { publishBlockers } from '#lib/cards/publish-rule.js'
import { auditNames } from '#lib/server/audit.js'
import {
    cardLifecycleActions,
    cardListFor,
    editorCategories,
    loadCard,
    saveAndPublishAction,
    saveCardAction,
    verifierEmail,
} from '#lib/server/card-editor.js'
import { cardHistory } from '#lib/server/cards.js'
import { supabaseService } from '#lib/server/supabase.js'
import { createCategoryAction } from '#lib/server/category-editor.js'
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
    createCategory: createCategoryAction,
    save: async (event) => {
        const card = await loadCard(event.params.id)
        const saved = await saveCardAction(event, card)
        if (typeof saved !== 'string') return saved
        // Back to the tab the card is on, so editing an archived card stays on Archived.
        redirect(303, cardListFor(card))
    },
    saveAndPublish: async (event) => saveAndPublishAction(event, await loadCard(event.params.id)),
    ...cardLifecycleActions,
}
