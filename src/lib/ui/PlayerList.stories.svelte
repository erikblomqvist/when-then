<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import Notepad from './Notepad.svelte';
	import NumberBadge from './NumberBadge.svelte';
	import PlayerRow from './PlayerRow.svelte';

	const { Story } = defineMeta({
		title: 'Players/Player list',
		component: Notepad,
		tags: ['autodocs']
	});
</script>

<!-- The lobby: joined players in seating order, with the host marked. -->
<Story name="Lobby" asChild>
	<div style="max-width: 360px;">
		<Notepad title="Players" meta="3 of 8">
			<PlayerRow number={1} name="Astrid" role="Host" />
			<PlayerRow number={2} name="Bjørn" role="You" />
			<PlayerRow number={3} name="Cecilia" />
			<PlayerRow number={4} />
		</Notepad>
	</div>
</Story>

<Story name="Number badges" asChild>
	<div style="display: flex; gap: 12px; align-items: center;">
		<NumberBadge value={1} />
		<NumberBadge value={2} />
		<NumberBadge value={12} />
		<NumberBadge empty />
	</div>
</Story>
