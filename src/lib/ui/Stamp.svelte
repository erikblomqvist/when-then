<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Rubber-stamp label on a timeline face. Locked is solid, Unlocked is dashed. */
	let {
		variant = 'locked',
		animateIn = false,
		children
	}: { variant?: 'locked' | 'unlocked'; animateIn?: boolean; children?: Snippet } = $props();
</script>

<div
	class={['ui-stamp', variant === 'unlocked' && 'ui-stamp--dashed', animateIn && 'ui-stamp--animate-in']}
>
	{#if children}{@render children()}{:else}{variant === 'locked' ? 'Locked' : 'Unlocked'}{/if}
</div>
