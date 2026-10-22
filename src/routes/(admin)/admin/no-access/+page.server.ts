import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// For someone signed in with Google but without a role. Everyone else belongs elsewhere.
export const load: PageServerLoad = async ({ locals }) => {
    const { user, role } = await locals.getViewer()
    if (!user || user.is_anonymous) redirect(303, '/admin/sign-in')
    if (role) redirect(303, '/admin')
    return { email: user.email ?? '' }
}
