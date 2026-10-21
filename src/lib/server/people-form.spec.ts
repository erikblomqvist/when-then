import { describe, expect, it } from 'vite-plus/test'
import { readEmail, readRole } from './people-form'

const form = (fields: Record<string, string>) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(fields)) data.set(name, value)
    return data
}

describe('readEmail', () => {
    it('trims and lower-cases the email, as invites are matched', () => {
        expect(readEmail(form({ email: '  Ada.L@Example.COM ' }))).toBe('ada.l@example.com')
    })

    it('gives null for a missing or malformed email', () => {
        expect(readEmail(form({}))).toBeNull()
        expect(readEmail(form({ email: '' }))).toBeNull()
        expect(readEmail(form({ email: 'ada' }))).toBeNull()
        expect(readEmail(form({ email: 'ada@' }))).toBeNull()
        expect(readEmail(form({ email: 'a da@example.com' }))).toBeNull()
    })
})

describe('readRole', () => {
    it('reads editor or admin', () => {
        expect(readRole(form({ role: 'editor' }))).toBe('editor')
        expect(readRole(form({ role: 'admin' }))).toBe('admin')
    })

    it('gives null for anything else', () => {
        expect(readRole(form({}))).toBeNull()
        expect(readRole(form({ role: 'owner' }))).toBeNull()
    })
})
