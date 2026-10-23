import { describe, expect, it } from 'vite-plus/test'
import { isTargetScore } from './settings'

describe('isTargetScore', () => {
    it('accepts whole numbers from 3 to 30', () => {
        expect(isTargetScore(3)).toBe(true)
        expect(isTargetScore(10)).toBe(true)
        expect(isTargetScore(30)).toBe(true)
    })

    it('refuses numbers outside 3 to 30', () => {
        expect(isTargetScore(2)).toBe(false)
        expect(isTargetScore(31)).toBe(false)
        expect(isTargetScore(0)).toBe(false)
        expect(isTargetScore(-10)).toBe(false)
    })

    it('refuses fractions and what a blank or garbled field parses to', () => {
        expect(isTargetScore(10.5)).toBe(false)
        expect(isTargetScore(Number.NaN)).toBe(false)
        expect(isTargetScore(Number.POSITIVE_INFINITY)).toBe(false)
    })
})
