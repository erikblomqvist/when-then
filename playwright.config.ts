import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The e2e sign-in helper (src/lib/testing/e2e-auth.ts) talks to the local Supabase stack with
// the same variables as the app. CI writes this file after `supabase start`.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// E2E_PORT lets parallel checkouts run their own preview server side by side.
const port = Number(process.env.E2E_PORT ?? 4173)
// The Anthropic and Wikidata API stand-in (src/lib/testing/anthropic-stub.ts): AI features
// never reach the real services from tests.
const anthropicStubPort = port + 1000

export default defineConfig({
    // Stops the run early when the local database can't give a true result (missing
    // migrations, too many users left by earlier runs).
    globalSetup: './src/lib/testing/e2e-database-check.ts',
    webServer: [
        {
            command: `node src/lib/testing/anthropic-stub.ts ${anthropicStubPort}`,
            url: `http://127.0.0.1:${anthropicStubPort}`,
        },
        {
            command: `vp build && vp preview --port ${port} --strictPort`,
            port,
            env: {
                ANTHROPIC_API_KEY: 'e2e-stub-key',
                ANTHROPIC_BASE_URL: `http://127.0.0.1:${anthropicStubPort}`,
                WIKIDATA_API_URL: `http://127.0.0.1:${anthropicStubPort}/w/api.php`,
                // The dev-only /scenario page, in this preview build.
                SCENARIO_PAGE: 'on',
            },
        },
    ],
    use: { baseURL: `http://localhost:${port}` },
    testMatch: '**/*.e2e.{ts,js}',
})
