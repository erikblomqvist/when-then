<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		/** primary: raised cream tile. ghost: secondary on the table (outline on paper). ink: dark emphasis. */
		variant?: 'primary' | 'ghost' | 'ink';
		size?: 'md' | 'lg';
		block?: boolean;
		children: Snippet;
	};

	let {
		variant = 'primary',
		size = 'md',
		block = false,
		type = 'button',
		class: className,
		children,
		...rest
	}: Props = $props();
</script>

<button
	{type}
	class={[
		'ui-button',
		variant !== 'primary' && `ui-button--${variant}`,
		size === 'lg' && 'ui-button--lg',
		block && 'ui-button--block',
		className
	]}
	{...rest}
>
	{@render children()}
</button>
