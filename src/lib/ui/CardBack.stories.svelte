<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import CardBack from './CardBack.svelte';

	const { Story } = defineMeta({
		title: 'Cards/Card back',
		component: CardBack,
		tags: ['autodocs'],
		args: { size: 'lg' },
		argTypes: { size: { control: 'radio', options: ['sm', 'md', 'lg', 'xl'] } }
	});
</script>

<Story name="Deck" />
