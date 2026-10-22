import { redirect } from '@sveltejs/kit'
import { emptyCardFormValues } from '#lib/cards/card-form.js'
import { editorCategories, saveAndPublishAction, saveCardAction } from '#lib/server/card-editor.js'
import { createCategoryAction } from '#lib/server/category-editor.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async () => ({
    values: emptyCardFormValues,
    categories: await editorCategories(),
})

export const actions: Actions = {
    createCategory: createCategoryAction,
    save: async (event) => {
        const saved = await saveCardAction(event)
        if (typeof saved !== 'string') return saved
        redirect(303, '/admin/cards')
    },
    saveAndPublish: (event) => saveAndPublishAction(event),
}
