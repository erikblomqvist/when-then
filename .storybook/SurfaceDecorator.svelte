<script lang="ts">
    import type { Snippet } from 'svelte'

    let {
        surface = 'table',
        children,
    }: { surface?: 'table' | 'paper' | 'none'; children: Snippet } = $props()
</script>

{#if surface === 'table'}
    <div class="ui-table sb-surface"><div class="sb-pad">{@render children()}</div></div>
{:else if surface === 'paper'}
    <div class="ui-sheet sb-surface sb-sheet">{@render children()}</div>
{:else}
    {@render children()}
{/if}

<style>
    .sb-surface {
        min-height: 100vh;
        box-sizing: border-box;
    }
    .sb-pad {
        padding: 32px;
    }
    .sb-sheet {
        border-radius: 0;
        box-shadow: none;
    }
</style>
