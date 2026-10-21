<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import { categoryColours, categoryIcons } from '../categories/look'
    import CategoryDot from './CategoryDot.svelte'
    import CategoryLegendItem from './CategoryLegendItem.svelte'
    import { sampleCategories } from './types'

    // Badges render from category data (name, icon, colour), as managed on the admin's
    // categories page. These are made-up samples in the seed's looks.
    const { Story } = defineMeta({
        title: 'Category/Badges',
        component: CategoryDot,
        tags: ['autodocs'],
        args: { category: sampleCategories.events },
        argTypes: {
            category: {
                control: 'select',
                options: Object.keys(sampleCategories),
                mapping: sampleCategories,
            },
        },
    })

    const samples = Object.values(sampleCategories)
</script>

<Story name="Dot" />

<Story
    name="Dots"
    asChild>
    <div style="display: flex; gap: 12px;">
        {#each samples as category (category.name)}
            <CategoryDot {category} />
        {/each}
    </div>
</Story>

<Story
    name="Legend"
    parameters={{ surface: 'paper' }}
    asChild>
    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
        {#each samples as category (category.name)}
            <CategoryLegendItem {category} />
        {/each}
    </div>
</Story>

<!-- Every colour a category can pick, each with a different icon. -->
<Story
    name="Palette"
    asChild>
    <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        {#each categoryColours as colour, index (colour)}
            <CategoryDot
                category={{ name: colour, colour, icon: categoryIcons[index] ?? 'flag' }} />
        {/each}
    </div>
</Story>

<!-- The curated icon set a category picks from. -->
<Story
    name="Icons"
    asChild>
    <div style="display: flex; gap: 12px; flex-wrap: wrap; max-width: 320px;">
        {#each categoryIcons as icon (icon)}
            <CategoryDot category={{ name: icon, colour: 'blue', icon }} />
        {/each}
    </div>
</Story>
