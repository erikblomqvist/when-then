// The game lifecycle service against the local database (run through with-db.sh / CI's
// stack): creating and joining a game and opening its lobby, the code rules and the refusals.

import { expect, test } from '@playwright/test'
import { isGameCode, randomGameCode } from '../game/game-code'
import { nudgeEvent, nudgeTopic, type Nudge } from '../game/nudge'
import { playerIcons } from '../game/player'
import { localPublicClient, localServiceClient, newPerson } from '../testing/e2e-auth'
import { createGame, getJoinStep, getLobby, joinGame } from './game-lifecycle'

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
        players: [{ name: 'Astrid', icon: 'cat', isHost: true, isYou: true }],
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
        { name: 'B', icon: 'sun', isHost: true, isYou: true },
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
        { name: 'Astrid', icon: 'cat', isHost: true, isYou: true },
        { name: 'Bo', icon: 'dog', isHost: false, isYou: false },
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

    // A phone's view of the channel: the public client, as in the browser.
    const phone = localPublicClient()
    let received!: Promise<Nudge>
    // Wait until subscribed, or the nudge can go out before the phone listens. A cold Realtime
    // (CI's first connection) can take a while to let the first channel in.
    test.setTimeout(60_000)
    await new Promise<void>((subscribed, failed) => {
        received = new Promise<Nudge>((resolve) => {
            phone
                .channel(nudgeTopic(gameId))
                .on('broadcast', { event: nudgeEvent }, ({ payload }) => resolve(payload as Nudge))
                .subscribe((status, error) => {
                    if (status === 'SUBSCRIBED') subscribed()
                    if (status === 'CHANNEL_ERROR') failed(error)
                })
        })
    })

    await joinGame(db, { userId: await newPlayer(), code, name: 'Bo', icon: 'dog' })

    expect(await received).toEqual({ gameId, version: (await getLobby(db, host, code)).version })
    await phone.removeAllChannels()
})
