import { fail, redirect } from '@sveltejs/kit'
import { getLocale } from '#lib/paraglide/runtime.js'
import { createGame, GameRefusal } from '#lib/server/game-lifecycle.js'
import { field } from '#lib/server/people-form.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions } from './$types'

export const actions: Actions = {
    // Create game. The page signs the phone in (anonymously) before posting, so the host's
    // seat belongs to that session's user.
    default: async ({ request, locals }) => {
        const form = await request.formData()
        const values = {
            name: field(form, 'name'),
            icon: field(form, 'icon'),
        }

        const { user } = await locals.safeGetSession()
        if (!user) return fail(401, { values, signedOut: true as const })

        let code: string
        try {
            ;({ code } = await createGame(supabaseService(), {
                userId: user.id,
                ...values,
                // The card language starts as the host's own app language.
                cardLanguage: getLocale(),
            }))
        } catch (error) {
            if (error instanceof GameRefusal) return fail(400, { values, refusal: error.code })
            throw error
        }
        redirect(303, `/game/${code}`)
    },
}
