// A player's name and icon, chosen when they create or join a game. Both are unique within
// the game, which the database enforces; the components for the icons live in
// `#lib/ui/player-icons.ts`.

export const playerNameMaxLength = 16

/** The most players a game takes. */
export const maxPlayers = 10

/** The name as stored: trimmed, 1–16 characters. `undefined` when it can't be used. */
export function normalisePlayerName(input: string): string | undefined {
    const name = input.trim()
    // Code points, like Postgres `char_length`, so an emoji counts as one.
    const length = Array.from(name).length
    return length >= 1 && length <= playerNameMaxLength ? name : undefined
}

/** Lucide icon names (kebab-case, as on lucide.dev) a player can pick, one per player. */
export const playerIcons = [
    'cat',
    'dog',
    'bird',
    'fish',
    'rabbit',
    'turtle',
    'squirrel',
    'snail',
    'apple',
    'cherry',
    'carrot',
    'pizza',
    'coffee',
    'ice-cream-cone',
    'sun',
    'moon',
    'flame',
    'flower',
    'tree-pine',
    'anchor',
    'bike',
    'sailboat',
    'ghost',
    'guitar',
] as const

export type PlayerIcon = (typeof playerIcons)[number]

export const isPlayerIcon = (value: unknown): value is PlayerIcon =>
    playerIcons.some((icon) => icon === value)
