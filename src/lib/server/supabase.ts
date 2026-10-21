import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_SECRET_KEY, SUPABASE_URL } from '$app/env/private'
import type { Database } from '#lib/database.types.js'

/** A Supabase client typed with our schema. Repositories (`cards.ts`, …) take one as their
 * first argument: routes pass `supabaseService()`, tests a client for the local stack. */
export type Db = SupabaseClient<Database>

let client: Db | undefined

/**
 * The service client: bypasses RLS with the secret key. Server-only, by file location
 * (`src/lib/server`) and by the private env import. Use it for the game state machine and
 * admin writes, after the route has checked who is asking. Never hand its results to a
 * phone without redacting them for that seat (ADR 0002).
 */
export function supabaseService(): Db {
    if (!client) {
        const url = SUPABASE_URL
        const key = SUPABASE_SECRET_KEY
        if (!url || !key) {
            throw new Error(
                'SUPABASE_URL and SUPABASE_SECRET_KEY must be set (declared in src/env.ts)',
            )
        }
        client = createClient<Database>(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
        })
    }
    return client
}
