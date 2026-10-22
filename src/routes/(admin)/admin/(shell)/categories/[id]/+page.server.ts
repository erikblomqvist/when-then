import { error, redirect } from '@sveltejs/kit'
import { listCategories } from '#lib/server/categories.js'
import { categoryFormValues, saveCategoryAction } from '#lib/server/category-editor.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
    await requireRole(event, 'admin')
    const categories = await listCategories(supabaseService(), { includeArchived: true })
    const category = categories.find((listed) => listed.id === event.params.id)
    if (!category) error(404, 'No such category.')
    return { category, values: categoryFormValues(category) }
}

export const actions: Actions = {
    save: async (event) => {
        const saved = await saveCategoryAction(event, event.params.id)
        if (typeof saved !== 'string') return saved
        redirect(303, '/admin/categories')
    },
}
