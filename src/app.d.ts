// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from '#lib/database.types.js'
import type { Viewer } from '#lib/server/guard.js'

declare global {
    namespace App {
        // interface Error {}
        interface Locals {
            /** Supabase client acting as the visitor, from the auth cookies. Set in `hooks.server.ts`. */
            supabase: SupabaseClient<Database>
            /** Session plus a server-validated user, or nulls when signed out. */
            safeGetSession: () => Promise<
                { session: Session; user: User } | { session: null; user: null }
            >
            /** The validated user and their role from the JWT `user_role` claim, memoised per
             * request. Gate admin work with `requireRole` from `#lib/server/guard.js`. */
            getViewer: () => Promise<Viewer>
        }
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {}
