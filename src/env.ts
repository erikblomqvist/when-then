import { defineEnvVars } from '@sveltejs/kit/env'

// Environment variables, typed and documented here, imported from `$app/env/private` and
// `$app/env/public`. Names match .env.example and the Vercel project settings. All are
// optional at start-up so that builds and tests run without a Supabase stack; the code
// that needs them fails with a clear message instead (see src/lib/server/supabase.ts).

const optional = (value: string | undefined) => value || undefined

export const variables = defineEnvVars({
    SUPABASE_URL: {
        schema: optional,
        description: 'Supabase project URL, for the server.',
    },
    SUPABASE_SECRET_KEY: {
        schema: optional,
        description: 'Supabase secret key (sb_secret_…). Bypasses RLS; server only.',
    },
    PUBLIC_SUPABASE_URL: {
        public: true,
        schema: optional,
        description: 'Supabase project URL, also sent to the browser.',
    },
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
        public: true,
        schema: optional,
        description: 'Supabase publishable key (sb_publishable_…). Safe in the browser.',
    },
})
