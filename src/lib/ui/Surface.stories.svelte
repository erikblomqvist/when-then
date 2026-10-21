<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import Button from './Button.svelte';
	import Surface from './Surface.svelte';
	import Text from './Text.svelte';

	const { Story } = defineMeta({
		title: 'Foundations/Surfaces',
		component: Surface,
		tags: ['autodocs'],
		parameters: { surface: 'none' }
	});
</script>

<Story name="Table with grain">
	<Surface kind="table" grain style="min-height: 100vh; padding: 32px;">
		<Text role="heading-1">When Then?</Text>
		<Text role="body">The game table, with the felt grain texture.</Text>
	</Surface>
</Story>

<Story name="Paper, sheet and panel">
	<Surface kind="table" style="min-height: 100vh; padding: 32px; display: grid; gap: 24px; align-content: start;">
		<Surface kind="paper"><Text role="heading-2">Paper</Text><Text role="caption">A paper card on the table.</Text></Surface>
		<Surface kind="sheet"><Text role="heading-2">Sheet</Text><Text role="caption">A full overlay sheet.</Text></Surface>
		<Surface kind="panel">
			<Text role="heading-2">Panel</Text>
			<Text role="caption">A centred dialog, e.g. results.</Text>
			<Button variant="ink">Play again</Button>
		</Surface>
	</Surface>
</Story>

<Story name="Veil">
	<Surface kind="table" style="position: relative; min-height: 100vh; padding: 32px;">
		<Text role="heading-1">Behind the veil</Text>
		<Surface kind="veil" />
	</Surface>
</Story>
