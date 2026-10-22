import { describe, expect, it } from 'vite-plus/test'
import { describeError } from './describe-error'

describe('describeError', () => {
    it('keeps the stack of an Error', () => {
        const error = new Error('boom')
        expect(describeError(error)).toBe(error.stack)
    })

    it('spells out a plain error object, such as a Supabase one, instead of [object Object]', () => {
        const error = { message: 'Invalid API key', code: '401', details: null, hint: 'Check it' }
        expect(describeError(error)).toBe(
            '{"message":"Invalid API key","code":"401","details":null,"hint":"Check it"}',
        )
    })

    it('falls back to String for values JSON cannot hold', () => {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        expect(describeError(circular)).toBe('[object Object]')
        expect(describeError('plain text')).toBe('"plain text"')
        expect(describeError(undefined)).toBe('undefined')
    })
})
