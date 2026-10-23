import { error, fail, redirect } from '@sveltejs/kit'
import { normaliseGameCode } from '#lib/game/game-code.js'
import { refusalMessage } from '#lib/game/refusals.js'
import {
    changePlayer,
    GameRefusal,
    getLobby,
    leaveGame,
    removePlayer,
    updateSettings,
} from '#lib/server/game-lifecycle.js'
import { field } from '#lib/server/people-form.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

// The lobby of a game, for players seated in it. Reloading lands here again. A player the host
// removed goes to the join step, which tells them and lets them join again.
export const load: PageServerLoad = async ({ params, locals, url }) => {
    const { user } = await locals.safeGetSession()
    if (!user) error(403, refusalMessage('no_seat'))

    try {
        const lobby = await getLobby(supabaseService(), user.id, params.code)
        return { lobby, joinUrl: new URL(`/join/${lobby.code}`, url.origin).href }
    } catch (caught) {
        if (caught instanceof GameRefusal) {
            if (caught.code === 'removed') {
                redirect(303, `/join/${encodeURIComponent(normaliseGameCode(params.code))}`)
            }
            error(caught.code === 'not_found' ? 404 : 403, refusalMessage(caught.code))
        }
        throw caught
    }
}

/**
 * Runs a lobby command as the signed-in player, turning a refusal into a failed form that
 * carries `echo` back, so the page can show it in the form that was sent.
 */
async function asPlayer<Echo extends object = object>(
    locals: App.Locals,
    command: (userId: string) => Promise<void>,
    echo = {} as Echo,
) {
    const { user } = await locals.safeGetSession()
    if (!user) return fail(403, { ...echo, refusal: 'no_seat' as const })
    try {
        await command(user.id)
    } catch (caught) {
        if (caught instanceof GameRefusal) return fail(400, { ...echo, refusal: caught.code })
        throw caught
    }
}

export const actions: Actions = {
    // Change own name or icon.
    change: async ({ request, locals, params }) => {
        const form = await request.formData()
        const values = { name: field(form, 'name'), icon: field(form, 'icon') }
        return asPlayer(
            locals,
            (userId) => changePlayer(supabaseService(), { userId, code: params.code, ...values }),
            { values },
        )
    },

    // Update settings: the host's whole settings form, sent on every change.
    settings: async ({ request, locals, params }) => {
        const form = await request.formData()
        const settings = {
            // A blank field is 0, refused like any other score outside the limits.
            targetScore: Number(field(form, 'targetScore')),
            exactYear: field(form, 'exactYear') === 'on',
            cardLanguage: field(form, 'cardLanguage'),
        }
        return asPlayer(
            locals,
            (userId) =>
                updateSettings(supabaseService(), { userId, code: params.code, ...settings }),
            { settings: true as const },
        )
    },

    // Leave lobby: back to the home page.
    leave: async ({ locals, params }) => {
        const failed = await asPlayer(locals, (userId) =>
            leaveGame(supabaseService(), { userId, code: params.code }),
        )
        if (failed) return failed
        redirect(303, '/')
    },

    // Host removes from lobby: the player in the form's seat.
    remove: async ({ request, locals, params }) => {
        const seatId = field(await request.formData(), 'seat')
        return asPlayer(locals, (userId) =>
            removePlayer(supabaseService(), { userId, code: params.code, seatId }),
        )
    },
}
