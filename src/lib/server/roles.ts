import type { Database } from '#lib/database.types.js'

/** An admin role from `public.user_roles`. Players have none. */
export type AppRole = Database['public']['Enums']['app_role']

// Each role includes everything the roles after it can do.
const ranked: readonly AppRole[] = ['admin', 'editor']

/** Whether `role` may do what `required` allows: an admin can do all an editor can. */
export function hasRole(role: AppRole | null, required: AppRole): boolean {
    return role !== null && ranked.indexOf(role) <= ranked.indexOf(required)
}
