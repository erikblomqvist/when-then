import { describe, expect, it } from 'vite-plus/test'
import { serviceWorkerHandles } from './offline'

describe('serviceWorkerHandles', () => {
    it('handles the game, so its pages work offline', () => {
        expect(serviceWorkerHandles('/')).toBe(true)
        expect(serviceWorkerHandles('/join/ABCD')).toBe(true)
        expect(serviceWorkerHandles('/administrative-history')).toBe(true)
    })

    it('leaves the admin to the network, so signed-in pages are never cached', () => {
        expect(serviceWorkerHandles('/admin')).toBe(false)
        expect(serviceWorkerHandles('/admin/')).toBe(false)
        expect(serviceWorkerHandles('/admin/cards')).toBe(false)
        expect(serviceWorkerHandles('/admin/auth/callback')).toBe(false)
    })
})
