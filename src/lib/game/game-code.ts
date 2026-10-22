// The game code (glossary): four letters that identify a game until it finishes, read aloud
// and typed in by the other players. Unique only among games that haven't finished, which the
// database enforces (migration `20261023006400_lobby.sql`); creation retries on a clash.

/** Upper-case letters without the look-alikes I and O (and no digits, so no 0 or 1 either). */
export const gameCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export const gameCodeLength = 4

const pattern = new RegExp(`^[${gameCodeAlphabet}]{${gameCodeLength}}$`)

/** A fresh random code. `random` returns [0, 1), like `Math.random`. */
export function randomGameCode(random: () => number = Math.random): string {
    return Array.from(
        { length: gameCodeLength },
        () => gameCodeAlphabet[Math.floor(random() * gameCodeAlphabet.length)],
    ).join('')
}

/** What a player typed, as a code: trimmed and upper case. Check it with `isGameCode`. */
export const normaliseGameCode = (input: string) => input.trim().toUpperCase()

/** Whether `code` is a well-formed, already normalised game code. */
export const isGameCode = (code: string) => pattern.test(code)
