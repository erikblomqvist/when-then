// The game lifecycle service against the local database (run through with-db.sh / CI's
// stack): creating and joining a game and opening its lobby, changing a name or icon, leaving
// and removing, the host's settings, starting the game and seating it, finding your seat
// again, the code rules and the refusals.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { isGameCode, randomGameCode } from '../game/game-code'
import { nudgeEvent, nudgeTopic, type Nudge } from '../game/nudge'
import { playerIcons } from '../game/player'
import { localPublicClient, localServiceClient, newPerson } from '../testing/e2e-auth'
import { publishCard } from './card-lifecycle'
import { saveCard } from './cards'
import { listCategories } from './categories'
import {
    changePlayer,
    confirmSeating,
    createGame,
    findMySeat,
    getGame,
    getJoinStep,
    getLobby,
    joinGame,
    leaveGame,
    removeFromGame,
    removePlayer,
    setSeating,
    skipPlayer,
    startGame,
    sweep,
    updateSettings,
} from './game-lifecycle'

const db = localServiceClient()

const newPlayer = async () => (await newPerson(null)).id

/** A game in its lobby with a fresh host, Astrid with the cat. */
async function newLobby() {
    const host = await newPlayer()
    const { code } = await createGame(db, {
        userId: host,
        name: 'Astrid',
        icon: 'cat',
        cardLanguage: 'en',
    })
    return { host, code }
}

const fulfilled = (results: PromiseSettledResult<unknown>[]) =>
    results.filter((result) => result.status === 'fulfilled').length
const refusedWith = (results: PromiseSettledResult<unknown>[]) =>
    results.flatMap((result) => (result.status === 'rejected' ? [result.reason.code] : []))

test('creating a game seats the host in its lobby with their name and icon', async () => {
    const host = await newPlayer()
    const { code } = await createGame(db, {
        userId: host,
        name: '  Astrid ',
        icon: 'cat',
        cardLanguage: 'sv',
    })

    expect(isGameCode(code)).toBe(true)
    expect(await getLobby(db, host, code)).toEqual({
        gameId: expect.any(String),
        version: 1,
        code,
        targetScore: 10,
        exactYear: false,
        cardLanguage: 'sv',
        // Every country's country-specific cards are in, until the host leaves some out.
        leftOutCountries: [],
        players: [
            { seatId: expect.any(String), name: 'Astrid', icon: 'cat', isHost: true, isYou: true },
        ],
    })
})

test('the lobby opens with the code in any case', async () => {
    const host = await newPlayer()
    const { code } = await createGame(db, {
        userId: host,
        name: 'Bo',
        icon: 'dog',
        cardLanguage: 'en',
    })

    expect((await getLobby(db, host, ` ${code.toLowerCase()} `)).code).toBe(code)
})

test('someone without a seat in the game cannot open its lobby', async () => {
    const host = await newPlayer()
    const stranger = await newPlayer()
    const { code } = await createGame(db, {
        userId: host,
        name: 'Bo',
        icon: 'dog',
        cardLanguage: 'en',
    })

    await expect(getLobby(db, stranger, code)).rejects.toMatchObject({ code: 'no_seat' })
})

test('a code that matches no running game is not found', async () => {
    const player = await newPlayer()
    await expect(getLobby(db, player, 'IOIO')).rejects.toMatchObject({ code: 'not_found' })

    // A well-formed code nobody holds: try until one is free.
    let free = randomGameCode()
    while (
        (await db.from('games').select('id').eq('code', free).is('ended_at', null)).data?.length
    ) {
        free = randomGameCode()
    }
    await expect(getLobby(db, player, free)).rejects.toMatchObject({ code: 'not_found' })
})

test('a name or icon outside the rules is refused before anything is created', async () => {
    const host = await newPlayer()
    const create = (name: string, icon: string) =>
        createGame(db, { userId: host, name, icon, cardLanguage: 'en' })

    await expect(create('   ', 'cat')).rejects.toMatchObject({ code: 'invalid_name' })
    await expect(create('Seventeen chars!!', 'cat')).rejects.toMatchObject({ code: 'invalid_name' })
    await expect(create('Bo', 'skull')).rejects.toMatchObject({ code: 'invalid_icon' })
    expect((await db.from('game_players').select('game_id').eq('user_id', host)).data).toEqual([])
})

test('concurrent creates never get the same code', async () => {
    const hosts = await Promise.all(Array.from({ length: 12 }, newPlayer))
    const games = await Promise.all(
        hosts.map((userId) =>
            createGame(db, { userId, name: 'Host', icon: 'sun', cardLanguage: 'en' }),
        ),
    )

    expect(new Set(games.map(({ code }) => code)).size).toBe(games.length)
})

test('two concurrent creates that draw the same code both succeed, one with another code', async () => {
    const [a, b] = await Promise.all([newPlayer(), newPlayer()])
    // Both draw the same code first, so one of them clashes in the database and retries.
    const clash = randomGameCode()
    const drawing = () => {
        let first = true
        return () => (first ? ((first = false), clash) : randomGameCode())
    }
    const [first, second] = await Promise.all([
        createGame(
            db,
            { userId: a, name: 'A', icon: 'sun', cardLanguage: 'en' },
            { newCode: drawing() },
        ),
        createGame(
            db,
            { userId: b, name: 'B', icon: 'sun', cardLanguage: 'en' },
            { newCode: drawing() },
        ),
    ])

    expect(first.code).not.toBe(second.code)
})

test('a code is unique only among games that have not ended', async () => {
    const [a, b] = await Promise.all([newPlayer(), newPlayer()])
    const { code } = await createGame(db, { userId: a, name: 'A', icon: 'sun', cardLanguage: 'en' })
    const ended = await db
        .from('games')
        .update({ ended_at: new Date().toISOString() })
        .eq('code', code)
        .is('ended_at', null)
    expect(ended.error).toBeNull()

    const again = await createGame(
        db,
        { userId: b, name: 'B', icon: 'sun', cardLanguage: 'en' },
        { newCode: () => code },
    )
    expect(again.code).toBe(code)
    expect((await getLobby(db, b, code)).players).toEqual([
        { seatId: expect.any(String), name: 'B', icon: 'sun', isHost: true, isYou: true },
    ])
})

// Joining ---------------------------------------------------------------------------------

test('a player joins by code in any case and everyone sees them in the lobby', async () => {
    const { host, code } = await newLobby()
    const bo = await newPlayer()

    const joined = await joinGame(db, {
        userId: bo,
        code: ` ${code.toLowerCase()} `,
        name: ' Bo ',
        icon: 'dog',
    })

    expect(joined).toEqual({ code })
    expect((await getLobby(db, host, code)).players).toEqual([
        { seatId: expect.any(String), name: 'Astrid', icon: 'cat', isHost: true, isYou: true },
        { seatId: expect.any(String), name: 'Bo', icon: 'dog', isHost: false, isYou: false },
    ])
    expect((await getLobby(db, bo, code)).players[1]).toMatchObject({ name: 'Bo', isYou: true })
})

test('every join moves the lobby to a new version', async () => {
    const { host, code } = await newLobby()
    const before = await getLobby(db, host, code)

    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'dog' })

    expect((await getLobby(db, host, code)).version).toBeGreaterThan(before.version)
})

test('the join step shows the names and icons already taken', async () => {
    const { code } = await newLobby()
    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'dog' })
    const caro = await newPlayer()

    expect(await getJoinStep(db, caro, code.toLowerCase())).toEqual({
        code,
        gameId: expect.any(String),
        version: expect.any(Number),
        seated: false,
        removed: false,
        takenNames: ['Astrid', 'Bo'],
        takenIcons: ['cat', 'dog'],
    })
})

test('the join step tells a player who already has a seat', async () => {
    const { host, code } = await newLobby()

    expect(await getJoinStep(db, host, code)).toMatchObject({ seated: true })
})

test('a name taken ignoring case, or a taken icon, is refused', async () => {
    const { host, code } = await newLobby()
    const bo = await newPlayer()

    await expect(
        joinGame(db, { userId: bo, code, name: 'ASTRID', icon: 'dog' }),
    ).rejects.toMatchObject({ code: 'name_taken' })
    await expect(joinGame(db, { userId: bo, code, name: 'Bo', icon: 'cat' })).rejects.toMatchObject(
        { code: 'icon_taken' },
    )
    expect((await getLobby(db, host, code)).players).toHaveLength(1)
})

test('of two concurrent joins with the same name, exactly one gets it', async () => {
    const { code } = await newLobby()
    const [bo, bo2] = await Promise.all([newPlayer(), newPlayer()])

    const results = await Promise.allSettled([
        joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' }),
        joinGame(db, { userId: bo2, code, name: 'bo', icon: 'fish' }),
    ])

    expect(fulfilled(results)).toBe(1)
    expect(refusedWith(results)).toEqual(['name_taken'])
})

test('of two concurrent joins with the same icon, exactly one gets it', async () => {
    const { code } = await newLobby()
    const [bo, caro] = await Promise.all([newPlayer(), newPlayer()])

    const results = await Promise.allSettled([
        joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' }),
        joinGame(db, { userId: caro, code, name: 'Caro', icon: 'dog' }),
    ])

    expect(fulfilled(results)).toBe(1)
    expect(refusedWith(results)).toEqual(['icon_taken'])
})

test('a game takes 10 players at most, even when they all join at once', async () => {
    const { host, code } = await newLobby()
    const players = await Promise.all(Array.from({ length: 12 }, newPlayer))

    // The host has the cat; everyone else brings their own name and icon.
    const results = await Promise.allSettled(
        players.map((userId, i) =>
            joinGame(db, { userId, code, name: `Player ${i}`, icon: playerIcons[i + 1] }),
        ),
    )

    expect(fulfilled(results)).toBe(9)
    expect(refusedWith(results)).toEqual(['game_full', 'game_full', 'game_full'])
    expect((await getLobby(db, host, code)).players).toHaveLength(10)
    await expect(getJoinStep(db, await newPlayer(), code)).rejects.toMatchObject({
        code: 'game_full',
    })
})

test('nobody new can join a game that has started', async () => {
    const { host, code } = await newLobby()
    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'dog' })
    await startGame(db, { userId: host, code })
    const caro = await newPlayer()

    await expect(getJoinStep(db, caro, code)).rejects.toMatchObject({ code: 'game_started' })
    await expect(
        joinGame(db, { userId: caro, code, name: 'Caro', icon: 'fish' }),
    ).rejects.toMatchObject({ code: 'game_started' })
    // A player who already has a seat isn't turned away.
    expect(await getJoinStep(db, host, code)).toMatchObject({ seated: true })
})

test('a code that matches no running game can’t be joined', async () => {
    const { code } = await newLobby()
    await db.from('games').update({ ended_at: new Date().toISOString() }).eq('code', code)
    const bo = await newPlayer()

    for (const tried of [code, 'IOIO', 'KX']) {
        await expect(getJoinStep(db, bo, tried)).rejects.toMatchObject({ code: 'not_found' })
        await expect(
            joinGame(db, { userId: bo, code: tried, name: 'Bo', icon: 'dog' }),
        ).rejects.toMatchObject({ code: 'not_found' })
    }
})

test('a name or icon outside the rules is refused on join', async () => {
    const { code } = await newLobby()
    const bo = await newPlayer()

    await expect(joinGame(db, { userId: bo, code, name: ' ', icon: 'dog' })).rejects.toMatchObject({
        code: 'invalid_name',
    })
    await expect(
        joinGame(db, { userId: bo, code, name: 'Bo', icon: 'skull' }),
    ).rejects.toMatchObject({ code: 'invalid_icon' })
})

test('joining again with a seat already in the game changes nothing', async () => {
    const { host, code } = await newLobby()
    const bo = await newPlayer()
    await joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })

    await joinGame(db, { userId: bo, code, name: 'Bosse', icon: 'fish' })

    expect((await getLobby(db, host, code)).players.map((player) => player.name)).toEqual([
        'Astrid',
        'Bo',
    ])
})

test('a join nudges the game’s channel with only the game and its version', async () => {
    const { host, code } = await newLobby()
    const { gameId } = await getLobby(db, host, code)

    // A phone's view of the channel: the public client, signed in anonymously like every
    // phone with a seat (Realtime then sees a user token, not just the publishable key).
    const phone = localPublicClient()
    const signedIn = await phone.auth.signInAnonymously()
    expect(signedIn.error).toBeNull()
    const statuses: string[] = []
    let received!: Promise<Nudge>
    // Wait until subscribed, or the nudge can go out before the phone listens. On a cold
    // Realtime (CI, where this test runs first) the first joins can time out; the client
    // retries them.
    test.setTimeout(120_000)
    await new Promise<void>((subscribed, failed) => {
        setTimeout(() => failed(new Error(`Not subscribed: ${statuses.join(', ')}`)), 90_000)
        received = new Promise<Nudge>((resolve) => {
            phone
                .channel(nudgeTopic(gameId))
                .on('broadcast', { event: nudgeEvent }, ({ payload }) => resolve(payload as Nudge))
                .subscribe((status, error) => {
                    statuses.push(error ? `${status} (${error.message})` : status)
                    if (status === 'SUBSCRIBED') subscribed()
                })
        })
    })

    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'dog' })

    const nudge = await Promise.race([
        received,
        new Promise<never>((_, failed) =>
            setTimeout(() => failed(new Error(`No nudge: ${statuses.join(', ')}`)), 15_000),
        ),
    ])
    expect(nudge).toEqual({ gameId, version: (await getLobby(db, host, code)).version })
    await phone.removeAllChannels()
})

// Changing a name or icon, leaving, removing ---------------------------------------------

/** A game in its lobby with the host, Astrid with the cat, and Bo with the dog. */
async function lobbyWithBo() {
    const { host, code } = await newLobby()
    const bo = await newPlayer()
    await joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })
    return { host, bo, code }
}

/** The host starts the game. */
const start = (host: string, code: string) => startGame(db, { userId: host, code })

test('a player changes their name and icon, and everyone sees it in a new version', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const before = await getLobby(db, host, code)

    await changePlayer(db, { userId: bo, code: code.toLowerCase(), name: ' Bosse ', icon: 'fish' })

    const after = await getLobby(db, host, code)
    expect(after.players).toEqual([
        { seatId: expect.any(String), name: 'Astrid', icon: 'cat', isHost: true, isYou: true },
        { seatId: expect.any(String), name: 'Bosse', icon: 'fish', isHost: false, isYou: false },
    ])
    expect(after.version).toBeGreaterThan(before.version)
})

test('a player can change only the case of their name and keep their icon', async () => {
    const { host, bo, code } = await lobbyWithBo()

    await changePlayer(db, { userId: bo, code, name: 'BO', icon: 'dog' })

    expect((await getLobby(db, host, code)).players[1]).toMatchObject({ name: 'BO', icon: 'dog' })
})

test('a change to a name or icon someone else has is refused with the usual refusals', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const change = (name: string, icon: string) =>
        changePlayer(db, { userId: bo, code, name, icon })

    await expect(change('astrid', 'dog')).rejects.toMatchObject({ code: 'name_taken' })
    await expect(change('Bo', 'cat')).rejects.toMatchObject({ code: 'icon_taken' })
    await expect(change(' ', 'dog')).rejects.toMatchObject({ code: 'invalid_name' })
    await expect(change('Bo', 'skull')).rejects.toMatchObject({ code: 'invalid_icon' })
    expect((await getLobby(db, host, code)).players[1]).toMatchObject({ name: 'Bo', icon: 'dog' })
})

test('only a player with a seat can change, and only before the game starts', async () => {
    const { host, bo, code } = await lobbyWithBo()

    await expect(
        changePlayer(db, { userId: await newPlayer(), code, name: 'Caro', icon: 'fish' }),
    ).rejects.toMatchObject({ code: 'no_seat' })
    await start(host, code)
    await expect(
        changePlayer(db, { userId: bo, code, name: 'Bosse', icon: 'dog' }),
    ).rejects.toMatchObject({ code: 'game_started' })
})

test('a player leaves the lobby, and their name and icon are free again', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const before = await getLobby(db, host, code)

    await leaveGame(db, { userId: bo, code: code.toLowerCase() })

    const after = await getLobby(db, host, code)
    expect(after.players.map((player) => player.name)).toEqual(['Astrid'])
    expect(after.version).toBeGreaterThan(before.version)
    await expect(getLobby(db, bo, code)).rejects.toMatchObject({ code: 'no_seat' })
    expect(await getJoinStep(db, bo, code)).toMatchObject({ seated: false, removed: false })
    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'dog' })
})

test('the host can’t leave the lobby, nor can anyone once the game has started', async () => {
    const { host, bo, code } = await lobbyWithBo()

    await expect(leaveGame(db, { userId: host, code })).rejects.toMatchObject({
        code: 'host_cannot_leave',
    })
    await expect(leaveGame(db, { userId: await newPlayer(), code })).rejects.toMatchObject({
        code: 'no_seat',
    })
    await start(host, code)
    await expect(leaveGame(db, { userId: bo, code })).rejects.toMatchObject({
        code: 'game_started',
    })
})

/** The seat of the player called `name`, as the host's lobby shows it. */
const seatOf = async (host: string, code: string, name: string) =>
    (await getLobby(db, host, code)).players.find((player) => player.name === name)!.seatId

test('the host removes a player, whose phone is told, and who can join again', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const before = await getLobby(db, host, code)

    await removePlayer(db, {
        userId: host,
        code: code.toLowerCase(),
        seatId: await seatOf(host, code, 'Bo'),
    })

    const after = await getLobby(db, host, code)
    expect(after.players.map((player) => player.name)).toEqual(['Astrid'])
    expect(after.version).toBeGreaterThan(before.version)
    await expect(getLobby(db, bo, code)).rejects.toMatchObject({ code: 'removed' })
    expect(await getJoinStep(db, bo, code)).toMatchObject({ seated: false, removed: true })

    await joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })

    expect((await getLobby(db, bo, code)).players[1]).toMatchObject({ name: 'Bo', isYou: true })
    expect(await getJoinStep(db, bo, code)).toMatchObject({ seated: true, removed: false })
})

test('only the host can remove a player, and not themselves', async () => {
    const { host, bo, code } = await lobbyWithBo()
    await joinGame(db, { userId: await newPlayer(), code, name: 'Caro', icon: 'fish' })
    const caro = await seatOf(host, code, 'Caro')
    const remove = (userId: string, seatId: string) => removePlayer(db, { userId, code, seatId })

    await expect(remove(bo, caro)).rejects.toMatchObject({ code: 'not_host' })
    await expect(remove(await newPlayer(), caro)).rejects.toMatchObject({ code: 'not_host' })
    await expect(remove(host, await seatOf(host, code, 'Astrid'))).rejects.toMatchObject({
        code: 'host_cannot_leave',
    })
    await expect(remove(host, 'not-a-seat')).rejects.toMatchObject({ code: 'no_player' })
    expect((await getLobby(db, host, code)).players).toHaveLength(3)
})

test('a removal from a stale list never takes out whoever has the name now', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const staleSeat = await seatOf(host, code, 'Bo')
    await leaveGame(db, { userId: bo, code })
    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'fish' })

    await expect(removePlayer(db, { userId: host, code, seatId: staleSeat })).rejects.toMatchObject(
        { code: 'no_player' },
    )
    expect((await getLobby(db, host, code)).players[1]).toMatchObject({ name: 'Bo', icon: 'fish' })
})

test('nobody is removed from the lobby once the game has started', async () => {
    const { host, code } = await lobbyWithBo()
    const seatId = await seatOf(host, code, 'Bo')
    await start(host, code)

    await expect(removePlayer(db, { userId: host, code, seatId })).rejects.toMatchObject({
        code: 'game_started',
    })
})

// Settings ---------------------------------------------------------------------------------

const settings = { targetScore: 10, exactYear: false, cardLanguage: 'en' }

test('the host changes the settings, and everyone sees them in a new version', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const before = await getLobby(db, bo, code)

    await updateSettings(db, {
        userId: host,
        code: code.toLowerCase(),
        targetScore: 15,
        exactYear: true,
        cardLanguage: 'nb',
    })

    const after = await getLobby(db, bo, code)
    expect(after).toMatchObject({ targetScore: 15, exactYear: true, cardLanguage: 'nb' })
    expect(after.version).toBeGreaterThan(before.version)
})

test('a target score is a whole number from 3 to 30', async () => {
    const { host, code } = await newLobby()
    const update = (targetScore: number) =>
        updateSettings(db, { userId: host, code, ...settings, targetScore })

    await update(3)
    expect((await getLobby(db, host, code)).targetScore).toBe(3)
    await update(30)
    expect((await getLobby(db, host, code)).targetScore).toBe(30)
    for (const refused of [2, 31, 0, 12.5, Number.NaN]) {
        await expect(update(refused)).rejects.toMatchObject({ code: 'invalid_target_score' })
    }
    expect((await getLobby(db, host, code)).targetScore).toBe(30)
})

test('the card language is one of the card locales', async () => {
    const { host, code } = await newLobby()

    await expect(
        updateSettings(db, { userId: host, code, ...settings, cardLanguage: 'de' }),
    ).rejects.toMatchObject({ code: 'invalid_card_language' })
    expect((await getLobby(db, host, code)).cardLanguage).toBe('en')
})

test('the host leaves out country-specific cards per country; everything else is dropped', async () => {
    const { host, bo, code } = await lobbyWithBo()
    expect((await getLobby(db, bo, code)).leftOutCountries).toEqual([])

    await updateSettings(db, {
        userId: host,
        code,
        ...settings,
        leftOutCountries: ['SE', 'SE', 'Sweden', 'no'],
    })
    expect((await getLobby(db, bo, code)).leftOutCountries).toEqual(['SE'])

    // Settings sent without it put every card back in.
    await updateSettings(db, { userId: host, code, ...settings })
    expect((await getLobby(db, bo, code)).leftOutCountries).toEqual([])
})

test('only the host changes the settings, and only before the game starts', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const update = (userId: string) =>
        updateSettings(db, { userId, code, ...settings, targetScore: 20 })

    await expect(update(bo)).rejects.toMatchObject({ code: 'not_host' })
    await expect(update(await newPlayer())).rejects.toMatchObject({ code: 'not_host' })
    expect((await getLobby(db, host, code)).targetScore).toBe(10)

    await start(host, code)
    await expect(update(host)).rejects.toMatchObject({ code: 'game_started' })
    expect((await getLobby(db, host, code)).targetScore).toBe(10)
})

// Start game and seating -------------------------------------------------------------------

/** A lobby with the host Astrid, Bo and Caro, in that join order, and their seats. */
async function lobbyOfThree() {
    const { host, bo, code } = await lobbyWithBo()
    const caro = await newPlayer()
    await joinGame(db, { userId: caro, code, name: 'Caro', icon: 'fish' })
    const { players } = await getLobby(db, host, code)
    const [astridSeat, boSeat, caroSeat] = players.map((player) => player.seatId)
    return { host, bo, caro, code, seats: { astrid: astridSeat, bo: boSeat, caro: caroSeat } }
}

/** The game as `userId`'s phone sees it, failing the test while it's still a lobby. */
async function viewOf(userId: string, code: string) {
    const game = await getGame(db, userId, code)
    if (!game.started) throw new Error('The game has not started')
    return game
}

test('the host starts the game, and every phone sees seating in join order from its own seat', async () => {
    const { host, bo, caro, code, seats } = await lobbyOfThree()
    await updateSettings(db, { userId: host, code, ...settings, targetScore: 15 })
    const lobby = await getLobby(db, host, code)

    await startGame(db, { userId: host, code })

    const players = [
        { id: seats.astrid, name: 'Astrid', icon: 'cat', host: true, removed: false },
        { id: seats.bo, name: 'Bo', icon: 'dog', host: false, removed: false },
        { id: seats.caro, name: 'Caro', icon: 'fish', host: false, removed: false },
    ]
    for (const [userId, seat] of [
        [host, seats.astrid],
        [bo, seats.bo],
        [caro, seats.caro],
    ]) {
        const game = await viewOf(userId, code)
        expect(game).toMatchObject({ gameId: lobby.gameId, version: lobby.version + 1, code })
        expect(game.view).toMatchObject({
            seat,
            players,
            settings: { targetScore: 15, exactYear: false, cardLanguage: 'en' },
            seating: [seats.astrid, seats.bo, seats.caro],
            phase: { name: 'seating' },
        })
        // The seed, the dice and the queued cards never reach a phone.
        expect(Object.keys(game.view)).not.toEqual(expect.arrayContaining(['rng']))
        expect(Object.keys(game.view)).not.toEqual(expect.arrayContaining(['queues']))
    }
})

test('with two players the game goes straight past seating to play', async () => {
    const { host, bo, code } = await lobbyWithBo()

    await startGame(db, { userId: host, code })

    const { view } = await viewOf(bo, code)
    expect(view.phase.name).toBe('playing')
    expect(Object.values(view.timelines).map((timeline) => timeline[0].kind)).toEqual([
        'anchor',
        'anchor',
    ])
})

test('only the host starts, with at least two players, and only once', async () => {
    const { host, code } = await newLobby()
    await expect(startGame(db, { userId: host, code })).rejects.toMatchObject({
        code: 'too_few_players',
    })

    const bo = await newPlayer()
    await joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })
    await expect(startGame(db, { userId: bo, code })).rejects.toMatchObject({ code: 'not_host' })
    await expect(startGame(db, { userId: await newPlayer(), code })).rejects.toMatchObject({
        code: 'no_seat',
    })
    expect((await getGame(db, host, code)).started).toBe(false)

    await startGame(db, { userId: host, code })
    await expect(startGame(db, { userId: host, code })).rejects.toMatchObject({
        code: 'game_started',
    })
})

test('a join racing the start either gets in before it or is refused as game started', async () => {
    const { host, code } = await lobbyWithBo()
    const caro = await newPlayer()

    const [started, joined] = await Promise.allSettled([
        startGame(db, { userId: host, code }),
        joinGame(db, { userId: caro, code, name: 'Caro', icon: 'fish' }),
    ])

    expect(started.status).toBe('fulfilled')
    const names = (await viewOf(host, code)).view.players.map((player) => player.name)
    if (joined.status === 'fulfilled') expect(names).toEqual(['Astrid', 'Bo', 'Caro'])
    else {
        expect(joined.reason).toMatchObject({ code: 'game_started' })
        expect(names).toEqual(['Astrid', 'Bo'])
    }
})

test('Start snapshots the published deck in the card language, without left-out countries', async () => {
    const actor = (await newPerson()).id
    const events = (await listCategories(db)).find((category) => category.name === 'Events')!
    const newCard = async (
        text: string,
        { swedish, country = null }: { swedish?: string; country?: string | null } = {},
    ) =>
        saveCard(db, actor, {
            categoryId: events.id,
            date: { decade: 1960, year: 1969, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            countrySpecific: country,
            translations: { en: { text }, ...(swedish && { sv: { text: swedish } }) },
        })
    const tag = randomUUID()
    const translated = await newCard(`Translated ${tag}`, { swedish: `Översatt ${tag}` })
    const english = await newCard(`English only ${tag}`)
    const swedishOnly = await newCard(`Swedish knowledge ${tag}`, { country: 'SE' })
    const draft = await newCard(`Draft ${tag}`)
    for (const id of [translated, english, swedishOnly]) await publishCard(db, actor, id)

    const { host, code } = await lobbyWithBo()
    await updateSettings(db, {
        userId: host,
        code,
        ...settings,
        cardLanguage: 'sv',
        leftOutCountries: ['SE'],
    })
    await startGame(db, { userId: host, code })
    const deck = async () => {
        const { data, error } = await db
            .from('games')
            .select('state')
            .eq('code', code)
            .is('ended_at', null)
            .single()
        expect(error).toBeNull()
        return (data!.state as { cards: Record<string, { text: string; date: number }> }).cards
    }

    expect((await deck())[translated]).toMatchObject({ text: `Översatt ${tag}`, date: 1969 })
    expect((await deck())[english]).toMatchObject({ text: `English only ${tag}` })
    expect(await deck()).not.toHaveProperty(swedishOnly)
    expect(await deck()).not.toHaveProperty(draft)

    // Editing a card after Start leaves the game's copy as it was.
    await saveCard(
        db,
        actor,
        {
            categoryId: events.id,
            date: { decade: 1960, year: 1969, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            translations: { en: { text: `Edited ${tag}` }, sv: { text: `Ändrad ${tag}` } },
        },
        translated,
    )
    expect((await deck())[translated]).toMatchObject({ text: `Översatt ${tag}` })
})

test('the host seats everyone, and every phone sees the new seating', async () => {
    const { host, bo, code, seats } = await lobbyOfThree()
    await startGame(db, { userId: host, code })
    const { version } = await viewOf(host, code)
    const seating = [seats.astrid, seats.caro, seats.bo]

    await setSeating(db, { userId: host, code, version, seating })

    expect(await viewOf(bo, code)).toMatchObject({ version: version + 1, view: { seating } })
})

test('only the host seats, every player exactly once, and only once the game has started', async () => {
    const { host, bo, code, seats } = await lobbyOfThree()
    const seating = [seats.astrid, seats.caro, seats.bo]
    await expect(setSeating(db, { userId: host, code, seating })).rejects.toMatchObject({
        code: 'not_started',
    })
    await startGame(db, { userId: host, code })

    await expect(setSeating(db, { userId: bo, code, seating })).rejects.toMatchObject({
        code: 'not_host',
    })
    for (const wrong of [[seats.astrid, seats.bo], [...seating, seats.bo], 'everyone', [1, 2, 3]]) {
        await expect(setSeating(db, { userId: host, code, seating: wrong })).rejects.toMatchObject({
            code: 'invalid_seating',
        })
    }
    expect((await viewOf(host, code)).view.seating).toEqual([seats.astrid, seats.bo, seats.caro])
})

test('the host confirms the seating, which deals the anchors and starts the first turn', async () => {
    const { host, bo, code, seats } = await lobbyOfThree()
    await startGame(db, { userId: host, code })
    const seating = [seats.astrid, seats.caro, seats.bo]
    await setSeating(db, { userId: host, code, seating })
    const { version } = await viewOf(host, code)

    await confirmSeating(db, { userId: host, code, version }, { now: () => new Date('1999-06-01') })

    const game = await viewOf(bo, code)
    expect(game.version).toBe(version + 1)
    const { view } = game
    expect(view.seating).toEqual(seating)
    expect(view.phase).toMatchObject({ name: 'playing', activeId: expect.any(String) })
    if (view.phase.name !== 'playing') throw new Error('Not playing')
    expect(seating).toContain(view.phase.activeId)
    // One anchor each, all different, none past the year the confirm came in.
    const anchors = seating.map((seat) => view.timelines[seat])
    for (const timeline of anchors) {
        expect(timeline).toEqual([{ kind: 'anchor', date: expect.any(Number) }])
        expect(timeline[0].date).toBeLessThanOrEqual(1999)
    }
    expect(new Set(anchors.map((timeline) => timeline[0].date)).size).toBe(3)
})

test('only the host confirms the seating, and only while the game is in seating', async () => {
    const { host, bo, code } = await lobbyOfThree()
    await expect(confirmSeating(db, { userId: host, code })).rejects.toMatchObject({
        code: 'not_started',
    })
    await startGame(db, { userId: host, code })

    await expect(confirmSeating(db, { userId: bo, code })).rejects.toMatchObject({
        code: 'not_host',
    })
    expect((await viewOf(host, code)).view.phase.name).toBe('seating')

    await confirmSeating(db, { userId: host, code })
    await expect(confirmSeating(db, { userId: host, code })).rejects.toMatchObject({
        code: 'not_seating',
    })
})

// Skip -----------------------------------------------------------------------------------

/** A game of three in play, and who is active and reading in its first turn. */
async function playingOfThree() {
    const three = await lobbyOfThree()
    const { host, code } = three
    await startGame(db, { userId: host, code })
    await confirmSeating(db, { userId: host, code })
    const { version, view } = await viewOf(host, code)
    if (view.phase.name !== 'playing') throw new Error('Not playing')
    const { activeId, play } = view.phase
    return { ...three, version, activeId, readerId: play.readerId }
}

test('the host skips the active player’s turn, and the next player is up; the skipped player keeps their seat', async () => {
    const { host, bo, code, version, activeId } = await playingOfThree()

    await skipPlayer(db, { userId: host, code, version, seatId: activeId })

    const { version: next, view } = await viewOf(bo, code)
    expect(next).toBe(version + 1)
    expect(view.phase).toMatchObject({ name: 'playing', activeId: expect.any(String) })
    if (view.phase.name !== 'playing') throw new Error('Not playing')
    expect(view.phase.activeId).not.toBe(activeId)
    expect(view.lastTurn).toContainEqual({ kind: 'skip', playerId: activeId, what: 'turn' })
    expect(view.seating).toContain(activeId)
    expect(view.timelines[activeId]).toEqual([{ kind: 'anchor', date: expect.any(Number) }])
})

test('the host skips the reader, and the next player before the active one reads', async () => {
    const { host, code, version, activeId, readerId } = await playingOfThree()

    await skipPlayer(db, { userId: host, code, version, seatId: readerId })

    const { view } = await viewOf(host, code)
    expect(view.log).toContainEqual({ kind: 'skip', playerId: readerId, what: 'reading' })
    if (view.phase.name !== 'playing') throw new Error('Not playing')
    expect(view.phase.activeId).toBe(activeId)
    expect([activeId, readerId]).not.toContain(view.phase.play.readerId)
})

test('only the host skips, only a player holding up play, and only from the version shown', async () => {
    const { host, bo, caro, code, version, activeId, readerId, seats } = await playingOfThree()
    const idle = Object.values(seats).find((seat) => seat !== activeId && seat !== readerId)!
    const refusal = (userId: string, seatId: string, at = version) =>
        expect(skipPlayer(db, { userId, code, version: at, seatId })).rejects

    await refusal(bo, activeId).toMatchObject({ code: 'not_host' })
    await refusal(caro, readerId).toMatchObject({ code: 'not_host' })
    await refusal(host, idle).toMatchObject({ code: 'nothing_to_skip' })
    await refusal(host, 'nobody').toMatchObject({ code: 'nothing_to_skip' })
    await refusal(host, activeId, version - 1).toMatchObject({ code: 'stale_version' })
    expect((await viewOf(host, code)).version).toBe(version)
})

test('with two players the reading has nobody else to move to', async () => {
    const { host, code } = await lobbyWithBo()
    await startGame(db, { userId: host, code })
    const { view } = await viewOf(host, code)
    if (view.phase.name !== 'playing') throw new Error('Not playing')
    const seatId = view.phase.play.readerId

    await expect(skipPlayer(db, { userId: host, code, seatId })).rejects.toMatchObject({
        code: 'no_other_reader',
    })
})

test('nobody is skipped before play starts', async () => {
    const { host, code, seats } = await lobbyOfThree()
    await expect(skipPlayer(db, { userId: host, code, seatId: seats.bo })).rejects.toMatchObject({
        code: 'not_started',
    })
    await startGame(db, { userId: host, code })
    await expect(skipPlayer(db, { userId: host, code, seatId: seats.bo })).rejects.toMatchObject({
        code: 'nothing_to_skip',
    })
})

// Remove player -----------------------------------------------------------------------------

/** A game of three in play, with its guests' users by seat: Bo's and Caro's. */
async function playingOfThreeWithGuests() {
    const game = await playingOfThree()
    const { bo, caro, seats } = game
    return {
        ...game,
        guests: new Map([
            [seats.bo, bo],
            [seats.caro, caro],
        ]),
    }
}

test('the host removes a player for good: out of the seating with their timeline, and their seat is gone', async () => {
    const { host, code, version, activeId, seats, guests } = await playingOfThreeWithGuests()
    // A guest who isn't the active player.
    const seatId = [seats.bo, seats.caro].find((seat) => seat !== activeId)!
    const removed = guests.get(seatId)!
    const stays = [...guests].find(([seat]) => seat !== seatId)![1]

    await removeFromGame(db, { userId: host, code, version, seatId })

    const { version: next, view } = await viewOf(stays, code)
    expect(next).toBe(version + 1)
    expect(view.seating).not.toContain(seatId)
    expect(view.seating).toHaveLength(2)
    expect(view.timelines[seatId]).toBeUndefined()
    expect(view.scores[seatId]).toBeUndefined()
    expect(view.players.find((player) => player.id === seatId)?.removed).toBe(true)
    expect(view.log).toContainEqual({ kind: 'remove', playerId: seatId })

    // Their phone is told they were removed, and finds no seat to go back to.
    expect(await findMySeat(db, removed)).toBeNull()
    await expect(getGame(db, removed, code)).rejects.toMatchObject({ code: 'removed' })
    await expect(getJoinStep(db, removed, code)).rejects.toMatchObject({ code: 'removed' })
    await expect(confirmSeating(db, { userId: removed, code })).rejects.toMatchObject({
        code: 'removed',
    })
    // The others keep theirs.
    expect((await findMySeat(db, stays))?.code).toBe(code)
    expect((await findMySeat(db, host))?.code).toBe(code)
})

test('removing the player holding up play moves it on as a skip would', async () => {
    const { host, code, version, activeId, readerId, seats } = await playingOfThreeWithGuests()
    // The active player, or the reader when the host is the active one.
    const seatId = activeId === seats.astrid ? readerId : activeId

    await removeFromGame(db, { userId: host, code, version, seatId })

    const { view } = await viewOf(host, code)
    if (view.phase.name !== 'playing') throw new Error('Not playing')
    expect(view.phase.activeId).not.toBe(seatId)
    expect(view.phase.play.readerId).not.toBe(seatId)
    expect(view.seating).toEqual(expect.arrayContaining([view.phase.activeId]))
})

test('removing one of two players ends the game with no winner', async () => {
    const { host, bo, code } = await lobbyWithBo()
    await startGame(db, { userId: host, code })
    const { view } = await viewOf(host, code)
    const seatId = view.players.find((player) => !player.host)!.id

    await removeFromGame(db, { userId: host, code, seatId })

    expect((await viewOf(host, code)).view.phase).toEqual({ name: 'ended' })
    expect(await findMySeat(db, bo)).toBeNull()
})

test('only the host removes, never themselves, only a player still in, and only from the version shown', async () => {
    const { host, bo, code, version, seats } = await playingOfThreeWithGuests()
    const refusal = (userId: string, seatId: string, at = version) =>
        expect(removeFromGame(db, { userId, code, version: at, seatId })).rejects

    await refusal(bo, seats.caro).toMatchObject({ code: 'not_host' })
    await refusal(host, seats.astrid).toMatchObject({ code: 'host_cannot_leave' })
    await refusal(host, 'nobody').toMatchObject({ code: 'no_player' })
    await refusal(host, seats.caro, version - 1).toMatchObject({ code: 'stale_version' })
    expect((await viewOf(host, code)).version).toBe(version)
    expect((await findMySeat(db, bo))?.code).toBe(code)

    await removeFromGame(db, { userId: host, code, version, seatId: seats.caro })
    await refusal(host, seats.caro, version + 1).toMatchObject({ code: 'no_player' })
})

test('nobody is removed from the game before Start: that is the lobby’s Remove', async () => {
    const { host, code, seats } = await lobbyOfThree()
    await expect(
        removeFromGame(db, { userId: host, code, seatId: seats.bo }),
    ).rejects.toMatchObject({ code: 'not_started' })
})

test('of two host commands from the same version, one lands and the other is refused for a refetch', async () => {
    const { host, code, seats } = await lobbyOfThree()
    await startGame(db, { userId: host, code })
    const { version } = await viewOf(host, code)
    const seatings = [
        [seats.astrid, seats.caro, seats.bo],
        [seats.bo, seats.astrid, seats.caro],
    ]

    const results = await Promise.allSettled(
        seatings.map((seating) => setSeating(db, { userId: host, code, version, seating })),
    )

    expect(fulfilled(results)).toBe(1)
    expect(refusedWith(results)).toEqual(['stale_version'])
    const landed = seatings[results.findIndex((result) => result.status === 'fulfilled')]
    expect(await viewOf(host, code)).toMatchObject({
        version: version + 1,
        view: { seating: landed },
    })
})

test('commands that name no version are played again on a conflict, so they all land', async () => {
    const { host, code, seats } = await lobbyOfThree()
    await startGame(db, { userId: host, code })
    const { version } = await viewOf(host, code)
    const seating = [seats.astrid, seats.caro, seats.bo]

    const results = await Promise.allSettled(
        [1, 2, 3].map(() => setSeating(db, { userId: host, code, seating })),
    )

    expect(fulfilled(results)).toBe(3)
    expect((await viewOf(host, code)).version).toBe(version + 3)
})

// Find my seat ---------------------------------------------------------------------------

test('a player finds their seat again on every reload, before and after Start', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const { gameId } = await getLobby(db, host, code)
    const hostSeat = { gameId, code, seatId: await seatOf(host, code, 'Astrid') }
    const boSeat = { gameId, code, seatId: await seatOf(host, code, 'Bo') }

    expect(await findMySeat(db, host)).toEqual(hostSeat)
    expect(await findMySeat(db, bo)).toEqual(boSeat)
    expect(await findMySeat(db, bo)).toEqual(boSeat)

    await start(host, code)
    expect(await findMySeat(db, bo)).toEqual(boSeat)
})

test('find my seat returns nothing without a seat in a game that hasn’t finished', async () => {
    const { bo, code } = await lobbyWithBo()

    expect(await findMySeat(db, await newPlayer())).toBeNull()

    const ended = await db
        .from('games')
        .update({ ended_at: new Date().toISOString() })
        .eq('code', code)
        .is('ended_at', null)
    expect(ended.error).toBeNull()
    expect(await findMySeat(db, bo)).toBeNull()
})

test('find my seat returns nothing once the player has left the lobby', async () => {
    const { bo, code } = await lobbyWithBo()

    await leaveGame(db, { userId: bo, code })

    expect(await findMySeat(db, bo)).toBeNull()
})

test('find my seat returns nothing for a player the host removed, until they join again', async () => {
    const { host, bo, code } = await lobbyWithBo()

    await removePlayer(db, { userId: host, code, seatId: await seatOf(host, code, 'Bo') })
    expect(await findMySeat(db, bo)).toBeNull()

    await joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })
    expect(await findMySeat(db, bo)).toMatchObject({ code })
})

test('a player seated in two games that haven’t finished finds the one they joined last', async () => {
    const { bo } = await lobbyWithBo()
    const { code } = await newLobby()

    await joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })

    expect(await findMySeat(db, bo)).toMatchObject({ code })
})

// Sweep ----------------------------------------------------------------------------------

const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

// The sweep runs over every game in the database, so a clock in the future would expire the
// lobbies of tests running alongside. Instead the sweep's clock is the database's own time when
// the game last moved, and the game's timestamps are moved back to make it look idle or long
// ended.
async function lastActive(gameId: string) {
    const { data, error } = await db
        .from('games')
        .select('last_active_at')
        .eq('id', gameId)
        .single()
    if (error) throw new Error(error.message, { cause: error })
    return new Date(data.last_active_at)
}

/** Moves the game's last activity, or its end, back to `by` milliseconds before `now`. */
async function moveBack(
    gameId: string,
    column: 'last_active_at' | 'ended_at',
    now: Date,
    by: number,
) {
    const at = new Date(now.getTime() - by).toISOString()
    const moved = await db
        .from('games')
        .update(column === 'ended_at' ? { ended_at: at } : { last_active_at: at })
        .eq('id', gameId)
    expect(moved.error).toBeNull()
}

/** What is left of a game in the database: the game and its player rows. */
async function rowsOf(gameId: string) {
    const [games, players] = await Promise.all([
        db.from('games').select('id', { count: 'exact', head: true }).eq('id', gameId),
        db
            .from('game_players')
            .select('user_id', { count: 'exact', head: true })
            .eq('game_id', gameId),
    ])
    return { games: games.count, players: players.count }
}

test('a lobby with no activity for 2 hours expires, and its code is free again', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const { gameId } = await getLobby(db, host, code)
    const now = await lastActive(gameId)

    await moveBack(gameId, 'last_active_at', now, 2 * hour - minute)
    await sweep(db, now)
    expect((await getLobby(db, host, code)).gameId).toBe(gameId)

    await moveBack(gameId, 'last_active_at', now, 2 * hour)
    await sweep(db, now)

    await expect(getLobby(db, host, code)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getJoinStep(db, await newPlayer(), code)).rejects.toMatchObject({
        code: 'not_found',
    })
    await expect(
        joinGame(db, { userId: await newPlayer(), code, name: 'Cai', icon: 'sun' }),
    ).rejects.toMatchObject({ code: 'not_found' })
    expect(await findMySeat(db, bo)).toBeNull()

    const again = await createGame(
        db,
        { userId: await newPlayer(), name: 'Dag', icon: 'moon', cardLanguage: 'en' },
        { newCode: () => code },
    )
    expect(again.code).toBe(code)
})

type LobbyWithBo = Awaited<ReturnType<typeof lobbyWithBo>>

const activities: [string, (lobby: LobbyWithBo) => Promise<void>][] = [
    [
        'a join',
        async ({ code }) => {
            await joinGame(db, { userId: await newPlayer(), code, name: 'Cai', icon: 'sun' })
        },
    ],
    [
        'a name or icon change',
        ({ bo, code }) => changePlayer(db, { userId: bo, code, name: 'Bosse', icon: 'dog' }),
    ],
    [
        'a settings change',
        ({ host, code }) =>
            updateSettings(db, { userId: host, code, ...settings, targetScore: 12 }),
    ],
    ['a leave', ({ bo, code }) => leaveGame(db, { userId: bo, code })],
    [
        'a removal',
        async ({ host, code }) => {
            await removePlayer(db, { userId: host, code, seatId: await seatOf(host, code, 'Bo') })
        },
    ],
]

for (const [activity, act] of activities) {
    test(`${activity} in the lobby starts its 2 hours over`, async () => {
        const lobby = await lobbyWithBo()
        const { host, code } = lobby
        const { gameId } = await getLobby(db, host, code)
        const now = await lastActive(gameId)
        await moveBack(gameId, 'last_active_at', now, 3 * hour)

        await act(lobby)

        // The 2 hours now count from the activity, not from 3 hours ago.
        const restarted = await lastActive(gameId)
        expect(restarted.getTime()).toBeGreaterThanOrEqual(now.getTime())
        await sweep(db, restarted)
        expect((await getLobby(db, host, code)).gameId).toBe(gameId)
    })
}

test('a game that has started is not expired as a lobby', async () => {
    const { host, code } = await lobbyWithBo()
    const { gameId } = await getLobby(db, host, code)
    const now = await lastActive(gameId)
    await start(host, code)
    await moveBack(gameId, 'last_active_at', now, 3 * hour)

    await sweep(db, now)

    expect(await findMySeat(db, host)).toMatchObject({ gameId })
})

test('an expired lobby and its players are deleted 30 days after it expired', async () => {
    const { host, code } = await lobbyWithBo()
    const { gameId } = await getLobby(db, host, code)
    const now = await lastActive(gameId)
    await moveBack(gameId, 'last_active_at', now, 3 * hour)
    await sweep(db, now)
    expect(await rowsOf(gameId)).toEqual({ games: 1, players: 2 })

    await moveBack(gameId, 'ended_at', now, 30 * day - minute)
    await sweep(db, now)
    expect(await rowsOf(gameId)).toEqual({ games: 1, players: 2 })

    await moveBack(gameId, 'ended_at', now, 30 * day)
    await sweep(db, now)
    expect(await rowsOf(gameId)).toEqual({ games: 0, players: 0 })
})
