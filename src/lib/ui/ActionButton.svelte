<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		/** The game action, e.g. "Lock in" or "Place". */
		label: string;
		/** Optional small count under the label, e.g. "3 cards". */
		count?: string;
		/** The icon. */
		children?: Snippet;
	};

	let { label, count, type = 'button', class: className, children, ...rest }: Props = $props();
</script>

<button {type} class={['ui-button', 'ui-action-button', className]} {...rest}>
	{#if children}{@render children()}{/if}
	<span>{label}</span>
	{#if count}<span class="ui-action-button__count">{count}</span>{/if}
</button>
