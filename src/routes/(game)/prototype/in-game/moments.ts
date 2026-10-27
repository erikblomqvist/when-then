// PROTOTYPE (#16), throwaway: the moments of a game the in-game prototype can jump to, each a
// scenario recipe (`#lib/game/scenario.js`) played by the real machine from there on.

import { defaultRecipe, type Recipe } from '#lib/game/scenario.js'

export type Moment = { key: string; label: string; recipe: Recipe }

const recipe = (fields: Partial<Recipe>): Recipe => ({ ...defaultRecipe, ...fields })

export const moments: Moment[] = [
    {
        key: 'start',
        label: 'First turn of the game',
        recipe: recipe({ players: 4 }),
    },
    {
        key: 'placing',
        label: 'Placing, mid-game',
        recipe: recipe({ players: 4, activePlayer: 2, scores: [3, 4, 2, 5], seed: 3 }),
    },
    {
        key: 'deciding',
        label: 'Lock in or continue',
        recipe: recipe({ players: 4, activePlayer: 2, step: 'deciding', unlocked: 2 }),
    },
    {
        key: 'readersChoice',
        label: "Reader's choice",
        recipe: recipe({ players: 4, activePlayer: 2, step: 'readersChoice' }),
    },
    {
        key: 'freeChoice',
        label: 'Free choice',
        recipe: recipe({ players: 4, activePlayer: 2, step: 'freeChoice' }),
    },
    {
        key: 'stealing',
        label: 'Steal hand-off',
        recipe: recipe({ players: 4, activePlayer: 2, unlocked: 1, helpers: ['misplace'] }),
    },
    {
        key: 'secondSteal',
        label: 'Second stealer, after a miss',
        recipe: recipe({ players: 4, activePlayer: 2, step: 'stealing', helpers: ['missedSteal'] }),
    },
    {
        key: 'long',
        label: 'Long timeline (12 cards)',
        recipe: recipe({ players: 3, activePlayer: 1, target: 15, scores: [12, 9, 7], seed: 7 }),
    },
    {
        key: 'two',
        label: 'Two players',
        recipe: recipe({ players: 2 }),
    },
]

export const momentByKey = (key: string | null) =>
    moments.find((moment) => moment.key === key) ?? moments[0]
