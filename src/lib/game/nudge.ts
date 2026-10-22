// The nudge (ADR 0002): after every change to a game, the server broadcasts only the game's id
// and version on the game's public channel, and each phone refetches what its seat may see.
// No secret travels on the channel, so reconnecting or reloading is the same refetch.

/** What a nudge carries, and all it carries. */
export type Nudge = { gameId: string; version: number }

/** The broadcast event name on a game's channel. */
export const nudgeEvent = 'nudge'

/** The realtime topic of a game's channel. */
export const nudgeTopic = (gameId: string) => `game:${gameId}`
