import { error } from '@sveltejs/kit'

/**
 * The dev-only `/scenario` page (spec #89) is there under `vp dev`, and in a build only when
 * `SCENARIO_PAGE` is set, as the e2e preview build does. Everywhere else, players included, it's
 * not found.
 */
export function requireScenarioPage({ dev, enabled }: { dev: boolean; enabled: boolean }) {
    if (!dev && !enabled) error(404, 'No such page.')
}
