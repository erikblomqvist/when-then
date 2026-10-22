import { describe, expect, it } from 'vite-plus/test'
import { acceptsAdminSession, isLocalSupabase } from './sign-in-method'

// An unsigned JWT with these claims: the function only decodes, the hook validates first.
const token = (claims: object) =>
    ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.')

const amr = (...methods: string[]) =>
    token({ amr: methods.map((method) => ({ method, timestamp: 1_700_000_000 })) })

const production = 'https://abcdefgh.supabase.co'
const local = 'http://127.0.0.1:54321'

describe('acceptsAdminSession', () => {
    it('accepts a Google (OAuth) sign-in on any stack', () => {
        expect(acceptsAdminSession(amr('oauth'), production)).toBe(true)
        expect(acceptsAdminSession(amr('oauth'), local)).toBe(true)
    })

    it('accepts OAuth alongside a second factor', () => {
        expect(acceptsAdminSession(amr('totp', 'oauth'), production)).toBe(true)
    })

    it('refuses a password sign-in against a hosted stack', () => {
        expect(acceptsAdminSession(amr('password'), production)).toBe(false)
    })

    it('accepts a password sign-in against the local stack, for e2e', () => {
        expect(acceptsAdminSession(amr('password'), local)).toBe(true)
        expect(acceptsAdminSession(amr('password'), 'http://localhost:54321')).toBe(true)
    })

    it('refuses other methods, even locally', () => {
        expect(acceptsAdminSession(amr('otp'), production)).toBe(false)
        expect(acceptsAdminSession(amr('magiclink'), local)).toBe(false)
        expect(acceptsAdminSession(amr('anonymous'), local)).toBe(false)
    })

    it('refuses a token without an amr claim, or one it cannot read', () => {
        expect(acceptsAdminSession(token({}), production)).toBe(false)
        expect(acceptsAdminSession(token({ amr: 'oauth' }), production)).toBe(false)
        expect(acceptsAdminSession('not-a-jwt', production)).toBe(false)
        expect(acceptsAdminSession('a.%%%.c', local)).toBe(false)
    })

    it('treats a missing Supabase URL as not local', () => {
        expect(acceptsAdminSession(amr('password'), undefined)).toBe(false)
    })
})

describe('isLocalSupabase', () => {
    it('is true only for localhost and 127.0.0.1', () => {
        expect(isLocalSupabase(local)).toBe(true)
        expect(isLocalSupabase('http://localhost:54321')).toBe(true)
        expect(isLocalSupabase(production)).toBe(false)
        expect(isLocalSupabase('https://127.0.0.1.example.com')).toBe(false)
        expect(isLocalSupabase('not a url')).toBe(false)
        expect(isLocalSupabase(undefined)).toBe(false)
    })
})
