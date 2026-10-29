import { defineEnvVars } from '@sveltejs/kit/env'

// Environment variables, typed and documented here, imported from `$app/env/private` and
// `$app/env/public`. This is the single list of names: the same ones are set in the Vercel
// project settings, and locally in `.env.local` with the values `vpr db:start` prints. All
// are optional at start-up so that builds and tests run without a Supabase stack; the code
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
    ANTHROPIC_API_KEY: {
        schema: optional,
        description:
            'Anthropic API key (sk-ant-…) for the admin AI help (translation, date suggestions). Server only; without it the AI buttons answer with a clear error.',
    },
    ANTHROPIC_BASE_URL: {
        schema: optional,
        description:
            'Override for the Anthropic API URL. Leave unset in production; e2e points it at a local stub.',
    },
    WIKIDATA_API_URL: {
        schema: optional,
        description:
            'Override for the Wikidata API (https://www.wikidata.org/w/api.php), used by date suggestions. Leave unset in production; e2e points it at a local stub.',
    },
    SCENARIO_PAGE: {
        schema: (value) => value === 'on',
        description:
            'Set to "on" to open the dev-only /scenario page in a build; `vp dev` always has it. Leave unset in production; e2e sets it.',
    },
    VERCEL_ENV: {
        schema: optional,
        description:
            'Set by Vercel: production, preview or development. PROTOTYPE (#16): opens /prototype/in-game on preview deployments.',
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
