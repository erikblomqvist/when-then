import { dev } from '$app/env'
import { SCENARIO_PAGE, VERCEL_ENV } from '$app/env/private'
import { requireScenarioPage } from '#lib/server/scenario-page.js'
import type { PageServerLoad } from './$types'

// PROTOTYPE (#100), throwaway: under `vp dev`, on Vercel preview deployments, and wherever the
// /scenario page is open. Not found in production.
export const load: PageServerLoad = () => {
    requireScenarioPage({ dev, enabled: SCENARIO_PAGE || VERCEL_ENV === 'preview' })
}
