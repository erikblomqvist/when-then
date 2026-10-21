<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * A player's timeline: a row of slots and gaps on an axis, in a tray.
	 * Static flex layout; drag, keyboard and centring behaviour is up to the game screen.
	 */
	let {
		startLabel = '← Earlier',
		endLabel = 'Later →',
		tray = true,
		children
	}: { startLabel?: string; endLabel?: string; tray?: boolean; children: Snippet } = $props();
</script>

<div class={[tray && 'ui-tray']}>
	<div class="ui-timeline">
		{@render children()}
		<div class="ui-timeline__axis">
			<span class="ui-timeline__axis-label ui-timeline__axis-label--start">{startLabel}</span>
			<span class="ui-timeline__axis-label ui-timeline__axis-label--end">{endLabel}</span>
		</div>
	</div>
</div>
