import { redirect } from '@sveltejs/kit'
import { safeAdminPath } from '#lib/server/guard.js'
import type { RequestHandler } from './$types'

// Google sends the browser back to Supabase, and Supabase here with a one-time `code` (PKCE).
// Exchanging it sets the session cookies; the code verifier cookie was set at sign-in.
export const GET: RequestHandler = async ({ url, locals }) => {
    const code = url.searchParams.get('code')
    const next = safeAdminPath(url.searchParams.get('next'))
    if (code) {
        const { error } = await locals.supabase.auth.exchangeCodeForSession(code)
        if (!error) redirect(303, next)
    }
    redirect(303, `/admin/sign-in?${new URLSearchParams({ error: 'google', redirectTo: next })}`)
}
