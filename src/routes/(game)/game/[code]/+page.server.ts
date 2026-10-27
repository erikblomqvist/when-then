import { error, fail, redirect } from '@sveltejs/kit'
import { normaliseGameCode } from '#lib/game/game-code.js'
import { refusalMessage } from '#lib/game/refusals.js'
import {
    changePlayer,
    confirmSeating,
    endEarly,
    GameRefusal,
    getGame,
    leaveGame,
    playAgain,
    removeFromGame,
    removePlayer,
    setSeating,
    skipPlayer,
    startGame,
    updateSettings,
} from '#lib/server/game-lifecycle.js'
import { field } from '#lib/server/people-form.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

// A game, for players seated in it: its lobby, then from Start what their seat may see of it,
// and once it has finished, its end screen. Reloading lands here again. A player the host
// removed goes to the join step, which tells them and lets them join again. Once the host plays
// again, every phone with a seat in the rematch goes on to its lobby.
export const load: PageServerLoad = async ({ params, locals, url }) => {
    const { user } = await locals.safeGetSession()
    if (!user) error(403, refusalMessage('no_seat'))

    try {
        const game = await getGame(supabaseService(), user.id, params.code)
        if (game.started && game.rematch) redirect(303, `/game/${game.rematch}`)
        return { game, joinUrl: new URL(`/join/${game.code}`, url.origin).href }
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
 * Runs a game command as the signed-in player, turning a refusal into a failed form that
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
            // One `leftOut` field per country whose country-specific cards are left out.
            leftOutCountries: form
                .getAll('leftOut')
                .filter((value): value is string => typeof value === 'string'),
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

    // Start game: everyone's phone moves to seating.
    start: async ({ locals, params }) =>
        asPlayer(locals, (userId) => startGame(supabaseService(), { userId, code: params.code })),

    // Set seating: the host's whole seating as a JSON list of seats, and the version it was
    // moved from.
    seating: async ({ request, locals, params }) => {
        const form = await request.formData()
        let seating: unknown
        try {
            seating = JSON.parse(field(form, 'seating'))
        } catch {
            seating = null
        }
        const version = Number(field(form, 'version'))
        return asPlayer(
            locals,
            (userId) =>
                setSeating(supabaseService(), { userId, code: params.code, version, seating }),
            { seating: true as const },
        )
    },

    // Confirm seating: anchors are dealt and the first turn starts, from the version the host saw.
    confirm: async ({ request, locals, params }) => {
        const version = Number(field(await request.formData(), 'version'))
        return asPlayer(locals, (userId) =>
            confirmSeating(supabaseService(), { userId, code: params.code, version }),
        )
    },

    // Skip: whatever the player in the form's seat is holding up, from the version the host saw.
    skip: async ({ request, locals, params }) => {
        const form = await request.formData()
        const seatId = field(form, 'seat')
        const version = Number(field(form, 'version'))
        return asPlayer(locals, (userId) =>
            skipPlayer(supabaseService(), { userId, code: params.code, version, seatId }),
        )
    },

    // Remove player: the player in the form's seat leaves the game for good, from the version
    // the host saw.
    removeFromGame: async ({ request, locals, params }) => {
        const form = await request.formData()
        const seatId = field(form, 'seat')
        const version = Number(field(form, 'version'))
        return asPlayer(locals, (userId) =>
            removeFromGame(supabaseService(), { userId, code: params.code, version, seatId }),
        )
    },

    // End early: every phone moves to the end screen, from the version the host saw.
    endEarly: async ({ request, locals, params }) => {
        const version = Number(field(await request.formData(), 'version'))
        return asPlayer(locals, (userId) =>
            endEarly(supabaseService(), { userId, code: params.code, version }),
        )
    },

    // Play again: the host goes to the rematch's lobby, and every other phone follows.
    playAgain: async ({ locals, params }) =>
        asPlayer(locals, async (userId) => {
            const rematch = await playAgain(supabaseService(), { userId, code: params.code })
            redirect(303, `/game/${rematch.code}`)
        }),
}
