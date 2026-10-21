<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import CategoryDot from './CategoryDot.svelte';
	import CategoryLegendItem from './CategoryLegendItem.svelte';
	import { categories } from './types';

	const { Story } = defineMeta({
		title: 'Category/Badges',
		component: CategoryDot,
		tags: ['autodocs']
	});
</script>

<Story name="Dots">
	<div style="display: flex; gap: 12px;">
		{#each categories as category (category)}
			<CategoryDot {category} />
		{/each}
	</div>
</Story>

<Story name="Legend" parameters={{ surface: 'paper' }}>
	<div style="display: flex; gap: 16px; flex-wrap: wrap;">
		{#each categories as category (category)}
			<CategoryLegendItem {category} />
		{/each}
	</div>
</Story>
