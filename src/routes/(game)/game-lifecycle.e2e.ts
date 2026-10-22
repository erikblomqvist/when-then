// The game lifecycle, played through on phones (spec #59, seam 3): one flow that grows with
// each lifecycle ticket. So far: the host creates a game and lands in its lobby, one player
// joins by link and another by the code typed on the home page, and every lobby updates live.

import { expect, test } from '@playwright/test'
import { localServiceClient } from '../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated, waitForHydration } from '../../lib/testing/e2e-hydration'
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

    // A second player opens the join link (the QR code holds the same URL).
    const boContext = await browser.newContext()
    const bo = await boContext.newPage()
    await gotoHydrated(bo, joinUrl)
    await expect(bo.getByRole('heading', { name: `Join game ${code}` })).toBeVisible()
    // The host's icon is taken, and so is their name, ignoring case.
    await expect(bo.getByRole('radio', { name: 'Cat' })).toBeDisabled()
    const nameTaken = bo.getByText('Someone in this game already has that name.')
    await bo.getByLabel('Your name').fill('ASTRID')
    await expect(nameTaken).toBeVisible()
    await expect(bo.getByRole('button', { name: 'Join game' })).toBeDisabled()
    await bo.getByLabel('Your name').fill('Bo')
    await expect(nameTaken).toHaveCount(0)
    await bo.getByRole('radio', { name: 'Dog' }).check()
    await bo.getByRole('button', { name: 'Join game' }).click()

    await bo.waitForURL(new RegExp(`/game/${code}$`))
    const boPlayers = bo.locator('.ui-player-row')
    await expect(boPlayers).toHaveCount(2)
    await expect(boPlayers.nth(1)).toContainText('Bo')
    await expect(boPlayers.nth(1)).toContainText('You')
    // The host's lobby shows Bo without a reload.
    await expect(players).toHaveCount(2)
    await expect(players.nth(1)).toContainText('Bo')

    // A third player types the code on the home page, in lower case.
    const caroContext = await browser.newContext()
    const caro = await caroContext.newPage()
    await gotoHydrated(caro, '/')
    await caro.getByLabel('Game code').fill(code.toLowerCase())
    await caro.getByRole('button', { name: 'Join game' }).click()
    await caro.waitForURL(new RegExp(`/join/${code}$`))
    await waitForHydration(caro)
    await expect(caro.getByRole('radio', { name: 'Dog' })).toBeDisabled()
    await caro.getByLabel('Your name').fill('Caro')
    await caro.getByRole('radio', { name: 'Fish' }).check()
    await caro.getByRole('button', { name: 'Join game' }).click()

    await caro.waitForURL(new RegExp(`/game/${code}$`))
    await expect(caro.locator('.ui-player-row')).toHaveCount(3)
    await expect(players).toHaveCount(3)
    await expect(boPlayers).toHaveCount(3)
    await expect(boPlayers.nth(2)).toContainText('Caro')

    // Someone without a seat can't open it.
    const strangerContext = await browser.newContext()
    const stranger = await strangerContext.newPage()
    const response = await stranger.goto(`/game/${code}`)
    expect(response?.status()).toBe(403)
    await expect(stranger.getByText('Astrid')).toHaveCount(0)

    await Promise.all(
        [hostContext, boContext, caroContext, strangerContext].map((context) => context.close()),
    )
})
