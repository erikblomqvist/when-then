// The game lifecycle service against the local database (run through with-db.sh / CI's
// stack): creating a game and opening its lobby, the code rules and the refusals.

import { expect, test } from '@playwright/test'
import { isGameCode, randomGameCode } from '../game/game-code'
import { localServiceClient, newPerson } from '../testing/e2e-auth'
import { createGame, getLobby } from './game-lifecycle'

const db = localServiceClient()

const newPlayer = async () => (await newPerson(null)).id

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
