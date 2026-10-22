import { redirect } from '@sveltejs/kit'
import { requireRole } from '#lib/server/guard.js'
import { emptyCategoryFormValues, saveCategoryAction } from '#lib/server/category-editor.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
    await requireRole(event, 'admin')
    return { values: emptyCategoryFormValues }
}

export const actions: Actions = {
    save: async (event) => {
        const saved = await saveCategoryAction(event)
        if (typeof saved !== 'string') return saved
        redirect(303, '/admin/categories')
    },
}
