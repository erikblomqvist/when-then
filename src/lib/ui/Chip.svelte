<script lang="ts">
    import type { Snippet } from 'svelte'

    /** A pill on the table. Active gives the paper (selected) look. Becomes a button when `onclick` is given. */
    let {
        active = false,
        onclick,
        children,
    }: { active?: boolean; onclick?: (e: MouseEvent) => void; children: Snippet } = $props()
</script>

{#if onclick}
    <button
        type="button"
        class={['ui-chip', active && 'ui-chip--active']}
        aria-pressed={active}
        {onclick}>
        {@render children()}
    </button>
{:else}
    <span class={['ui-chip', active && 'ui-chip--active']}>{@render children()}</span>
{/if}
