// The game lifecycle, played through on phones (spec #59, seam 3): one flow that grows with
// each lifecycle ticket. So far: the host creates a game and lands in its lobby, one player
// joins by link and another by the code typed on the home page, and every lobby updates live.
// The host changes the settings, which the others see live. A player finds their seat again from
// the home page, the join link and a switch of app language, with no install prompt meanwhile.
// In the lobby a player changes their name and icon, another leaves, and the host removes a
// player, who joins again. The host starts the game, and every phone moves to seating: the host
// arranges the table and the others follow it live from their own seats. The host confirms the
// seating, every phone moves to play, and a player who reloads is back in their seat. The screen
// stays awake through seating and play. A player whose phone drops out shows as absent to the host,
// who skips what they are holding up, then removes them from the game.

import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { localServiceClient } from '../../lib/testing/e2e-auth'
import { gotoHydrated, reloadHydrated, waitForHydration } from '../../lib/testing/e2e-hydration'
import { qrPath } from '../../lib/ui/qr-path'

const db = localServiceClient()

/**
 * Stands in for Screen Wake Lock on every page in `context`: `window.wakeLocks` lists each lock
 * the page asked for, and `hidden()` lets go of them all the way the browser does when the page
 * is hidden.
 */
async function fakeWakeLock(context: BrowserContext) {
    await context.addInitScript(() => {
        const locks: { released: boolean; release: () => Promise<void> }[] = []
        Object.assign(window, {
            wakeLocks: locks,
            hidden: () => locks.forEach((lock) => (lock.released = true)),
        })
        Object.defineProperty(navigator, 'wakeLock', {
            configurable: true,
            value: {
                request: async () => {
                    const lock = {
                        released: false,
                        release: async () => void (lock.released = true),
                    }
                    locks.push(lock)
                    return lock
                },
            },
        })
    })
}
type WithWakeLocks = { wakeLocks: { released: boolean }[]; hidden: () => void }
const wakeLocks = (page: Page) =>
    page.evaluate(() => {
        const locks = (window as unknown as WithWakeLocks).wakeLocks
        return { asked: locks.length, held: locks.filter((lock) => !lock.released).length }
    })

test('a typed score and a stepper tap are kept when a refetch of the lobby lands before their save', async ({
    page,
}) => {
    // The lobby refetches once its live channel is joined; that join is held back until the
    // host has typed a score, as on a slow phone.
    let join!: () => void
    const joining = new Promise<void>((resolve) => (join = resolve))
    await page.routeWebSocket(/\/realtime\//, (ws) => {
        const server = ws.connectToServer()
        ws.onMessage(async (message) => {
            await joining
            server.send(message)
        })
    })
    await gotoHydrated(page, '/new')
    await page.getByLabel('Your name').fill('Astrid')
    await page.getByRole('radio', { name: 'Cat' }).check()
    await page.getByRole('button', { name: 'Create game' }).click()
    await page.waitForURL(/\/game\/[A-HJ-NP-Z]{4}$/)
    await waitForHydration(page)
    const score = page.getByLabel('Target score', { exact: true })
    const up = page.getByRole('button', { name: 'Raise the target score' })

    // The save of 15 reaches the server, but its answer (and the lobby refetch after it) is
    // held back until the host has tapped + once.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let first = true
    await page.route(
        (url) => url.search.includes('/settings'),
        async (route) => {
            if (!first) return route.continue()
            first = false
            const response = await route.fetch()
            await held
            await route.fulfill({ response })
        },
    )
    await score.fill('15')

    // The refetch on joining says 10, from before the host typed; the typed 15 stays.
    const subscribed = page.waitForResponse((response) => response.url().includes('__data.json'))
    join()
    await subscribed
    await expect(score).toHaveValue('15')
    await score.press('Tab')
    await up.click()
    await expect(score).toHaveValue('16')

    // The refetch says 15, saved before the tap; the tap stays.
    const refetched = page.waitForResponse((response) => response.url().includes('__data.json'))
    release()
    await refetched
    await expect(score).toHaveValue('16')
    await up.click()
    await expect(score).toHaveValue('17')

    // And 17 is what gets saved.
    await expect
        .poll(async () => {
            const { data } = await db
                .from('games')
                .select('target_score')
                .eq('code', new URL(page.url()).pathname.split('/').pop()!)
                .single()
            return data?.target_score
        })
        .toBe(17)
})

test('the host leaves out Sweden-specific cards, and it stays after a reload', async ({ page }) => {
    await gotoHydrated(page, '/new')
    await page.getByLabel('Your name').fill('Astrid')
    await page.getByRole('radio', { name: 'Cat' }).check()
    await page.getByRole('button', { name: 'Create game' }).click()
    await page.waitForURL(/\/game\/[A-HJ-NP-Z]{4}$/)
    await waitForHydration(page)
    const code = new URL(page.url()).pathname.split('/').pop()!

    // Every country's cards are in until the host says otherwise.
    const sweden = page.getByRole('tablist', { name: 'Country-specific cards from Sweden' })
    const norway = page.getByRole('tablist', { name: 'Country-specific cards from Norway' })
    await expect(sweden.getByRole('tab', { name: 'On' })).toHaveAttribute('aria-selected', 'true')
    await expect(norway.getByRole('tab', { name: 'On' })).toHaveAttribute('aria-selected', 'true')
    await sweden.getByRole('tab', { name: 'Off' }).click()
    await expect
        .poll(async () => {
            const { data } = await db
                .from('games')
                .select('left_out_countries')
                .eq('code', code)
                .single()
            return data?.left_out_countries
        })
        .toEqual(['SE'])

    await reloadHydrated(page)
    await expect(sweden.getByRole('tab', { name: 'Off' })).toHaveAttribute('aria-selected', 'true')
    await expect(norway.getByRole('tab', { name: 'On' })).toHaveAttribute('aria-selected', 'true')
})

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
    await expect(bo.getByLabel('Target score', { exact: true })).toHaveCount(0)
    await expect(bo.getByRole('tab')).toHaveCount(0)
    await expect(bo.getByText('Only the host can change these.')).toBeVisible()

    await host.getByLabel('Target score', { exact: true }).fill('15')
    await host.getByLabel('Target score', { exact: true }).press('Tab')
    await expect(boSetting('Target score')).toContainText('15')
    // The stepper: + and − change it by one, saved once the taps pause.
    const up = host.getByRole('button', { name: 'Raise the target score' })
    const down = host.getByRole('button', { name: 'Lower the target score' })
    await up.click()
    await up.click()
    await expect(host.getByLabel('Target score', { exact: true })).toHaveValue('17')
    await expect(boSetting('Target score')).toContainText('17')
    await down.click()
    await down.click()
    await expect(boSetting('Target score')).toContainText('15')
    await host
        .getByRole('tablist', { name: 'Exact-year house rule' })
        .getByRole('tab', { name: 'On' })
        .click()
    await expect(boSetting('Exact-year house rule')).toContainText('On')
    await hostLanguage.getByRole('tab', { name: 'Swedish' }).click()
    await expect(boSetting('Card language')).toContainText('Swedish')
    await expect(boSetting('Country-specific cards')).toContainText('All in')
    await host
        .getByRole('tablist', { name: 'Country-specific cards from Norway' })
        .getByRole('tab', { name: 'Off' })
        .click()
    await expect(boSetting('Country-specific cards')).toContainText('Without Norway')
    await expect(caro.locator('.settings-list')).toContainText('15')
    // A target score outside 3–30 is refused, and the field goes back to the saved one.
    await host.getByLabel('Target score', { exact: true }).fill('31')
    await host.getByLabel('Target score', { exact: true }).press('Tab')
    await expect(host.getByText('Pick a target score from 3 to 30.')).toBeVisible()
    await expect(host.getByLabel('Target score', { exact: true })).toHaveValue('15')
    await expect(boSetting('Target score')).toContainText('15')

    // The settings stay after a reload.
    await reloadHydrated(host)
    await expect(host.getByLabel('Target score', { exact: true })).toHaveValue('15')
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

test('the host starts the game, every phone follows seating live, and confirming it starts play', async ({
    browser,
}) => {
    const hostContext = await browser.newContext()
    await fakeWakeLock(hostContext)
    const host = await hostContext.newPage()
    await gotoHydrated(host, '/new')
    await host.getByLabel('Your name').fill('Astrid')
    await host.getByRole('radio', { name: 'Cat' }).check()
    await host.getByRole('button', { name: 'Create game' }).click()
    await host.waitForURL(/\/game\/[A-HJ-NP-Z]{4}$/)
    await waitForHydration(host)
    const code = new URL(host.url()).pathname.split('/').pop()!

    // Alone, the host can't start yet, and is told why.
    const start = host.getByRole('button', { name: 'Start game' })
    await expect(start).toBeDisabled()
    await expect(
        host.getByText('You can start once at least one more player has joined.'),
    ).toBeVisible()

    const join = async (name: string, icon: string) => {
        const context = await browser.newContext()
        await fakeWakeLock(context)
        const page = await context.newPage()
        await gotoHydrated(page, `/join/${code}`)
        await page.getByLabel('Your name').fill(name)
        await page.getByRole('radio', { name: icon }).check()
        await page.getByRole('button', { name: 'Join game' }).click()
        await page.waitForURL(new RegExp(`/game/${code}$`))
        await waitForHydration(page)
        return { context, page }
    }
    const bo = await join('Bo', 'Dog')
    const caro = await join('Caro', 'Fish')

    // The lobby lets the screen sleep.
    expect(await wakeLocks(bo.page)).toEqual({ asked: 0, held: 0 })

    // Only the host sees Start game; the others wait for it.
    await expect(bo.page.getByRole('button', { name: 'Start game' })).toHaveCount(0)
    await expect(bo.page.getByText('Waiting for the host to start the game.')).toBeVisible()
    await expect(start).toBeEnabled()
    await start.click()
    // The saved game's seating, by name.
    const savedSeating = async () => {
        const { data } = await db
            .from('games')
            .select('state')
            .eq('code', code)
            .is('ended_at', null)
            .single()
        const state = data?.state as {
            players: { id: string; name: string }[]
            seating: string[]
        } | null
        const name = (id: string) => state?.players.find((player) => player.id === id)?.name
        return state?.seating.map(name)
    }
    await expect.poll(savedSeating).toEqual(['Astrid', 'Bo', 'Caro'])

    // Every phone moves to seating without a reload: the host gets the editor in join order,
    // the others the table from their own seat, "You" first and then clockwise.
    for (const page of [host, bo.page, caro.page]) {
        await expect(page.getByRole('heading', { name: 'Seating' })).toBeVisible()
    }
    await expect(host.getByText('Bo is on your left, Caro on your right.')).toBeVisible()
    const boTable = bo.page.locator('.seating-table__seat')
    await expect(boTable).toHaveText(['You', 'Caro', 'Astrid'])
    await expect(caro.page.locator('.seating-table__seat')).toHaveText(['You', 'Astrid', 'Bo'])
    await expect(bo.page.getByRole('button', { name: 'Undo' })).toHaveCount(0)

    // The host turns the table round, and Bo's phone follows.
    await host.getByRole('button', { name: 'Reverse' }).click()
    await expect(host.getByText('Caro is on your left, Bo on your right.')).toBeVisible()
    await expect(boTable).toHaveText(['You', 'Astrid', 'Caro'])

    // Quick moves while a save is on its way: the last one is what lands, and none is refused.
    await host.getByRole('button', { name: 'Reverse' }).click()
    await host.getByRole('button', { name: 'Undo' }).click()
    await host.getByRole('button', { name: 'Undo' }).click()
    await expect(host.getByText('Bo is on your left, Caro on your right.')).toBeVisible()
    await expect.poll(savedSeating).toEqual(['Astrid', 'Bo', 'Caro'])
    await expect(boTable).toHaveText(['You', 'Caro', 'Astrid'])
    await expect(host.getByRole('alert')).toHaveCount(0)

    // The seating is saved: a reload shows it again.
    await reloadHydrated(host)
    await expect(host.getByText('Bo is on your left, Caro on your right.')).toBeVisible()

    // The game is closed to newcomers.
    const lateContext = await browser.newContext()
    const late = await lateContext.newPage()
    await gotoHydrated(late, `/join/${code}`)
    await expect(late.getByText('This game has already started.')).toBeVisible()

    // Seating keeps the screen awake, and asks again when the page comes back into view.
    await expect.poll(() => wakeLocks(bo.page)).toEqual({ asked: 1, held: 1 })
    await bo.page.evaluate(() => {
        ;(window as unknown as WithWakeLocks).hidden()
        document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => wakeLocks(bo.page)).toEqual({ asked: 2, held: 1 })

    // Only the host confirms the seating; then every phone moves to play, showing whose turn it
    // is, and keeps the screen awake from seating into play.
    await expect(bo.page.getByRole('button', { name: 'Confirm seating' })).toHaveCount(0)
    await host.getByRole('button', { name: 'Confirm seating' }).click()
    const turn = /^(Your turn|(Astrid|Bo|Caro) is playing)$/
    for (const page of [host, bo.page, caro.page]) {
        await expect(page.getByRole('heading', { name: turn })).toBeVisible()
        await expect(page.getByRole('heading', { name: 'Seating' })).toHaveCount(0)
    }
    expect(await wakeLocks(bo.page)).toEqual({ asked: 2, held: 1 })
    // Everyone has their anchor year, and one player is the first to play.
    const { data } = await db.from('games').select('state').eq('code', code).single()
    const state = data?.state as {
        players: { id: string; name: string }[]
        phase: { name: string; activeId: string; play: { readerId: string } }
        timelines: Record<string, { kind: string }[]>
    }
    expect(state.phase.name).toBe('playing')
    expect(
        Object.values(state.timelines).map((timeline) => timeline.map(({ kind }) => kind)),
    ).toEqual([['anchor'], ['anchor'], ['anchor']])
    const active = state.players.find((player) => player.id === state.phase.activeId)!.name
    const theirTurn = (name: string) => (name === active ? 'Your turn' : `${active} is playing`)
    await expect(host.getByRole('heading', { name: theirTurn('Astrid') })).toBeVisible()
    await expect(bo.page.getByRole('heading', { name: theirTurn('Bo') })).toBeVisible()
    await expect(caro.page.getByRole('heading', { name: theirTurn('Caro') })).toBeVisible()

    // Bo's phone reloads, and Bo is back in their seat, the screen kept awake again.
    await reloadHydrated(bo.page)
    await expect(bo.page.getByRole('heading', { name: theirTurn('Bo') })).toBeVisible()
    await expect.poll(() => wakeLocks(bo.page)).toEqual({ asked: 1, held: 1 })

    // The phone of whoever of Bo and Caro is holding up play drops out: the active player, or
    // else the reader. Through the grace period nobody is absent; after it, the host sees them
    // as absent, the other phone shows nothing, and the game hasn't moved. The wait for the
    // grace period gets its own time.
    test.info().setTimeout(test.info().timeout + 30_000)
    const held = [state.phase.activeId, state.phase.play.readerId]
    const seatOf = (name: string) => state.players.find((player) => player.name === name)!.id
    const [gone, stays] = held.includes(seatOf('Caro'))
        ? [
              { name: 'Caro', ...caro },
              { name: 'Bo', ...bo },
          ]
        : [
              { name: 'Bo', ...bo },
              { name: 'Caro', ...caro },
          ]
    const savedGame = async () =>
        (await db.from('games').select('version, state').eq('code', code).single()).data
    const version = (await savedGame())?.version
    const hostAbsent = host.getByRole('list', { name: 'Absent players' })
    const goneSession = await gone.context.storageState()
    await gone.context.close()
    await host.waitForTimeout(10_000)
    await expect(hostAbsent).toHaveCount(0)
    await expect(hostAbsent).toContainText(gone.name, { timeout: 20_000 })
    await expect(hostAbsent).toContainText('Absent')
    await expect(hostAbsent).not.toContainText(stays.name)
    await expect(stays.page.getByRole('list', { name: 'Absent players' })).toHaveCount(0)
    expect((await savedGame())?.version).toBe(version)

    // The host skips what they're holding up, from the menu on their row, and play moves on.
    const what = seatOf(gone.name) === state.phase.activeId ? 'turn' : 'reading'
    const skip = what === 'turn' ? 'Skip turn' : 'Skip reading'
    await hostAbsent.getByRole('button', { name: `Host menu for ${gone.name}` }).click()
    await host.getByRole('button', { name: skip }).click()
    await expect.poll(async () => (await savedGame())?.version).toBe(version! + 1)
    const skipped = (await savedGame())!.state as { log: object[]; lastTurn: object[] }
    expect([...skipped.log, ...skipped.lastTurn]).toContainEqual({
        kind: 'skip',
        playerId: seatOf(gone.name),
        what,
    })
    await expect(host.getByRole('button', { name: skip })).toBeHidden()
    await expect(host.getByRole('alert')).toHaveCount(0)

    // They don't come back, so the host removes them from the same menu. It asks first, and
    // Cancel changes nothing.
    const hostMenu = hostAbsent.getByRole('button', { name: `Host menu for ${gone.name}` })
    await hostMenu.click()
    await host.getByRole('button', { name: 'Remove from game' }).click()
    await expect(
        host.getByText(`${gone.name} leaves the game for good, with their timeline`),
    ).toBeVisible()
    await host.getByRole('button', { name: 'Cancel' }).click()
    await host.getByRole('button', { name: 'Remove from game' }).click()
    await host.getByRole('button', { name: `Remove ${gone.name}` }).click()
    await expect.poll(async () => (await savedGame())?.version).toBe(version! + 2)
    const removed = (await savedGame())!.state as {
        seating: string[]
        timelines: Record<string, object[]>
        players: { id: string; removed: boolean }[]
    }
    expect(removed.seating).toEqual(expect.not.arrayContaining([seatOf(gone.name)]))
    expect(removed.timelines[seatOf(gone.name)]).toBeUndefined()
    expect(removed.players.find((player) => player.id === seatOf(gone.name))?.removed).toBe(true)
    await expect(hostAbsent).toHaveCount(0)
    await expect(host.getByRole('alert')).toHaveCount(0)

    // Their phone, back on the game link, is told they were removed, and the home page offers
    // no way back.
    const backContext = await browser.newContext({ storageState: goneSession })
    const back = await backContext.newPage()
    await back.goto(`/game/${code}`)
    await expect(back).toHaveURL(`/join/${code}`)
    await expect(back.getByText('The host removed you from this game.')).toBeVisible()
    await gotoHydrated(back, '/')
    await expect(back.getByRole('link', { name: /^Back to game/ })).toHaveCount(0)

    await Promise.all(
        [hostContext, stays.context, lateContext, backContext].map((context) => context.close()),
    )
})
