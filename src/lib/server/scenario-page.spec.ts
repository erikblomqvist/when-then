import { isHttpError } from '@sveltejs/kit'
import { describe, expect, it } from 'vite-plus/test'
import { requireScenarioPage } from './scenario-page'

const thrown = (run: () => void) => {
    try {
        run()
    } catch (error) {
        return error
    }
    return undefined
}

describe('requireScenarioPage', () => {
    it('opens the page under vp dev', () => {
        expect(thrown(() => requireScenarioPage({ dev: true, enabled: false }))).toBeUndefined()
    })

    it('opens the page in a build that sets SCENARIO_PAGE, as e2e does', () => {
        expect(thrown(() => requireScenarioPage({ dev: false, enabled: true }))).toBeUndefined()
    })

    it('is not found anywhere else', () => {
        const error = thrown(() => requireScenarioPage({ dev: false, enabled: false }))
        expect(isHttpError(error) && error.status).toBe(404)
    })
})
