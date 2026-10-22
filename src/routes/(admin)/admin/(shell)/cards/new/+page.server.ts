import { redirect } from '@sveltejs/kit'
import { emptyCardFormValues } from '#lib/cards/card-form.js'
import { editorCategories, saveCardAction } from '#lib/server/card-editor.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async () => ({
    values: emptyCardFormValues,
    categories: await editorCategories(),
})

export const actions: Actions = {
    save: async (event) => {
        const saved = await saveCardAction(event)
        if (typeof saved !== 'string') return saved
        redirect(303, `/admin/cards/${saved}`)
    },
}
