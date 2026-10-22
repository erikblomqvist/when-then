import { fail } from '@sveltejs/kit'
import {
    deleteCategory,
    listCategories,
    reorderCategories,
    setCategoryArchived,
} from '#lib/server/categories.js'
import { asAdmin } from '#lib/server/category-editor.js'
import { requireRole } from '#lib/server/guard.js'
import { field } from '#lib/server/people-form.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
    await requireRole(event, 'admin')
    return { categories: await listCategories(supabaseService(), { includeArchived: true }) }
}

const noCategory = () => fail(400, { error: 'Choose a category.' })

export const actions: Actions = {
    reorder: async (event) => {
        const form = await event.request.formData()
        const ids = form.getAll('id').filter((id) => typeof id === 'string')
        return asAdmin(event, async (actor) => {
            if (ids.length === 0) return noCategory()
            await reorderCategories(supabaseService(), actor, ids)
            return { message: 'Saved the new order.' }
        })
    },

    archive: async (event) => {
        const form = await event.request.formData()
        const id = field(form, 'id')
        return asAdmin(event, async (actor) => {
            if (!id) return noCategory()
            await setCategoryArchived(supabaseService(), actor, id, true)
            return { message: `Archived ${field(form, 'name')}.` }
        })
    },

    unarchive: async (event) => {
        const form = await event.request.formData()
        const id = field(form, 'id')
        return asAdmin(event, async (actor) => {
            if (!id) return noCategory()
            await setCategoryArchived(supabaseService(), actor, id, false)
            return { message: `Unarchived ${field(form, 'name')}.` }
        })
    },

    delete: async (event) => {
        const form = await event.request.formData()
        const id = field(form, 'id')
        return asAdmin(event, async (actor) => {
            if (!id) return noCategory()
            await deleteCategory(supabaseService(), actor, id)
            return { message: `Deleted ${field(form, 'name')}.` }
        })
    },
}
