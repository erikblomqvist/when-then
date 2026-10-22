// The phone's own Supabase client, for its session and the nudge channel only: the browser
// never reads or writes tables (ADR 0002). Its session lives in the same auth cookies
// the server's client reads in `hooks.server.ts`, so a server route sees who signed in here.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$app/env/public'
import type { Database } from '#lib/database.types.js'
import { nudgeEvent, nudgeTopic, type Nudge } from '#lib/game/nudge.js'

let client: SupabaseClient<Database> | undefined

function supabaseBrowser() {
    if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
        throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set')
    }
    return (client ??= createBrowserClient<Database>(
        PUBLIC_SUPABASE_URL,
        PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ))
}

/**
 * Makes sure the phone has a session before it creates or joins a game, signing in
 * anonymously when it has none. Seats belong to that user. It signs in from the phone, not
 * the server, because Supabase limits anonymous sign-ins per IP address: from the server,
 * every player would share its address. Throws when sign-in fails.
 */
export async function ensureSession(): Promise<void> {
    const supabase = supabaseBrowser()
    const { data } = await supabase.auth.getUser()
    if (data.user) return
    const { error } = await supabase.auth.signInAnonymously()
    if (error) throw error
}

/**
 * Listens on a game's channel and calls `refetch` for each nudge newer than `shownVersion()`
 * (the version the page shows), and each time the channel connects or reconnects, since
 * nudges sent while it was down are lost. Returns the function that stops listening, for an
 * `$effect` to return.
 */
export function watchGame(
    gameId: string,
    shownVersion: () => number,
    refetch: () => void,
): () => void {
    const supabase = supabaseBrowser()
    const channel = supabase
        .channel(nudgeTopic(gameId))
        .on('broadcast', { event: nudgeEvent }, ({ payload }) => {
            if ((payload as Nudge).version > shownVersion()) refetch()
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') refetch()
        })
    return () => void supabase.removeChannel(channel)
}
