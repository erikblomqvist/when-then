<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLButtonAttributes } from 'svelte/elements'

    type Props = HTMLButtonAttributes & {
        /** primary: raised cream tile. ghost: secondary on the table (outline on paper). ink: dark emphasis. */
        variant?: 'primary' | 'ghost' | 'ink'
        size?: 'md' | 'lg'
        block?: boolean
        /** Renders a link that looks like the button, for navigation. */
        href?: string
        children: Snippet
    }

    let {
        variant = 'primary',
        size = 'md',
        block = false,
        type = 'button',
        href,
        class: className,
        children,
        ...rest
    }: Props = $props()

    const classes = $derived([
        'ui-button',
        variant !== 'primary' && `ui-button--${variant}`,
        size === 'lg' && 'ui-button--lg',
        block && 'ui-button--block',
        className,
    ])
</script>

{#if href}
    <a
        {href}
        class={classes}>
        {@render children()}
    </a>
{:else}
    <button
        {type}
        class={classes}
        {...rest}>
        {@render children()}
    </button>
{/if}
