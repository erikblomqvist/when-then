<script module lang="ts">
	import { defineMeta } from '@storybook/sveltekit';
	import Card from './Card.svelte';
	import CardBack from './CardBack.svelte';
	import Timeline from './Timeline.svelte';
	import TimelineGap from './TimelineGap.svelte';
	import TimelineSlot from './TimelineSlot.svelte';

	const { Story } = defineMeta({
		title: 'Timeline/Timeline',
		component: Timeline,
		tags: ['autodocs']
	});
</script>

<!-- A timeline at the start of a game: only the anchor year. -->
<Story name="Only the anchor">
	<Timeline>
		<TimelineSlot><Card face="timeline" category="events" year={1969} state="anchor" /></TimelineSlot>
	</Timeline>
</Story>

<!-- Mid-turn: two locked cards, one unlocked card and the insertion gap open between neighbours. -->
<Story name="Placing a card">
	<Timeline>
		<TimelineSlot>
			<Card face="timeline" category="people" year="1490s" text="Columbus reaches America" state="locked" />
		</TimelineSlot>
		<TimelineSlot><Card face="timeline" category="events" year={1789} state="anchor" /></TimelineSlot>
		<TimelineGap />
		<TimelineSlot>
			<Card face="timeline" category="inventions" year={1876} text="The telephone is patented" state="unlocked" wobble={1} nudged />
		</TimelineSlot>
		<TimelineGap selected onselect={() => {}} />
		<TimelineSlot>
			<Card face="timeline" category="events" year={1989} text="The Berlin Wall falls" state="locked" nudged />
		</TimelineSlot>
		<TimelineGap />
	</Timeline>
</Story>

<Story name="With the deck">
	<div style="display: flex; gap: 24px; align-items: center;">
		<CardBack size="md" />
		<Timeline>
			<TimelineSlot><Card face="timeline" category="places" year={1952} state="anchor" /></TimelineSlot>
			<TimelineSlot>
				<Card face="timeline" category="events" year={2001} text="Wikipedia launches" state="locked" />
			</TimelineSlot>
		</Timeline>
	</div>
</Story>
