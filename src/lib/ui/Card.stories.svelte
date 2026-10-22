<script
    module
    lang="ts">
    import { defineMeta } from '@storybook/sveltekit'
    import Card from './Card.svelte'
    import { sampleCategories } from './types'

    const { Story } = defineMeta({
        title: 'Cards/Card',
        component: Card,
        tags: ['autodocs'],
        args: {
            face: 'front',
            category: sampleCategories.events,
            text: 'The Berlin Wall falls',
            size: 'lg',
        },
        argTypes: {
            // Pick one of the sample categories by key; real ones come from the database.
            category: {
                control: 'select',
                options: Object.keys(sampleCategories),
                mapping: sampleCategories,
            },
            face: { control: 'radio', options: ['front', 'sleeve', 'timeline'] },
            state: { control: 'radio', options: [undefined, 'locked', 'unlocked', 'anchor'] },
            finish: { control: 'radio', options: ['matte', 'glossy'] },
            size: { control: 'radio', options: ['sm', 'md', 'lg', 'xl'] },
            wobble: { control: 'radio', options: [undefined, 1, 2, 3, 4] },
        },
    })
</script>

<!-- What the reader sees: the card text, never the year. -->
<Story name="Front" />

<!-- What everyone else sees before the card is placed. -->
<Story
    name="Sleeve"
    args={{ face: 'sleeve' }} />

<Story
    name="Lifted (in hand)"
    args={{ lifted: true }} />

<!-- A placed, permanently locked card. The year is the hero. -->
<Story
    name="Timeline locked"
    args={{ face: 'timeline', year: 1989, text: 'The Berlin Wall falls', state: 'locked' }} />

<!-- Placed correctly this turn, lost if the next play misses. -->
<Story
    name="Timeline unlocked"
    args={{
        face: 'timeline',
        category: sampleCategories.inventions,
        year: 1876,
        text: 'The telephone is patented',
        state: 'unlocked',
        wobble: 2,
    }} />

<!-- Before 1500 cards are placed by decade. -->
<Story
    name="Timeline decade"
    args={{
        face: 'timeline',
        category: sampleCategories.people,
        year: '1490s',
        text: 'Columbus reaches America',
        state: 'locked',
    }} />

<!-- The random starting point on every timeline. Not a card, worth no points. -->
<Story
    name="Anchor year"
    args={{ face: 'timeline', category: sampleCategories.places, year: 1952, state: 'anchor' }} />

<Story
    name="All categories"
    asChild>
    <div style="display: flex; gap: 24px; flex-wrap: wrap;">
        {#each Object.values(sampleCategories) as category (category.name)}
            <Card
                {category}
                text={`A card in ${category.name}`} />
        {/each}
    </div>
</Story>

<Story
    name="Sizes"
    asChild>
    <div style="display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap;">
        <Card
            size="sm"
            category={sampleCategories.events}
            text="Small" />
        <Card
            size="md"
            category={sampleCategories.people}
            text="Medium" />
        <Card
            size="lg"
            category={sampleCategories.inventions}
            text="Large" />
        <Card
            size="xl"
            category={sampleCategories.places}
            text="Extra large" />
    </div>
</Story>
