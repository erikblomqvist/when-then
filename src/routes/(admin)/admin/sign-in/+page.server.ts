import { fail, redirect } from '@sveltejs/kit'
import { PUBLIC_SUPABASE_URL } from '$app/env/public'
import { safeAdminPath } from '#lib/server/guard.js'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
    const { user, role } = await locals.getViewer()
    if (user && !user.is_anonymous) {
        redirect(303, role ? safeAdminPath(url.searchParams.get('redirectTo')) : '/admin/no-access')
    }
    return { failed: url.searchParams.get('error') === 'google' }
}

export const actions: Actions = {
    // Starts Google sign-in. Supabase sends the browser back to /admin/auth/callback.
    google: async ({ locals, url }) => {
        const next = safeAdminPath(url.searchParams.get('redirectTo'))
        const callback = new URL('/admin/auth/callback', url.origin)
        callback.searchParams.set('next', next)

        const { data, error } = await locals.supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: callback.href,
                queryParams: { prompt: 'select_account' },
            },
        })
        if (error || !data.url) return fail(502, { failed: true })
        // Supabase's authorize endpoint, which forwards to Google.
        redirect(303, data.url, { external: PUBLIC_SUPABASE_URL ? [PUBLIC_SUPABASE_URL] : false })
    },
}
