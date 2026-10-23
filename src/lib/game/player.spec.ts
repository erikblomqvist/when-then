import { describe, expect, it } from 'vite-plus/test'
import { isNameTaken, isPlayerIcon, normalisePlayerName, playerIcons } from './player'

describe('normalisePlayerName', () => {
    it('trims the name', () => {
        expect(normalisePlayerName('  Astrid ')).toBe('Astrid')
    })

    it('accepts 1 to 16 characters', () => {
        expect(normalisePlayerName('A')).toBe('A')
        expect(normalisePlayerName('Sixteen chars ok')).toBe('Sixteen chars ok')
    })

    it('counts characters, not UTF-16 units', () => {
        expect(normalisePlayerName('🦊'.repeat(16))).toBe('🦊'.repeat(16))
    })

    it('refuses an empty or blank name', () => {
        expect(normalisePlayerName('')).toBeUndefined()
        expect(normalisePlayerName('   ')).toBeUndefined()
    })

    it('refuses more than 16 characters', () => {
        expect(normalisePlayerName('Seventeen chars!!')).toBeUndefined()
    })
})

describe('isNameTaken', () => {
    it('matches a taken name ignoring case and surrounding spaces', () => {
        expect(isNameTaken(' astrid ', ['Astrid', 'Bo'])).toBe(true)
        expect(isNameTaken('BO', ['Astrid', 'Bo'])).toBe(true)
    })

    it('lets a free name through', () => {
        expect(isNameTaken('Astri', ['Astrid', 'Bo'])).toBe(false)
        expect(isNameTaken('', ['Astrid'])).toBe(false)
    })
})

describe('playerIcons', () => {
    it('is a curated set of about 24 distinct icons', () => {
        expect(playerIcons).toHaveLength(24)
        expect(new Set(playerIcons).size).toBe(playerIcons.length)
    })

    it('recognises its own icons only', () => {
        expect(isPlayerIcon('cat')).toBe(true)
        expect(isPlayerIcon('skull')).toBe(false)
        expect(isPlayerIcon(undefined)).toBe(false)
    })
})
