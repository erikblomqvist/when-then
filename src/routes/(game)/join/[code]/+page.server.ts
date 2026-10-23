import { fail, redirect } from '@sveltejs/kit'
import { GameRefusal, getJoinStep, joinGame } from '#lib/server/game-lifecycle.js'
import { field } from '#lib/server/people-form.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

// The join step: the join link, the QR code and the home page's code entry all land here.
// A phone that already has a seat in the game goes on to its lobby.
export const load: PageServerLoad = async ({ params, locals }) => {
    const { user } = await locals.safeGetSession()
    try {
        const step = await getJoinStep(supabaseService(), user?.id ?? null, params.code)
        if (step.seated) redirect(303, `/game/${step.code}`)
        return { step, refusal: null }
    } catch (caught) {
        if (caught instanceof GameRefusal) return { step: null, refusal: caught.code }
        throw caught
    }
}

export const actions: Actions = {
    // Join game. The page signs the phone in (anonymously) before posting, so the seat
    // belongs to that session's user.
    default: async ({ request, locals, params }) => {
        const form = await request.formData()
        const values = {
            name: field(form, 'name'),
            icon: field(form, 'icon'),
        }

        const { user } = await locals.safeGetSession()
        if (!user) return fail(401, { values, signedOut: true as const })

        let code: string
        try {
            ;({ code } = await joinGame(supabaseService(), {
                userId: user.id,
                code: params.code,
                ...values,
            }))
        } catch (error) {
            if (error instanceof GameRefusal) return fail(400, { values, refusal: error.code })
            throw error
        }
        redirect(303, `/game/${code}`)
    },
}
