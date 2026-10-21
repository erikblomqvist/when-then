import { describe, expect, it } from 'vite-plus/test'
import { hasRole, roleFromAccessToken } from './roles'

// A JWT as Supabase issues it: header.payload.signature, base64url without padding.
const jwt = (payload: object) =>
    [
        Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
        Buffer.from(JSON.stringify(payload)).toString('base64url'),
        'signature',
    ].join('.')

describe('roleFromAccessToken', () => {
    it('reads the user_role claim the access-token hook adds', () => {
        expect(roleFromAccessToken(jwt({ sub: 'u1', user_role: 'editor' }))).toBe('editor')
        expect(roleFromAccessToken(jwt({ sub: 'u1', user_role: 'admin' }))).toBe('admin')
    })

    it('gives no role when the claim is null, missing or not a known role', () => {
        expect(roleFromAccessToken(jwt({ sub: 'u1', user_role: null }))).toBeNull()
        expect(roleFromAccessToken(jwt({ sub: 'u1' }))).toBeNull()
        expect(roleFromAccessToken(jwt({ sub: 'u1', user_role: 'owner' }))).toBeNull()
    })

    it('gives no role for a token it cannot decode', () => {
        expect(roleFromAccessToken('not-a-jwt')).toBeNull()
        expect(roleFromAccessToken('a.%%%.c')).toBeNull()
    })
})

describe('hasRole', () => {
    it('lets an admin do everything an editor can', () => {
        expect(hasRole('admin', 'editor')).toBe(true)
        expect(hasRole('admin', 'admin')).toBe(true)
        expect(hasRole('editor', 'editor')).toBe(true)
    })

    it('refuses editors admin-only work, and anyone without a role', () => {
        expect(hasRole('editor', 'admin')).toBe(false)
        expect(hasRole(null, 'editor')).toBe(false)
    })
})
