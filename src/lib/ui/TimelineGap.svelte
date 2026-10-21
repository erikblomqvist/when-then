<script lang="ts">
    /** The insertion point between two slots. Opens when selected. */
    let {
        selected = false,
        label = 'Place here',
        onselect,
    }: { selected?: boolean; label?: string; onselect?: () => void } = $props()
</script>

{#if onselect}
    <button
        type="button"
        class={['ui-timeline__gap', selected && 'ui-timeline__gap--selected']}
        aria-label={label}
        aria-pressed={selected}
        onclick={onselect}></button>
{:else}
    <div class={['ui-timeline__gap', selected && 'ui-timeline__gap--selected']}></div>
{/if}

<style>
    button.ui-timeline__gap {
        padding: 0;
        border: none;
        background: transparent;
        cursor: pointer;
    }
    button.ui-timeline__gap:focus-visible {
        outline: 3px solid var(--focus-ring-color);
        outline-offset: 4px;
        border-radius: 11px;
    }
</style>
