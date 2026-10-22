/**
 * Seating: who sits where around the table.
 *
 * A seating is the player ids in clockwise order, seen from above. Clockwise is each player's
 * left, and it is the turn order, so the reader for a player is the one on their right. Any
 * rotation of the same ids is the same seating; only the cyclic order matters (#4, #17).
 */
export type Seating = readonly string[]

/** What the seating components need to know about a player. */
export type SeatedPlayer = { id: string; name: string }

/** The same seating, counted from `id`. Returns a copy unchanged if `id` isn't seated. */
export function startingFrom(seating: Seating, id: string): string[] {
    const i = Math.max(0, seating.indexOf(id))
    return [...seating.slice(i), ...seating.slice(0, i)]
}

/** Whether two seatings put everyone in the same cyclic order. */
export function sameSeating(a: Seating, b: Seating): boolean {
    if (a.length !== b.length) return false
    if (a.length === 0) return true
    const start = a.indexOf(b[0])
    return start !== -1 && b.every((id, i) => a[(start + i) % a.length] === id)
}

/** The player on `id`'s left: the next player in turn order. */
export function leftOf(seating: Seating, id: string): string {
    return seating[(seating.indexOf(id) + 1) % seating.length]
}

/** The player on `id`'s right: the one who reads `id`'s cards. */
export function rightOf(seating: Seating, id: string): string {
    return seating[(seating.indexOf(id) - 1 + seating.length) % seating.length]
}

/** Swap two players' seats. */
export function swapSeats(seating: Seating, a: string, b: string): string[] {
    return seating.map((id) => (id === a ? b : id === b ? a : id))
}

/**
 * Move `id` to sit directly on `neighbour`'s left. Everyone in between shifts round one seat;
 * the order is otherwise unchanged and `seating[0]` stays first unless it is the one moving.
 */
export function moveToLeftOf(seating: Seating, id: string, neighbour: string): string[] {
    if (id === neighbour) return [...seating]
    const rest = seating.filter((other) => other !== id)
    rest.splice(rest.indexOf(neighbour) + 1, 0, id)
    return rest
}

/** Turn the whole table the other way round, with `anchor` in the same seat. */
export function reversed(seating: Seating, anchor: string): string[] {
    const [first, ...rest] = startingFrom(seating, anchor)
    return [first, ...rest.reverse()]
}

// Drawing a round table ----------------------------------------------------------------------

/**
 * Where seat `i` of `n` sits on a round table, as fractions of the box (0–1). Seat 0 is at the
 * bottom, nearest the person holding the phone, and seats go clockwise, which is screen-left.
 */
export function seatPoint(i: number, n: number, radius = 0.42): { x: number; y: number } {
    const angle = Math.PI / 2 + (i * 2 * Math.PI) / n
    return { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) }
}

/** A drop on a seat, or in the gap between seat `after` and the next one clockwise. */
export type SeatTarget = { kind: 'seat'; seat: number } | { kind: 'gap'; after: number }

/**
 * What a point on a round table with `n` seats points at, or undefined when it's off the ring
 * (too near the centre or outside the table). `x` and `y` are fractions of the box (0–1). The
 * middle 40% of the space between two seats counts as the gap.
 */
export function seatTargetAt(x: number, y: number, n: number): SeatTarget | undefined {
    const dx = x - 0.5
    const dy = y - 0.5
    const r = Math.hypot(dx, dy)
    if (n < 1 || r < 0.22 || r > 0.62) return undefined
    // Position in seats, clockwise from seat 0 at the bottom, in [0, n).
    const p = (((((Math.atan2(dy, dx) - Math.PI / 2) / (2 * Math.PI)) * n) % n) + n) % n
    const frac = p - Math.floor(p)
    if (frac > 0.3 && frac < 0.7) return { kind: 'gap', after: Math.floor(p) }
    return { kind: 'seat', seat: Math.round(p) % n }
}
