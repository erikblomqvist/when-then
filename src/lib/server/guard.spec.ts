import { isHttpError, isRedirect } from '@sveltejs/kit'
import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vite-plus/test'
import { isPublicAdminPath, requireRole, safeAdminPath, type Viewer } from './guard'

const user = (overrides: Partial<User> = {}) =>
    ({ id: 'u1', email: 'ada@example.com', is_anonymous: false, ...overrides }) as User

const event = (viewer: Viewer, path = '/admin/cards?status=draft') => ({
    url: new URL(`http://localhost${path}`),
    locals: { getViewer: async () => viewer },
})

const thrown = async (promise: Promise<unknown>) => {
    try {
        await promise
    } catch (error) {
        return error
    }
    throw new Error('expected requireRole to throw')
}

describe('requireRole', () => {
    it('sends a signed-out visitor to sign in, remembering where they were going', async () => {
        const error = await thrown(requireRole(event({ user: null, role: null }), 'editor'))
        expect(isRedirect(error) && error.status).toBe(303)
        expect(isRedirect(error) && error.location).toBe(
            '/admin/sign-in?redirectTo=%2Fadmin%2Fcards%3Fstatus%3Ddraft',
        )
    })

    it('treats an anonymous player as signed out', async () => {
        const error = await thrown(
            requireRole(event({ user: user({ is_anonymous: true }), role: null }), 'editor'),
        )
        expect(isRedirect(error) && error.location).toMatch(/^\/admin\/sign-in\?/)
    })

    it('sends someone signed in without a role to the no-access page', async () => {
        const error = await thrown(requireRole(event({ user: user(), role: null }), 'editor'))
        expect(isRedirect(error) && error.location).toBe('/admin/no-access')
    })

    it('refuses an editor admin-only work with 403', async () => {
        const error = await thrown(requireRole(event({ user: user(), role: 'editor' }), 'admin'))
        expect(isHttpError(error) && error.status).toBe(403)
    })

    it('returns the user and role when the role is enough', async () => {
        const ada = user()
        await expect(requireRole(event({ user: ada, role: 'editor' }), 'editor')).resolves.toEqual({
            user: ada,
            role: 'editor',
        })
        await expect(requireRole(event({ user: ada, role: 'admin' }), 'editor')).resolves.toEqual({
            user: ada,
            role: 'admin',
        })
        await expect(requireRole(event({ user: ada, role: 'admin' }), 'admin')).resolves.toEqual({
            user: ada,
            role: 'admin',
        })
    })
})

describe('isPublicAdminPath', () => {
    it('lets anyone reach sign-in, the OAuth callback, sign-out and no-access', () => {
        expect(isPublicAdminPath('/admin/sign-in')).toBe(true)
        expect(isPublicAdminPath('/admin/auth/callback')).toBe(true)
        expect(isPublicAdminPath('/admin/sign-out')).toBe(true)
        expect(isPublicAdminPath('/admin/no-access')).toBe(true)
    })

    it('guards everything else under /admin', () => {
        expect(isPublicAdminPath('/admin')).toBe(false)
        expect(isPublicAdminPath('/admin/cards')).toBe(false)
        expect(isPublicAdminPath('/admin/sign-in-elsewhere')).toBe(false)
        expect(isPublicAdminPath('/admin/sign-in/../people')).toBe(false)
    })
})

describe('safeAdminPath', () => {
    it('keeps a path inside the admin', () => {
        expect(safeAdminPath('/admin/cards?status=draft')).toBe('/admin/cards?status=draft')
        expect(safeAdminPath('/admin')).toBe('/admin')
    })

    it('falls back to /admin for anything else, so sign-in is no open redirect', () => {
        expect(safeAdminPath(null)).toBe('/admin')
        expect(safeAdminPath('https://evil.example.com/admin')).toBe('/admin')
        expect(safeAdminPath('//evil.example.com/admin')).toBe('/admin')
        expect(safeAdminPath('/administrator')).toBe('/admin')
        expect(safeAdminPath('/')).toBe('/admin')
    })
})
