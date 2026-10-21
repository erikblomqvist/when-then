<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { HTMLButtonAttributes } from 'svelte/elements'

    type Props = HTMLButtonAttributes & {
        /** Required: the icon has no text. */
        label: string
        variant?: 'primary' | 'ghost' | 'ink'
        children: Snippet
    }

    let {
        label,
        variant = 'ghost',
        type = 'button',
        class: className,
        children,
        ...rest
    }: Props = $props()
</script>

<button
    {type}
    class={[
        'ui-button',
        'ui-icon-button',
        variant !== 'primary' && `ui-button--${variant}`,
        className,
    ]}
    aria-label={label}
    {...rest}>
    {@render children()}
</button>
