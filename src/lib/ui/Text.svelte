<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Role = 'display' | 'heading-1' | 'heading-2' | 'body' | 'label' | 'caption' | 'error';

	const defaultTag: Record<Role, string> = {
		display: 'h1',
		'heading-1': 'h1',
		'heading-2': 'h2',
		body: 'p',
		label: 'span',
		caption: 'span',
		error: 'p'
	};

	let {
		role = 'body',
		as,
		class: className,
		children,
		...rest
	}: HTMLAttributes<HTMLElement> & { role?: Role; as?: string; children: Snippet } = $props();
</script>

<svelte:element this={as ?? defaultTag[role]} class={[`ui-${role}`, className]} {...rest}>
	{@render children()}
</svelte:element>
