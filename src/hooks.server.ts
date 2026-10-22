import { createServerClient } from '@supabase/ssr'
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public'
import { sequence } from '@sveltejs/kit/hooks'
import type { Handle } from '@sveltejs/kit/hooks'
import { paraglideMiddleware } from '#lib/paraglide/server.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '#lib/database.types.js'
import { isPublicAdminPath, requireRole, type Viewer } from '#lib/server/guard.js'
import { currentRole } from '#lib/server/people.js'
import { supabaseService } from '#lib/server/supabase.js'
import { acceptsAdminSession } from '#lib/server/sign-in-method.js'

// Locale comes from the cookie, then the browser's preferred language, then English
// (strategy in vite.config.ts). There is no locale in the URL, so the request is not rewritten.
const handleParaglide: Handle = ({ event, resolve }) =>
    paraglideMiddleware(event.request, ({ locale }) =>
        resolve(event, {
            transformPageChunk: ({ html }) => html.replace('%lang%', locale),
        }),
    )

// One Supabase client per request, authenticated as the visitor through the auth cookies.
// It is the only way the app talks to Supabase on behalf of a user; the browser never
// reads or writes tables (ADR 0002). The service client with the secret key lives in
// `#lib/server/supabase`.
const handleSupabase: Handle = async ({ event, resolve }) => {
    // Created on first use, so routes that never touch Supabase (and builds and tests
    // without a stack) don't need the variables.
    let client: SupabaseClient<Database> | undefined
    Object.defineProperty(event.locals, 'supabase', {
        enumerable: true,
        get() {
            if (!client) {
                if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
                    throw new Error(
                        'PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set (declared in src/env.ts)',
                    )
                }
                client = createServerClient<Database>(
                    PUBLIC_SUPABASE_URL,
                    PUBLIC_SUPABASE_PUBLISHABLE_KEY,
                    {
                        cookies: {
                            getAll: () => event.cookies.getAll(),
                            setAll: (cookies) => {
                                for (const { name, value, options } of cookies) {
                                    event.cookies.set(name, value, { ...options, path: '/' })
                                }
                            },
                        },
                    },
                )
            }
            return client
        },
    })

    // `getUser()` validates the JWT against Supabase Auth, unlike `getSession()`, which only
    // reads the cookie. Use the session for tokens and the user for identity and claims.
    event.locals.safeGetSession = async () => {
        const {
            data: { session },
        } = await event.locals.supabase.auth.getSession()
        if (!session) return { session: null, user: null }

        const {
            data: { user },
            error,
        } = await event.locals.supabase.auth.getUser()
        if (error || !user) return { session: null, user: null }

        return { session, user }
    }

    // Once per request: the layout, the page and an action may all ask. The role comes from
    // `user_roles`, not the JWT claim, so a change or revoke on the People page takes effect
    // on the person's next request rather than at their next token refresh.
    let viewer: Promise<Viewer> | undefined
    event.locals.getViewer = () =>
        (viewer ??= event.locals.safeGetSession().then(async ({ session, user }) => {
            if (!user) return nulls
            if (user.is_anonymous) return { user, role: null }
            // Only Google sign-ins reach the admin (password ones on the local stack, for
            // e2e): see `#lib/server/sign-in-method`. Any other session is signed out here.
            if (!acceptsAdminSession(session.access_token, PUBLIC_SUPABASE_URL)) {
                await event.locals.supabase.auth.signOut({ scope: 'local' })
                return nulls
            }
            return { user, role: await currentRole(supabaseService(), user.id) }
        }))

    return resolve(event, {
        // Let the browser receive the auth cookie headers.
        filterSerializedResponseHeaders: (name) =>
            name === 'content-range' || name === 'x-supabase-api-version',
    })
}

const nulls = { user: null, role: null } as const

// Every /admin request needs at least `editor`: pages, form actions and endpoints alike
// (layout loads alone would not cover actions). Admin-only work calls `requireRole(event,
// 'admin')` itself. Sign-in, the OAuth callback, sign-out and no-access stay reachable.
const handleAdmin: Handle = async ({ event, resolve }) => {
    const { pathname } = event.url
    if (/^\/admin(?:\/|$)/.test(pathname) && !isPublicAdminPath(pathname)) {
        await requireRole(event, 'editor')
    }
    return resolve(event)
}

export const handle = sequence(handleParaglide, handleSupabase, handleAdmin)
