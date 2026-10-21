import { requireRole } from '#lib/server/guard.js'
import type { LayoutServerLoad } from './$types'

// hooks.server.ts already turned away anyone without a role; this hands the shell who is in.
export const load: LayoutServerLoad = async (event) => {
    const { user, role } = await requireRole(event, 'editor')
    return { email: user.email ?? '', role }
}
