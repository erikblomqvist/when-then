// Absent (spec #59): a seat missing from presence on its game's channel
// (`#lib/supabase-browser.js`) for a grace period, so a locked screen or a brief network drop
// doesn't flag anyone. It's view-only, for the host's eyes: nothing in the game changes because
// of it. Times are in ms.

/** How long a seat is missing from presence before it counts as absent. */
export const absentAfter = 20_000

/**
 * When each of `seats` went missing, from `previous` and the seats `present` at `now`: a seat
 * still missing keeps its time, one that just went missing starts at `now`, and one present (or
 * no longer in the game) is left out.
 */
export function missingSince(
    previous: ReadonlyMap<string, number>,
    seats: readonly string[],
    present: ReadonlySet<string>,
    now: number,
): Map<string, number> {
    return new Map(
        seats.filter((seat) => !present.has(seat)).map((seat) => [seat, previous.get(seat) ?? now]),
    )
}

/** The seats in `missing` that are absent at `now`. */
export function absentSeats(missing: ReadonlyMap<string, number>, now: number): Set<string> {
    return new Set(
        [...missing].filter(([, since]) => now - since >= absentAfter).map(([seat]) => seat),
    )
}

/** When the next seat in `missing` turns absent after `now`, or undefined when none will. */
export function nextAbsence(missing: ReadonlyMap<string, number>, now: number): number | undefined {
    const upcoming = [...missing.values()]
        .map((since) => since + absentAfter)
        .filter((at) => at > now)
    return upcoming.length ? Math.min(...upcoming) : undefined
}
