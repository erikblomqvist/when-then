// People and their admin roles (#45), over the SQL functions in
// `supabase/migrations/20261023004500_people_and_role_invites.sql`. Those functions check the
// actor is an admin, keep at least one admin, and audit every change; this module only
// passes the actor along and turns their refusals into errors the People page can show.

import type { PostgrestError } from '@supabase/supabase-js'
import type { AppRole } from './roles'
import { supabaseService } from './supabase'

export type Person = { userId: string; email: string; role: AppRole }
export type Invite = { email: string; role: AppRole }

/** Why the database refused a role change, in words for the People page. */
export class PeopleError extends Error {}

const refusals: Record<string, string> = {
    last_admin: 'There must always be at least one admin. Make someone else an admin first.',
    not_admin: 'Only admins can manage people.',
}

function check(error: PostgrestError | null) {
    if (!error) return
    const refusal = refusals[error.message]
    if (refusal) throw new PeopleError(refusal)
    throw error
}

/**
 * The role someone has right now, read from `user_roles` on each request rather than from
 * the JWT, so a change or revoke takes effect on their next request, not their next token.
 */
export async function currentRole(userId: string): Promise<AppRole | null> {
    const { data, error } = await supabaseService()
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()
    if (error) throw error
    return data?.role ?? null
}

/** Everyone with a role, and the invites not yet taken up, each sorted by email. */
export async function listPeople(): Promise<{ people: Person[]; invites: Invite[] }> {
    const service = supabaseService()
    const [people, invites] = await Promise.all([
        service.rpc('list_people'),
        service.from('role_invites').select('email, role').order('email'),
    ])
    if (people.error) throw people.error
    if (invites.error) throw invites.error
    return {
        people: people.data.map(({ user_id, email, role }) => ({ userId: user_id, email, role })),
        invites: invites.data,
    }
}

/**
 * Gives `email` a role: at once if they have signed in with Google before, otherwise as an
 * invite that attaches at their first Google sign-in.
 */
export async function invitePerson(
    actorId: string,
    email: string,
    role: AppRole,
): Promise<'granted' | 'invited'> {
    const { data, error } = await supabaseService().rpc('invite_person', {
        actor: actorId,
        email,
        role,
    })
    check(error)
    return data === 'granted' ? 'granted' : 'invited'
}

/** Changes someone's role, or revokes it with `null`. */
export async function setPersonRole(actorId: string, personId: string, role: AppRole | null) {
    const { error } = await supabaseService().rpc('set_person_role', {
        actor: actorId,
        person_id: personId,
        ...(role && { new_role: role }),
    })
    check(error)
}

/** Changes a pending invite's role, or withdraws it with `null`. */
export async function setInviteRole(actorId: string, email: string, role: AppRole | null) {
    const { error } = await supabaseService().rpc('set_invite_role', {
        actor: actorId,
        invite_email: email,
        ...(role && { new_role: role }),
    })
    check(error)
}
