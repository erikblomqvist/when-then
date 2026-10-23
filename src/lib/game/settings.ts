// A game's settings, which the host adjusts in the lobby: the target score, the exact-year
// house rule and the card language. The database checks the same limits
// (`20261023006400_lobby.sql`).

export const minTargetScore = 3
export const maxTargetScore = 30

/** Whether `value` can be a game's target score: a whole number from 3 to 30. */
export const isTargetScore = (value: number) =>
    Number.isInteger(value) && value >= minTargetScore && value <= maxTargetScore
