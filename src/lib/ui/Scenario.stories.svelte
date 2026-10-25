<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import { buildScenario, scenario, ScenarioError, type Recipe } from '#lib/game/scenario.js'
    import { recipeFromArgs, recipeStory } from '#lib/game/scenario-story.js'
    import ScenarioReadout from './ScenarioReadout.svelte'

    // A moment in a game from a recipe (spec #89), reached by playing the real game and shown
    // as the viewing seat's phone would get it. The controls are the recipe's fields.
    const { Story } = defineMeta({
        title: 'Game/Scenario',
        tags: ['autodocs'],
        parameters: { surface: 'paper' },
        ...recipeStory(),
    })

    /** The built moment, or the builder's error for a recipe the rules can't reach. */
    function build(args: Partial<Recipe>) {
        try {
            return { scenario: buildScenario(recipeFromArgs(args)), error: null }
        } catch (caught) {
            if (caught instanceof ScenarioError) return { scenario: null, error: caught.message }
            throw caught
        }
    }
</script>

{#snippet template(args: Partial<Recipe>)}
    {@const { scenario, error } = build(args)}
    {#if scenario}
        <ScenarioReadout
            view={scenario.view}
            absent={scenario.absent} />
    {:else}
        <p role="alert">{error}</p>
    {/if}
{/snippet}

<!-- Two players, the card waiting to be placed, seen from the active player. -->
<Story
    name="Placing"
    {template} />

<!-- The reader's phone: the only one with the card's text, here in Swedish. -->
<Story
    name="Reader in Swedish"
    args={scenario().players(3).activePlayer(2).viewer(1).cardLanguage('sv').recipe}
    {template} />

<Story
    name="Four players mid-game"
    args={scenario().players(4).activePlayer(2).unlocked(2).scores([7, 9, 8, 3]).recipe}
    {template} />

<Story
    name="Steal hand-off"
    args={scenario().players(4).step('stealing').missedSteal().recipe}
    {template} />

<Story
    name="Absent reader"
    args={scenario().players(3).activePlayer(2).absent([1]).recipe}
    {template} />

<!-- A recipe the rules can't reach shows the builder's error, naming the field. -->
<Story
    name="Impossible recipe"
    args={scenario().players(2).viewer(3).recipe}
    {template} />
