<script lang="ts">
    import type { Snippet } from 'svelte'
    import { seatPoint, startingFrom, type Seating, type SeatedPlayer } from '../game/seating'

    /**
     * A round table seen from above, drawn from `me`'s seat: "You" at the bottom and the
     * player on your left to screen-left. Read-only; the host edits with SeatingEditor.
     */
    let {
        players,
        seating,
        me,
        size = 240,
        children,
    }: {
        players: readonly SeatedPlayer[]
        seating: Seating
        me: string
        size?: number
        /** Shown in the middle of the table. */
        children?: Snippet
    } = $props()

    const seats = $derived(startingFrom(seating, me))
    const name = (id: string) => players.find((p) => p.id === id)?.name ?? id
</script>

<div
    class={['seating-table', seats.length >= 8 && 'seating-table--compact']}
    style:width="{size}px"
    style:height="{size}px">
    <div class="seating-table__top">
        {#if children}{@render children()}{/if}
    </div>
    {#each seats as id, i (id)}
        {@const p = seatPoint(i, seats.length)}
        <span
            class={['ui-chip', 'seating-table__seat', id === me && 'ui-chip--active']}
            style:left="{p.x * 100}%"
            style:top="{p.y * 100}%">{id === me ? 'You' : name(id)}</span>
    {/each}
</div>

<style>
    .seating-table {
        position: relative;
        flex: none;
        margin-inline: auto;
    }
    .seating-table__top {
        position: absolute;
        inset: 26%;
        display: grid;
        place-items: center;
        border-radius: var(--radius-round);
        background: var(--surface-table-inset);
        box-shadow: var(--shadow-outline-on-table);
        text-align: center;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-table-muted);
    }
    .seating-table__seat {
        position: absolute;
        translate: -50% -50%;
        white-space: nowrap;
        transition:
            left var(--duration-fast) var(--ease-standard),
            top var(--duration-fast) var(--ease-standard);
    }
    .seating-table--compact .seating-table__seat {
        max-width: 64px;
        padding: 0 var(--space-3);
        font-size: var(--font-size-11);
    }
    @media (prefers-reduced-motion: reduce) {
        .seating-table__seat {
            transition: none;
        }
    }
</style>
