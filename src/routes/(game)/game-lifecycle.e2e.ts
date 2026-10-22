// The game lifecycle, played through on phones (spec #59, seam 3): one flow that grows with
// each lifecycle ticket. So far: the host creates a game and lands in its lobby.

import { expect, test } from '@playwright/test'
import { localServiceClient } from '../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated } from '../../lib/testing/e2e-hydration'
import { qrPath } from '../../lib/ui/qr-path'

const db = localServiceClient()

test('the host creates a game and lands in its lobby', async ({ browser, baseURL }) => {
    const hostContext = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
    })
    const host = await hostContext.newPage()

    // Home → the name-and-icon step.
    await gotoHydrated(host, '/')
    await host.getByRole('link', { name: 'Create game' }).click()
    await expect(host.getByRole('heading', { name: 'New game' })).toBeVisible()

    await host.getByLabel('Your name').fill('  Astrid ')
    await host.getByRole('radio', { name: 'Cat' }).check()
    await host.getByRole('button', { name: 'Create game' }).click()

    // The lobby of a new game, under its code.
    await host.waitForURL(/\/game\/[A-HJ-NP-Z]{4}$/)
    const code = new URL(host.url()).pathname.split('/').pop()!
    await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible()
    await expect(host.getByText(`Game code: ${code}`)).toBeAttached()

    const players = host.locator('.ui-player-row')
    await expect(players).toHaveCount(1)
    await expect(players.first()).toContainText('Astrid')
    await expect(players.first()).toContainText('Host')

    // The phone signed in anonymously, and the host's seat belongs to that user.
    const { data: seats } = await db
        .from('game_players')
        .select('user_id, is_host, games!inner(code)')
        .eq('games.code', code)
        .is('games.ended_at', null)
    expect(seats).toHaveLength(1)
    const { data: seatUser } = await db.auth.admin.getUserById(seats![0].user_id)
    expect(seatUser.user?.is_anonymous).toBe(true)

    // Sharing: Copy link copies the absolute join URL, and the QR code encodes it.
    const joinUrl = new URL(`/join/${code}`, baseURL).href
    await host.getByRole('button', { name: 'Copy link' }).click()
    await expect(host.getByRole('button', { name: 'Link copied' })).toBeVisible()
    expect(await host.evaluate(() => navigator.clipboard.readText())).toBe(joinUrl)
    const qr = host.getByRole('img', { name: 'QR code to join the game' })
    await expect(qr.locator('path')).toHaveAttribute('d', qrPath(joinUrl).path)

    // Reloading keeps the host in the lobby.
    await reloadHydrated(host)
    await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible()
    await expect(players.first()).toContainText('Astrid')

    // Someone without a seat can't open it.
    const strangerContext = await browser.newContext()
    const stranger = await strangerContext.newPage()
    const response = await stranger.goto(`/game/${code}`)
    expect(response?.status()).toBe(403)
    await expect(stranger.getByText('Astrid')).toHaveCount(0)

    await Promise.all([hostContext.close(), strangerContext.close()])
})
