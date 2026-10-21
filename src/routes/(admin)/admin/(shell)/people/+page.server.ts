import { fail, type RequestEvent } from '@sveltejs/kit'
import { requireRole } from '#lib/server/guard.js'
import {
    invitePerson,
    listPeople,
    PeopleError,
    setInviteRole,
    setPersonRole,
} from '#lib/server/people.js'
import { field, readEmail, readRole } from '#lib/server/people-form.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async (event) => {
    const { user } = await requireRole(event, 'admin')
    const { people, invites } = await listPeople()
    return {
        people,
        invites,
        me: user.id,
        // The last admin can't step down; the page says so instead of offering it.
        onlyAdmin: people.filter((person) => person.role === 'admin').length <= 1,
    }
}

// Every action: an admin, the posted form, and the database's refusals as a message.
async function act(
    event: RequestEvent,
    run: (
        actorId: string,
        form: FormData,
    ) => Promise<{ message: string } | ReturnType<typeof fail>>,
) {
    const { user } = await requireRole(event, 'admin')
    const form = await event.request.formData()
    try {
        return await run(user.id, form)
    } catch (error) {
        if (error instanceof PeopleError) return fail(409, { error: error.message })
        throw error
    }
}

// The email shown in messages, as listed on the page.
const shown = (form: FormData) => field(form, 'email')
const userId = (form: FormData) => field(form, 'userId')

const invalid = () => fail(400, { error: 'Enter an email address and choose editor or admin.' })

export const actions: Actions = {
    add: (event) =>
        act(event, async (actorId, form) => {
            const email = readEmail(form)
            const role = readRole(form)
            if (!email || !role) return invalid()
            const outcome = await invitePerson(actorId, email, role)
            return {
                message:
                    outcome === 'granted'
                        ? `${email} is now ${role}.`
                        : `Invited ${email} as ${role}. The role attaches when they first sign in with Google.`,
            }
        }),

    setRole: (event) =>
        act(event, async (actorId, form) => {
            const role = readRole(form)
            if (!role) return invalid()
            await setPersonRole(actorId, userId(form), role)
            return { message: `${shown(form)} is now ${role}.` }
        }),

    revoke: (event) =>
        act(event, async (actorId, form) => {
            await setPersonRole(actorId, userId(form), null)
            return { message: `Revoked the role of ${shown(form)}.` }
        }),

    setInviteRole: (event) =>
        act(event, async (actorId, form) => {
            const email = readEmail(form)
            const role = readRole(form)
            if (!email || !role) return invalid()
            await setInviteRole(actorId, email, role)
            return { message: `${email} will be ${role}.` }
        }),

    withdraw: (event) =>
        act(event, async (actorId, form) => {
            const email = readEmail(form)
            if (!email) return invalid()
            await setInviteRole(actorId, email, null)
            return { message: `Withdrew the invite for ${email}.` }
        }),
}
