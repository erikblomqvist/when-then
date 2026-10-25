import { dev } from '$app/env'
import { SCENARIO_PAGE } from '$app/env/private'
import {
    buildScenario,
    recipeFromParams,
    RecipeParamError,
    ScenarioError,
} from '#lib/game/scenario.js'
import { requireScenarioPage } from '#lib/server/scenario-page.js'
import type { PageServerLoad } from './$types'

// A moment in a game from its recipe in the URL (spec #89), seen from the viewing seat: only
// that seat's view and who is absent reach the page, as on a real phone. A recipe the rules
// can't reach, or a malformed parameter, shows its error instead.
export const load: PageServerLoad = ({ url }) => {
    requireScenarioPage({ dev, enabled: SCENARIO_PAGE })
    try {
        const { view, absent } = buildScenario(recipeFromParams(url.searchParams))
        return { scenario: { view, absent }, error: null }
    } catch (caught) {
        if (caught instanceof ScenarioError || caught instanceof RecipeParamError) {
            return { scenario: null, error: caught.message }
        }
        throw caught
    }
}
