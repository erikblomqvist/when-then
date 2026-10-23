// The game lifecycle service against the local database (run through with-db.sh / CI's
// stack): creating and joining a game and opening its lobby, changing a name or icon, leaving
// and removing, the host's settings, finding your seat again, the code rules and the refusals.

import { expect, test } from '@playwright/test'
import { isGameCode, randomGameCode } from '../game/game-code'
import { nudgeEvent, nudgeTopic, type Nudge } from '../game/nudge'
import { playerIcons } from '../game/player'
import { localPublicClient, localServiceClient, newPerson } from '../testing/e2e-auth'
import {
    changePlayer,
    createGame,
    findMySeat,
    getJoinStep,
    getLobby,
    joinGame,
    leaveGame,
    removePlayer,
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
    // Start game arrives with the game state; until then, mark the game started directly.
    const started = await db
        .from('games')
        .update({ started_at: new Date().toISOString() })
        .eq('code', code)
        .is('ended_at', null)
    expect(started.error).toBeNull()
    const bo = await newPlayer()

    await expect(getJoinStep(db, bo, code)).rejects.toMatchObject({ code: 'game_started' })
    await expect(joinGame(db, { userId: bo, code, name: 'Bo', icon: 'dog' })).rejects.toMatchObject(
        { code: 'game_started' },
    )
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

// Start game arrives with the game state; until then, mark the game started directly.
async function markStarted(code: string) {
    const started = await db
        .from('games')
        .update({ started_at: new Date().toISOString() })
        .eq('code', code)
        .is('ended_at', null)
    expect(started.error).toBeNull()
}

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
    const { bo, code } = await lobbyWithBo()

    await expect(
        changePlayer(db, { userId: await newPlayer(), code, name: 'Caro', icon: 'fish' }),
    ).rejects.toMatchObject({ code: 'no_seat' })
    await markStarted(code)
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
    await markStarted(code)
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
    await markStarted(code)

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

test('only the host changes the settings, and only before the game starts', async () => {
    const { host, bo, code } = await lobbyWithBo()
    const update = (userId: string) =>
        updateSettings(db, { userId, code, ...settings, targetScore: 20 })

    await expect(update(bo)).rejects.toMatchObject({ code: 'not_host' })
    await expect(update(await newPlayer())).rejects.toMatchObject({ code: 'not_host' })
    expect((await getLobby(db, host, code)).targetScore).toBe(10)

    await markStarted(code)
    await expect(update(host)).rejects.toMatchObject({ code: 'game_started' })
    expect((await getLobby(db, host, code)).targetScore).toBe(10)
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

    await markStarted(code)
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
