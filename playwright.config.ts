import { existsSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

// The e2e sign-in helper (src/lib/testing/e2e-auth.ts) talks to the local Supabase stack with
// the same variables as the app. CI writes this file after `supabase start`.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

// E2E_PORT lets parallel checkouts run their own preview server side by side.
const port = Number(process.env.E2E_PORT ?? 4173)
// The Anthropic API stand-in (src/lib/testing/anthropic-stub.ts): AI features never reach
// the real API from tests.
const anthropicStubPort = port + 1000

export default defineConfig({
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
            },
        },
    ],
    use: { baseURL: `http://localhost:${port}` },
    testMatch: '**/*.e2e.{ts,js}',
})
