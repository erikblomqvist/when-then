<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import CategoryDot from './CategoryDot.svelte';
	import Chip from './Chip.svelte';
	import Tabs from './Tabs.svelte';

	const { Story } = defineMeta({
		title: 'Controls/Chip and tabs',
		component: Chip,
		tags: ['autodocs']
	});

	const languages = [
		{ id: 'en', label: 'English' },
		{ id: 'sv', label: 'Svenska' },
		{ id: 'nb', label: 'Norsk' }
	];
</script>

<!-- The category draw result, shown as chips on the table. -->
<Story name="Chips">
	<div style="display: flex; gap: 8px; flex-wrap: wrap;">
		<Chip active><CategoryDot category="events" /> Events</Chip>
		<Chip>Reader's choice</Chip>
		<Chip>Free choice</Chip>
	</div>
</Story>

<Story name="Chips as buttons">
	<div style="display: flex; gap: 8px; flex-wrap: wrap;">
		<Chip active onclick={() => {}}>Standard</Chip>
		<Chip onclick={() => {}}>By month</Chip>
	</div>
</Story>

<Story name="Tabs" parameters={{ surface: 'paper' }}>
	<Tabs tabs={languages} selected="en" label="Card language" />
</Story>
