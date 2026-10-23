// The game lifecycle, played through on phones (spec #59, seam 3): one flow that grows with
// each lifecycle ticket. So far: the host creates a game and lands in its lobby, one player
// joins by link and another by the code typed on the home page, and every lobby updates live.
// The host changes the settings, which the others see live. A player finds their seat again from
// the home page, the join link and a switch of app language, with no install prompt meanwhile.
// In the lobby a player changes their name and icon, another leaves, and the host removes a
// player, who joins again.

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

    // With nothing changing, the lobby stays quiet: refetches follow nudges, not each other.
    const refetches: string[] = []
    host.on('request', (request) => {
        if (request.url().includes('__data.json')) refetches.push(request.url())
    })
    await host.waitForTimeout(1500)
    expect(refetches).toEqual([])

    // Someone without a seat can't open it.
    const strangerContext = await browser.newContext()
    const stranger = await strangerContext.newPage()
    const response = await stranger.goto(`/game/${code}`)
    expect(response?.status()).toBe(403)
    await expect(stranger.getByText('Astrid')).toHaveCount(0)

    // The host adjusts the settings; the others see them live and can't change them. The card
    // language started as the host's app language.
    const hostLanguage = host.getByRole('tablist', { name: 'Card language' })
    await expect(hostLanguage.getByRole('tab', { name: 'English' })).toHaveAttribute(
        'aria-selected',
        'true',
    )
    const boSetting = (name: string) =>
        bo.locator('.settings-list > div').filter({ has: bo.locator('dt', { hasText: name }) })
    await expect(boSetting('Target score')).toContainText('10')
    await expect(bo.getByLabel('Target score')).toHaveCount(0)
    await expect(bo.getByRole('tab')).toHaveCount(0)
    await expect(bo.getByText('Only the host can change these.')).toBeVisible()

    await host.getByLabel('Target score').fill('15')
    await host.getByLabel('Target score').press('Tab')
    await expect(boSetting('Target score')).toContainText('15')
    await host
        .getByRole('tablist', { name: 'Exact-year house rule' })
        .getByRole('tab', { name: 'On' })
        .click()
    await expect(boSetting('Exact-year house rule')).toContainText('On')
    await hostLanguage.getByRole('tab', { name: 'Swedish' }).click()
    await expect(boSetting('Card language')).toContainText('Swedish')
    await expect(caro.locator('.settings-list')).toContainText('15')
    // A target score outside 3–30 is refused, and the field goes back to the saved one.
    await host.getByLabel('Target score').fill('31')
    await host.getByLabel('Target score').press('Tab')
    await expect(host.getByText('Pick a target score from 3 to 30.')).toBeVisible()
    await expect(host.getByLabel('Target score')).toHaveValue('15')
    await expect(boSetting('Target score')).toContainText('15')

    // The settings stay after a reload.
    await reloadHydrated(host)
    await expect(host.getByLabel('Target score')).toHaveValue('15')
    await expect(hostLanguage.getByRole('tab', { name: 'Swedish' })).toHaveAttribute(
        'aria-selected',
        'true',
    )

    // Find my seat: from the home page Bo gets back to the game, and the join link goes straight
    // to the seat. A phone without a seat sees no way back.
    await gotoHydrated(bo, '/')
    await bo.getByRole('link', { name: `Back to game ${code}` }).click()
    await bo.waitForURL(new RegExp(`/game/${code}$`))
    await gotoHydrated(bo, joinUrl)
    expect(new URL(bo.url()).pathname).toBe(`/game/${code}`)
    await expect(boPlayers.nth(1)).toContainText('You')
    await gotoHydrated(stranger, '/')
    await expect(stranger.getByRole('link', { name: /^Back to game/ })).toHaveCount(0)

    // No install prompt while the phone has a seat; without one the browser may offer it.
    const installPromptHeldBack = (page: typeof bo) =>
        page.evaluate(() => {
            const prompt = new Event('beforeinstallprompt', { cancelable: true })
            window.dispatchEvent(prompt)
            return prompt.defaultPrevented
        })
    expect(await installPromptHeldBack(bo)).toBe(true)
    expect(await installPromptHeldBack(stranger)).toBe(false)

    // Bo switches the app language from the corner menu, and the reload lands in the same seat.
    await bo.getByRole('button', { name: 'Menu' }).click()
    await bo.getByRole('button', { name: 'Svenska' }).click()
    await expect(bo.locator('html')).toHaveAttribute('lang', 'sv')
    await waitForHydration(bo)
    expect(new URL(bo.url()).pathname).toBe(`/game/${code}`)
    await expect(boPlayers.nth(1)).toContainText('Du')
    await expect(bo.getByText('Spelare', { exact: true })).toBeVisible()
    await bo.getByRole('button', { name: 'Meny' }).click()
    await expect(bo.getByRole('button', { name: 'Svenska' })).toHaveAttribute(
        'aria-pressed',
        'true',
    )
    await bo.getByRole('button', { name: 'English' }).click()
    await expect(bo.locator('html')).toHaveAttribute('lang', 'en')
    await waitForHydration(bo)
    await expect(boPlayers.nth(1)).toContainText('You')

    // Bo changes name and icon; a name someone else has is flagged, ignoring case.
    await expect(bo.getByRole('button', { name: /^Remove / })).toHaveCount(0)
    await bo.getByRole('button', { name: 'Change name or icon' }).click()
    await expect(bo.getByRole('radio', { name: 'Fish' })).toBeDisabled()
    await bo.getByLabel('Your name').fill('caro')
    await expect(bo.getByText('Someone in this game already has that name.')).toBeVisible()
    await expect(bo.getByRole('button', { name: 'Save' })).toBeDisabled()
    await bo.getByLabel('Your name').fill('Bosse')
    await bo.getByRole('radio', { name: 'Rabbit' }).check()
    await bo.getByRole('button', { name: 'Save' }).click()
    await expect(boPlayers.nth(1)).toContainText('Bosse')
    await expect(bo.getByRole('button', { name: 'Change name or icon' })).toBeVisible()
    await expect(players.nth(1)).toContainText('Bosse')
    await expect(caro.locator('.ui-player-row').nth(1)).toContainText('Bosse')

    // Caro leaves and lands on the home page; the others see Caro go.
    await caro.getByRole('button', { name: 'Leave game' }).click()
    await caro.waitForURL((url) => url.pathname === '/')
    await expect(caro.getByRole('link', { name: /^Back to game/ })).toHaveCount(0)
    await expect(players).toHaveCount(2)
    await expect(boPlayers).toHaveCount(2)

    // The host can't leave, but removes Bosse, whose phone is told and can join again.
    await expect(host.getByRole('button', { name: 'Leave game' })).toHaveCount(0)
    await host.getByRole('button', { name: 'Remove Bosse' }).click()
    await expect(players).toHaveCount(1)
    await bo.waitForURL(new RegExp(`/join/${code}$`))
    await expect(bo.getByText('The host removed you from this game.')).toBeVisible()
    // Removed, Bo has no seat to find from the home page.
    await gotoHydrated(bo, '/')
    await expect(bo.getByRole('link', { name: /^Back to game/ })).toHaveCount(0)
    await gotoHydrated(bo, joinUrl)
    await expect(bo.getByText('The host removed you from this game.')).toBeVisible()
    await bo.getByLabel('Your name').fill('Bo')
    await bo.getByRole('radio', { name: 'Dog' }).check()
    await bo.getByRole('button', { name: 'Join game' }).click()
    await bo.waitForURL(new RegExp(`/game/${code}$`))
    await expect(boPlayers).toHaveCount(2)
    await expect(players.nth(1)).toContainText('Bo')

    await Promise.all(
        [hostContext, boContext, caroContext, strangerContext].map((context) => context.close()),
    )
})
