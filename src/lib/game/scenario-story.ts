// A recipe (`./scenario`) as Storybook args and controls, so a story's controls are the recipe's
// fields (spec #89). Each control comes from the field's shape, so a new recipe field shows up
// as a control once it has a URL spelling, with nothing to add here.

import type { ArgTypes } from '@storybook/sveltekit'
import { defaultRecipe, recipeFields, recipeShapes, type FieldShape, type Recipe } from './scenario'

/** A select's stand-in for null, as Storybook's options can't be null. */
const none = 'none'

/** The Storybook control for a field of `shape`. Lists are edited as JSON. */
function control(shape: FieldShape): ArgTypes[string] {
    if (shape.kind === 'number') return { control: 'number' }
    if (shape.kind === 'option') return { control: 'select', options: [...shape.options] }
    if (shape.kind === 'list') return { control: 'object' }
    const value = control(shape.value)
    return value.control === 'select'
        ? { ...value, options: [none, ...value.options!], mapping: { [none]: null } }
        : value
}

/** Story args at `recipe`, and a control for each of its fields. */
export function recipeStory(recipe: Recipe = defaultRecipe) {
    return {
        args: { ...recipe },
        argTypes: Object.fromEntries(
            recipeFields.map((field) => [field, control(recipeShapes[field])]),
        ) as Record<keyof Recipe, ArgTypes[string]>,
    }
}

/**
 * The recipe in a story's args. A cleared control is none for a field that can be, and the
 * default otherwise. Whether the rules can reach it is for `buildScenario` to say.
 */
export function recipeFromArgs(args: Partial<Recipe>): Recipe {
    return Object.fromEntries(
        recipeFields.map((field) => [
            field,
            args[field] ?? (recipeShapes[field].kind === 'nullable' ? null : defaultRecipe[field]),
        ]),
    ) as Recipe
}
