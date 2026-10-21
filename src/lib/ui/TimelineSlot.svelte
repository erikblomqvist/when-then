<script lang="ts">
	import type { Snippet } from 'svelte';

	/** One position on the timeline, holding a card, with a tick mark underneath. */
	let { children }: { children: Snippet } = $props();
</script>

<div class="ui-timeline__slot">{@render children()}</div>
