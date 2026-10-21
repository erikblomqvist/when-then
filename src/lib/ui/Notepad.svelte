<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Lined paper list, slightly askew. Put PlayerRow children inside. */
	let { title, meta, children }: { title: string; meta?: string; children: Snippet } = $props();
</script>

<div class="ui-notepad">
	<div class="ui-notepad__header">
		<span>{title}</span>
		{#if meta}<span>{meta}</span>{/if}
	</div>
	{@render children()}
</div>
