import { describe, expect, it } from 'vite-plus/test'
import { hasRole } from './roles'

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
