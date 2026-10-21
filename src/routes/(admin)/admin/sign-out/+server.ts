import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// A POST from the shell's or the no-access page's sign-out button.
export const POST: RequestHandler = async ({ locals }) => {
    await locals.supabase.auth.signOut()
    redirect(303, '/admin/sign-in')
}
