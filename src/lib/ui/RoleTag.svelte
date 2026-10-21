<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Small pill for a player's role, e.g. Host or Reader. */
	let { children }: { children: Snippet } = $props();
</script>

<span class="ui-role-tag">{@render children()}</span>
