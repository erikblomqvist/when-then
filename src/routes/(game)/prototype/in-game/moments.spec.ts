import { describe, expect, it } from 'vite-plus/test'
import { buildScenario } from '#lib/game/scenario.js'
import { moments } from './moments'

describe('prototype moments', () => {
    for (const moment of moments) {
        it(moment.key, () => {
            expect(() => buildScenario(moment.recipe)).not.toThrow()
        })
    }
})
