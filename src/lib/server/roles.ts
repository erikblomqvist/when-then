import type { Database } from '#lib/database.types.js'

/** An admin role from `public.user_roles`. Players have none. */
export type AppRole = Database['public']['Enums']['app_role']

// Each role includes everything the roles after it can do.
const ranked: readonly AppRole[] = ['admin', 'editor']

const isAppRole = (value: unknown): value is AppRole => ranked.includes(value as AppRole)

/**
 * The `user_role` claim the Custom Access Token hook puts in the JWT, or null without one.
 * Only decodes: verify the token first (`auth.getUser()` does, in `hooks.server.ts`).
 * A role granted or revoked shows up here when the token is next refreshed (within an hour).
 */
export function roleFromAccessToken(token: string): AppRole | null {
    const payload = token.split('.')[1]
    if (!payload) return null
    try {
        const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        const role =
            claims && typeof claims === 'object' && 'user_role' in claims ? claims.user_role : null
        return isAppRole(role) ? role : null
    } catch {
        return null
    }
}

/** Whether `role` may do what `required` allows: an admin can do all an editor can. */
export function hasRole(role: AppRole | null, required: AppRole): boolean {
    return role !== null && ranked.indexOf(role) <= ranked.indexOf(required)
}
