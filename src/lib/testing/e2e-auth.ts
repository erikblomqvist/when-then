// Test-only sign-in for Playwright, against the LOCAL Supabase stack. Never imported by the
// app: it lives outside the build, needs the secret key, and refuses any Supabase that is
// not on this machine. The app itself has no test sign-in route; production only knows
// Google.
//
//     import { signInAs } from '#lib/testing/e2e-auth.js'
//     test('…', async ({ page }) => {
//         await signInAs(page, 'editor') // or 'admin', or null for a user without a role
//         await page.goto('/admin')
//     })

import { randomUUID } from 'node:crypto'
import { test, type Page } from '@playwright/test'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '#lib/database.types.js'
import type { AppRole } from '#lib/server/roles.js'
import { isLocalSupabase } from '../server/sign-in-method'

const env = (name: string) => {
    const value = process.env[name]
    if (!value) throw new Error(`${name} must be set for e2e sign-in (.env.local, see README)`)
    return value
}

function localSupabase() {
    const url = env('PUBLIC_SUPABASE_URL')
    // The same rule that lets the admin accept these password sign-ins at all.
    if (!isLocalSupabase(url)) {
        throw new Error(`e2e sign-in only runs against a local Supabase stack, not ${url}`)
    }
    return { url, publishableKey: env('PUBLIC_SUPABASE_PUBLISHABLE_KEY') }
}

/** The service client (secret key) for the local stack, for test setup and checks. */
export function localServiceClient() {
    return createClient<Database>(localSupabase().url, env('SUPABASE_SECRET_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
    })
}

/**
 * Creates a fresh confirmed user (`<role>-<uuid>@example.com`, or `options.email`), gives it
 * `role` (or none), signs it in with a password and puts the auth cookies in the page's
 * browser context, the same cookies the app's `@supabase/ssr` client reads. The user looks
 * like a first Google sign-in (Google in its app metadata), so a pending invite for that
 * email attaches. Returns the user's email and id.
 */
export async function signInAs(page: Page, role: AppRole | null, options: { email?: string } = {}) {
    const { url, publishableKey } = localSupabase()
    const admin = localServiceClient()

    const email = options.email ?? `${role ?? 'no-role'}-${randomUUID()}@example.com`
    const password = randomUUID()
    const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { provider: 'google', providers: ['google'] },
    })
    if (created.error) throw created.error
    const userId = created.data.user.id

    if (role) {
        const { error } = await admin.from('user_roles').insert({ user_id: userId, role })
        if (error) throw error
    }

    // Sign in through the same SSR client the app uses, capturing the cookies it would set.
    const cookies: { name: string; value: string }[] = []
    const client = createServerClient<Database>(url, publishableKey, {
        cookies: {
            getAll: () => cookies,
            setAll: (set) => {
                for (const { name, value } of set) {
                    const existing = cookies.findIndex((cookie) => cookie.name === name)
                    if (existing >= 0) cookies.splice(existing, 1)
                    if (value) cookies.push({ name, value })
                }
            },
        },
    })
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error

    // Playwright's `use.baseURL` (playwright.config.ts), which `page.goto('/…')` resolves against.
    const { baseURL } = test.info().project.use
    if (!baseURL) throw new Error('Set `use.baseURL` in playwright.config.ts')
    await page.context().addCookies(cookies.map((cookie) => ({ ...cookie, url: baseURL })))
    return { email, userId }
}
