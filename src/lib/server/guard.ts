import { error, redirect } from '@sveltejs/kit'
import type { User } from '@supabase/supabase-js'
import { hasRole, type AppRole } from './roles'

/** Who is asking: a server-validated user and their role, or nulls when signed out. */
export type Viewer = { user: User; role: AppRole | null } | { user: null; role: null }

/** Someone signed in to the admin with a role. */
export type AdminSession = { user: User; role: AppRole }

// Reachable without a role: they are how you get one, or what you see without one.
const publicPaths = new Set([
    '/admin/sign-in',
    '/admin/auth/callback',
    '/admin/sign-out',
    '/admin/no-access',
])

/** Whether `/admin` lets this path through without a role. Everything else needs `editor`. */
export const isPublicAdminPath = (pathname: string) => publicPaths.has(pathname)

/** Where the sign-in page sends you back to: only paths inside the admin, never elsewhere. */
export function safeAdminPath(path: string | null): string {
    return path && /^\/admin(?:[/?#]|$)/.test(path) ? path : '/admin'
}

/**
 * The shared role guard for every admin route, server action and endpoint. Returns the
 * signed-in user and role, or throws: a redirect to sign-in when signed out (anonymous
 * players count as signed out), a redirect to the no-access page without a role, and 403
 * when the role is not enough (an editor asking for admin-only work).
 *
 *     const { user, role } = await requireRole(event, 'admin')
 *
 * `hooks.server.ts` already requires `editor` for every non-public `/admin` request, so a
 * route only calls this itself for admin-only work, or to get the user.
 */
export async function requireRole(
    event: { url: URL; locals: { getViewer: () => Promise<Viewer> } },
    required: AppRole,
): Promise<AdminSession> {
    const { user, role } = await event.locals.getViewer()
    if (!user || user.is_anonymous) {
        const redirectTo = event.url.pathname + event.url.search
        redirect(303, `/admin/sign-in?${new URLSearchParams({ redirectTo })}`)
    }
    if (!role) redirect(303, '/admin/no-access')
    if (!hasRole(role, required)) error(403, 'Only admins can do this.')
    return { user, role }
}
