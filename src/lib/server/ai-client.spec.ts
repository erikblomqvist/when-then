import { describe, expect, it, vi } from 'vite-plus/test'
import { AiUnavailableError } from './ai'
import { aiClient } from './ai-client'

vi.mock('$app/env/private', () => ({ ANTHROPIC_API_KEY: undefined, ANTHROPIC_BASE_URL: undefined }))

describe('aiClient', () => {
    it('without a key, refuses with an error that names the variable', () => {
        expect(() => aiClient()).toThrow(AiUnavailableError)
        expect(() => aiClient()).toThrow(/ANTHROPIC_API_KEY is not set/)
    })
})
