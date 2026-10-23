import { redirect } from '@sveltejs/kit'
import { normaliseGameCode } from '#lib/game/game-code.js'
import type { RequestHandler } from './$types'

// The home page's code entry posts here (a plain GET form, so it works before hydration):
// on to the join step for that code, in any case. No code goes back home.
export const GET: RequestHandler = ({ url }) => {
    const code = normaliseGameCode(url.searchParams.get('code') ?? '')
    redirect(303, code ? `/join/${encodeURIComponent(code)}` : '/')
}
