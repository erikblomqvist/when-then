<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import Card from './Card.svelte';
	import { categories } from './types';

	const { Story } = defineMeta({
		title: 'Cards/Card',
		component: Card,
		tags: ['autodocs'],
		args: { face: 'front', category: 'events', text: 'The Berlin Wall falls', size: 'lg' },
		argTypes: {
			category: { control: 'select', options: categories },
			face: { control: 'radio', options: ['front', 'sleeve', 'timeline'] },
			state: { control: 'radio', options: [undefined, 'locked', 'unlocked', 'anchor'] },
			finish: { control: 'radio', options: ['matte', 'glossy'] },
			size: { control: 'radio', options: ['sm', 'md', 'lg', 'xl'] },
			wobble: { control: 'radio', options: [undefined, 1, 2, 3, 4] }
		}
	});
</script>

<!-- What the reader sees: the card text, never the year. -->
<Story name="Front" />

<!-- What everyone else sees before the card is placed. -->
<Story name="Sleeve" args={{ face: 'sleeve' }} />

<Story name="Lifted (in hand)" args={{ lifted: true }} />

<!-- A placed, permanently locked card. The year is the hero. -->
<Story
	name="Timeline locked"
	args={{ face: 'timeline', year: 1989, text: 'The Berlin Wall falls', state: 'locked' }}
/>

<!-- Placed correctly this turn, lost if the next play misses. -->
<Story
	name="Timeline unlocked"
	args={{
		face: 'timeline',
		category: 'inventions',
		year: 1876,
		text: 'The telephone is patented',
		state: 'unlocked',
		wobble: 2
	}}
/>

<!-- Before 1500 cards are placed by decade. -->
<Story
	name="Timeline decade"
	args={{ face: 'timeline', category: 'people', year: '1490s', text: 'Columbus reaches America', state: 'locked' }}
/>

<!-- The random starting point on every timeline. Not a card, worth no points. -->
<Story name="Anchor year" args={{ face: 'timeline', category: 'places', year: 1952, state: 'anchor' }} />

<Story name="All categories">
	<div style="display: flex; gap: 24px; flex-wrap: wrap;">
		{#each categories as category (category)}
			<Card {category} text={`A card in ${category}`} />
		{/each}
	</div>
</Story>

<Story name="Sizes">
	<div style="display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap;">
		<Card size="sm" category="events" text="Small" />
		<Card size="md" category="people" text="Medium" />
		<Card size="lg" category="inventions" text="Large" />
		<Card size="xl" category="places" text="Extra large" />
	</div>
</Story>
