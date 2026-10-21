import { defineConfig } from '@playwright/test'

// E2E_PORT lets parallel checkouts run their own preview server side by side.
const port = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
    webServer: { command: `vp build && vp preview --port ${port} --strictPort`, port },
    testMatch: '**/*.e2e.{ts,js}',
})
