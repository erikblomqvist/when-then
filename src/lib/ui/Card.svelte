<script lang="ts">
	import CategoryIcon from './CategoryIcon.svelte';
	import Stamp from './Stamp.svelte';
	import { categoryLabel, type Category, type CardSize } from './types';

	type Props = {
		/** Front: the reader sees the card text. Sleeve: everyone else sees a striped sleeve. Timeline: a placed card, year first. */
		face?: 'front' | 'sleeve' | 'timeline';
		category: Category;
		/** The card text (front face) or the small caption under the year (timeline face). */
		text?: string;
		/** Shown on the timeline face. A decade reads "1490s". */
		year?: string | number;
		/** Timeline face only. Locked and Unlocked show a stamp; anchor shows none and captions "Anchor year". */
		state?: 'locked' | 'unlocked' | 'anchor';
		/** Matte is at rest, glossy has the light sweep. */
		finish?: 'matte' | 'glossy';
		/** Picked up in hand, deep shadow. */
		lifted?: boolean;
		/** Neighbour of the insertion gap, raised slightly. */
		nudged?: boolean;
		/** Unlocked wobble intensity, grows with the number of unlocked cards. */
		wobble?: 1 | 2 | 3 | 4;
		/** Alternate between neighbours on the unlocked wobble. */
		lean?: 'left' | 'right';
		stampIn?: boolean;
		size?: CardSize;
		class?: string;
	};

	let {
		face = 'front',
		category,
		text = '',
		year,
		state,
		finish = face === 'timeline' ? 'matte' : 'glossy',
		lifted = false,
		nudged = false,
		wobble,
		lean = 'left',
		stampIn = false,
		size = 'lg',
		class: className
	}: Props = $props();

	const unlocked = $derived(face === 'timeline' && state === 'unlocked');
	const caption = $derived(state === 'anchor' ? text || 'Anchor year' : text);
</script>

<div
	class={[
		'ui-card',
		`ui-card--${size}`,
		`cat-${category}`,
		finish === 'matte' && 'ui-card--matte',
		finish === 'glossy' && 'ui-card--glossy',
		lifted && 'ui-card--lifted',
		nudged && 'ui-card--nudged',
		unlocked && 'ui-card--unlocked',
		unlocked && wobble && `ui-card--wobble-${wobble}`,
		className
	]}
	data-lean={unlocked ? lean : undefined}
>
	{#if face === 'timeline'}
		<div class="ui-card__face ui-card__face--timeline">
			{#if state === 'locked' || state === 'unlocked'}
				<Stamp variant={state} animateIn={stampIn} />
			{/if}
			<div class="ui-card__year">{year}</div>
			<div class="ui-card__caption">{caption}</div>
		</div>
	{:else}
		<div class="ui-card__face">
			<span class="ui-card__symbol"><CategoryIcon {category} /></span>
			{#if face === 'sleeve'}
				<div class="ui-card__sleeve">
					<div class="ui-card__mark">?</div>
					<div class="ui-card__category">{categoryLabel[category]}</div>
				</div>
			{:else}
				<div class="ui-card__text">{text}</div>
				<div class="ui-card__category">{categoryLabel[category]}</div>
			{/if}
		</div>
	{/if}
</div>
