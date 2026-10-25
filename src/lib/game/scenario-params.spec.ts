import { describe, expect, it } from 'vite-plus/test'
import {
    defaultRecipe,
    recipeFromParams,
    RecipeParamError,
    recipeToParams,
    scenario,
    type Recipe,
} from './scenario'

/** Through a URL's query string and back, as a shared link would go. */
const roundTrip = (recipe: Recipe) =>
    recipeFromParams(new URLSearchParams(recipeToParams(recipe).toString()))

const paramError = (query: string) => {
    try {
        recipeFromParams(new URLSearchParams(query))
    } catch (error) {
        if (error instanceof RecipeParamError) return error
        throw error
    }
    throw new Error(`expected ${query} to be refused`)
}

describe('a recipe as URL query parameters', () => {
    it('survives a round trip, whichever fields it sets', () => {
        const recipes: Recipe[] = [
            defaultRecipe,
            scenario().seed(0).players(10).activePlayer(7).recipe,
            scenario().seed(4294967295).step('stealing').missedSteal().correctSteal().recipe,
            scenario().step('deciding').unlocked(3).target(15).viewer(2).recipe,
            scenario().players(4).scores([7, 9, 10, 3]).absent([2, 4]).removed([3]).recipe,
            scenario().players(3).step('placing').misplace().skip().endEarly().recipe,
            scenario().step('readersChoice').recipe,
            scenario().step('freeChoice').absent([1]).recipe,
            scenario().cardLanguage('nb').recipe,
            // Recipes the builder refuses are still recipes, so a link can show the error.
            scenario().players(-1).activePlayer(0).unlocked(-2).scores([]).recipe,
            scenario().players(2.5).target(0).seed(-3).recipe,
            scenario().seed(1e21).unlocked(1e-7).recipe,
        ]
        for (const recipe of recipes) expect(roundTrip(recipe)).toEqual(recipe)
    })

    it('leaves out the fields at their defaults', () => {
        expect(recipeToParams(defaultRecipe).toString()).toBe('')
        expect(recipeToParams(scenario().players(4).skip().missedSteal().recipe).toString()).toBe(
            'players=4&helpers=skip%2CmissedSteal',
        )
    })

    it('reads the helper steps and player lists as comma-separated lists', () => {
        const recipe = recipeFromParams(
            new URLSearchParams('players=4&step=stealing&helpers=missedSteal,skip&absent=3,4'),
        )
        expect(recipe).toEqual({
            ...defaultRecipe,
            players: 4,
            step: 'stealing',
            helpers: ['missedSteal', 'skip'],
            absent: [3, 4],
        })
    })

    it('refuses a parameter that is no recipe field, naming it', () => {
        const error = paramError('players=3&colour=blue')
        expect(error.param).toBe('colour')
        expect(error.message).toMatch(/^colour: /)
    })

    it('refuses a malformed value, naming the parameter', () => {
        for (const [query, param] of [
            ['players=three', 'players'],
            ['seed=0x10', 'seed'],
            ['target=Infinity', 'target'],
            ['activePlayer=', 'activePlayer'],
            ['step=dancing', 'step'],
            ['cardLanguage=fi', 'cardLanguage'],
            ['helpers=misplace,dance', 'helpers'],
            ['absent=2,,3', 'absent'],
            ['scores=1,x', 'scores'],
            ['viewer=2&viewer=3', 'viewer'],
        ]) {
            const error = paramError(query)
            expect(error.param, query).toBe(param)
            expect(error.message, query).toMatch(new RegExp(`^${param}: `))
        }
    })
})
