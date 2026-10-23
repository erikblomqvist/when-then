// The game's dice (ADR 0004): a seeded sfc32 whose seed and position live in the game state, so
// a game is fully determined by its seed and its commands. Only the game machine and the
// synthetic deck roll it.

/** Where a game's random sequence has got to: the seed and how many numbers it has used. */
export type Rng = { seed: number; position: number }

function sfc32(seed: number) {
    // The seed fills one word; the fixed constants fill the rest, and the first 12 outputs are
    // thrown away to mix it in.
    let a = 0x9e3779b9
    let b = 0x243f6a88
    let c = 0xb7e15162
    let d = seed >>> 0
    const next = () => {
        const t = (((a + b) | 0) + d) | 0
        d = (d + 1) | 0
        a = b ^ (b >>> 9)
        b = (c + (c << 3)) | 0
        c = (c << 21) | (c >>> 11)
        c = (c + t) | 0
        return (t >>> 0) / 4294967296
    }
    for (let i = 0; i < 12; i++) next()
    return next
}

/** The dice for one step of the game, from `roll`. */
export type Dice = ReturnType<typeof roll>

/** A stream of numbers that carries on from `rng`. Read `rng` back when done to store it. */
export function roll(rng: Rng) {
    const next = sfc32(rng.seed)
    for (let i = 0; i < rng.position; i++) next()
    let position = rng.position
    const random = () => {
        position++
        return next()
    }
    return {
        /** A number in [0, 1). */
        random,
        /** A whole number from 0 to `n - 1`. */
        int: (n: number) => Math.floor(random() * n),
        /** One of `items`. */
        pick: <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)],
        /** A shuffled copy of `items` (Fisher–Yates). */
        shuffle: <T>(items: readonly T[]): T[] => {
            const out = [...items]
            for (let i = out.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1))
                ;[out[i], out[j]] = [out[j], out[i]]
            }
            return out
        },
        get rng(): Rng {
            return { seed: rng.seed, position }
        },
    }
}
