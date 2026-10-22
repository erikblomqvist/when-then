import { describe, expect, it } from 'vite-plus/test'
import { gameCodeAlphabet, isGameCode, normaliseGameCode, randomGameCode } from './game-code'

describe('gameCodeAlphabet', () => {
    it('is the upper-case letters without the look-alikes I and O', () => {
        expect(gameCodeAlphabet).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ')
    })
})

describe('randomGameCode', () => {
    it('makes four characters from the alphabet', () => {
        for (let i = 0; i < 200; i++) {
            expect(randomGameCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/)
        }
    })

    it('can reach every character of the alphabet', () => {
        const first = (random: number) => randomGameCode(() => random)[0]
        expect(first(0)).toBe('A')
        expect(first(0.999)).toBe('Z')
    })
})

describe('normaliseGameCode', () => {
    it('upper-cases and trims what the player typed', () => {
        expect(normaliseGameCode(' kxrm ')).toBe('KXRM')
        expect(normaliseGameCode('KxRm')).toBe('KXRM')
    })
})

describe('isGameCode', () => {
    it('accepts four letters from the alphabet', () => {
        expect(isGameCode('KXRM')).toBe(true)
    })

    it('refuses look-alikes, digits, lower case and other lengths', () => {
        for (const code of ['KXRI', 'KXRO', 'KXR0', 'KXR1', 'kxrm', 'KXR', 'KXRMS', '']) {
            expect(isGameCode(code), code).toBe(false)
        }
    })
})
