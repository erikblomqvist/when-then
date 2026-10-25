import { describe, expect, it } from 'vite-plus/test'
import { cardLocales } from '../cards/card'
import { buildScenario, defaultRecipe, scenario, scenarioSteps, type Recipe } from './scenario'
import { recipeFromArgs, recipeStory } from './scenario-story'

describe('a recipe as story args and controls', () => {
    it('has a control for every recipe field, and args at the recipe', () => {
        const { args, argTypes } = recipeStory()
        expect(Object.keys(argTypes)).toEqual(Object.keys(defaultRecipe))
        expect(args).toEqual(defaultRecipe)
    })

    it('picks a control from how each field is spelled', () => {
        const { argTypes } = recipeStory()
        expect(argTypes.players).toMatchObject({ control: 'number' })
        expect(argTypes.activePlayer).toMatchObject({ control: 'number' })
        expect(argTypes.step).toMatchObject({ control: 'select', options: [...scenarioSteps] })
        expect(argTypes.cardLanguage).toMatchObject({
            control: 'select',
            options: [...cardLocales],
        })
        expect(argTypes.scores).toMatchObject({ control: 'object' })
        expect(argTypes.helpers).toMatchObject({ control: 'object' })
        expect(argTypes.absent).toMatchObject({ control: 'object' })
    })

    it('starts from the recipe given', () => {
        const { recipe } = scenario().players(4).step('stealing').cardLanguage('sv')
        expect(recipeStory(recipe).args).toEqual(recipe)
    })

    it('reads the args back as the recipe', () => {
        const recipes: Recipe[] = [
            defaultRecipe,
            scenario().players(4).activePlayer(2).unlocked(2).scores([7, 9, 10, 3]).recipe,
            scenario().players(3).viewer(2).absent([3]).misplace().skip().cardLanguage('nb').recipe,
        ]
        for (const recipe of recipes)
            expect(recipeFromArgs(recipeStory(recipe).args)).toEqual(recipe)
    })

    it('reads a cleared control as none where the field can be, and the default otherwise', () => {
        const recipe = recipeFromArgs({
            ...defaultRecipe,
            players: undefined,
            activePlayer: undefined,
            viewer: undefined,
            scores: undefined,
        })
        expect(recipe).toEqual({ ...defaultRecipe, activePlayer: null, viewer: null, scores: null })
    })

    it('gives the same view for the same controls every time', () => {
        const args = recipeStory(scenario().players(4).activePlayer(3).viewer(1).recipe).args
        expect(buildScenario(recipeFromArgs({ ...args })).view).toEqual(
            buildScenario(recipeFromArgs({ ...args })).view,
        )
    })
})
