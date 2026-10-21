<script lang="ts">
    import {
        leftOf,
        moveToLeftOf,
        reversed,
        rightOf,
        seatPoint,
        seatTargetAt,
        startingFrom,
        swapSeats,
        type Seating,
        type SeatedPlayer,
        type SeatTarget,
    } from '../game/seating'
    import Button from './Button.svelte'

    /**
     * The host's seating editor: a round table drawn from `anchor`'s seat, with "You" fixed at
     * the bottom. Drag a player onto another to swap them, or between two to move them there;
     * the others slide live to where they would end up. Letting go off the table cancels.
     * Start it from any seating (join order, or later a compass guess) and bind `seating`.
     */
    let {
        players,
        seating = $bindable(),
        anchor,
        size = 260,
    }: {
        players: readonly SeatedPlayer[]
        seating: Seating
        /** The player holding the phone. Stays at the bottom and can't be dragged. */
        anchor: string
        size?: number
    } = $props()

    // How far above the finger the lifted name is drawn, so the finger doesn't hide it.
    const lift = 44

    const seats = $derived(startingFrom(seating, anchor))
    let history = $state<Seating[]>([])
    let table = $state<HTMLElement>()
    // The dragged player and where their name is, in fractions of the table box.
    let drag = $state<{ id: string; x: number; y: number }>()

    const name = (id: string) => players.find((p) => p.id === id)?.name ?? id
    const you = (id: string) => (id === anchor ? 'you' : name(id))

    const target = $derived.by((): SeatTarget | undefined => {
        if (!drag) return undefined
        const t = seatTargetAt(drag.x, drag.y, seats.length)
        const from = seats.indexOf(drag.id)
        const n = seats.length
        if (!t) return undefined
        // The anchor stays put, and gaps next to the dragged player would change nothing.
        if (t.kind === 'seat' && (t.seat === 0 || t.seat === from)) return undefined
        if (t.kind === 'gap' && (t.after === from || (t.after + 1) % n === from)) return undefined
        return t
    })

    function apply(id: string, t: SeatTarget): string[] {
        return t.kind === 'seat'
            ? swapSeats(seats, id, seats[t.seat])
            : moveToLeftOf(seats, id, seats[t.after])
    }

    // What the table would look like if the name were dropped now.
    const preview = $derived(drag && target ? apply(drag.id, target) : seats)

    const status = $derived.by(() => {
        if (drag) {
            const who = name(drag.id)
            if (!target) return 'Let go off the table to cancel'
            if (target.kind === 'seat') return `Swap ${who} and ${name(seats[target.seat])}`
            const after = seats[target.after]
            return `Move ${who} between ${you(after)} and ${you(leftOf(seats, after))}`
        }
        if (seats.length === 2) return `${name(seats[1])} sits across from you.`
        if (seats.length > 2)
            return `${name(leftOf(seats, anchor))} is on your left, ${name(rightOf(seats, anchor))} on your right.`
        return ''
    })

    function point(e: PointerEvent) {
        const box = table!.getBoundingClientRect()
        return {
            x: (e.clientX - box.left) / box.width,
            y: (e.clientY - box.top - lift) / box.height,
        }
    }

    function start(e: PointerEvent, id: string) {
        e.preventDefault()
        drag = { id, ...point(e) }
    }
    function move(e: PointerEvent) {
        if (drag) Object.assign(drag, point(e))
    }
    function drop() {
        if (drag && target) commit(apply(drag.id, target))
        drag = undefined
    }

    function commit(next: Seating) {
        history.push(seating)
        seating = next
    }
    function undo() {
        seating = history.pop() ?? seating
    }
</script>

<!-- Listen on the window: seats move in the DOM while dragging, which would drop a pointer capture. -->
<svelte:window
    onpointermove={move}
    onpointerup={drop}
    onpointercancel={() => (drag = undefined)} />

<div class="seating-editor">
    <div
        class={['seating-editor__table', seats.length >= 8 && 'seating-editor__table--compact']}
        bind:this={table}
        style:width="{size}px"
        style:height="{size}px">
        <div class="seating-editor__top">Turns go<br />to the left</div>
        <!-- Stable DOM order, so dragging never reorders the elements under the pointer. -->
        {#each seats.toSorted() as id (id)}
            {@const dragging = drag?.id === id}
            {@const p = seatPoint(preview.indexOf(id), preview.length)}
            {#if dragging}
                <span
                    class="ui-chip seating-editor__ghost"
                    style:left="{p.x * 100}%"
                    style:top="{p.y * 100}%">{name(id)}</span>
            {/if}
            {#if id === anchor}
                <span
                    class="ui-chip ui-chip--active seating-editor__seat"
                    style:left="{p.x * 100}%"
                    style:top="{p.y * 100}%">You</span>
            {:else}
                <button
                    type="button"
                    class={[
                        'ui-chip',
                        'seating-editor__seat',
                        dragging && 'seating-editor__seat--dragging',
                        target?.kind === 'seat' &&
                            seats[target.seat] === id &&
                            'seating-editor__seat--target',
                    ]}
                    style:left="{(dragging ? drag!.x : p.x) * 100}%"
                    style:top="{(dragging ? drag!.y : p.y) * 100}%"
                    onpointerdown={(e) => start(e, id)}>{name(id)}</button>
            {/if}
        {/each}
    </div>
    <p
        class="seating-editor__status"
        aria-live="polite">
        {status}
    </p>
    <div class="seating-editor__tools">
        <Button
            variant="ghost"
            disabled={!history.length}
            onclick={undo}>Undo</Button>
        {#if seats.length > 2}
            <Button
                variant="ghost"
                onclick={() => commit(reversed(seats, anchor))}>Reverse</Button>
        {/if}
    </div>
</div>

<style>
    .seating-editor {
        display: grid;
        gap: var(--space-5);
        justify-items: center;
    }
    .seating-editor__table {
        position: relative;
    }
    .seating-editor__top {
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
    .seating-editor__seat,
    .seating-editor__ghost {
        position: absolute;
        translate: -50% -50%;
        white-space: nowrap;
    }
    .seating-editor__seat {
        height: 40px;
        touch-action: none;
        user-select: none;
        cursor: grab;
        transition:
            left var(--duration-fast) var(--ease-standard),
            top var(--duration-fast) var(--ease-standard);
    }
    span.seating-editor__seat {
        cursor: default;
    }
    .seating-editor__table--compact .seating-editor__seat,
    .seating-editor__table--compact .seating-editor__ghost {
        max-width: 64px;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 0 var(--space-3);
        font-size: var(--font-size-11);
    }
    .seating-editor__seat--dragging {
        z-index: 1;
        scale: 1.1;
        cursor: grabbing;
        transition: none;
        color: var(--text-on-paper);
        background: var(--surface-paper-bright);
        box-shadow: var(--shadow-paper-raised);
    }
    .seating-editor__seat--target {
        color: var(--text-on-paper);
        background: var(--surface-paper-sunken);
    }
    .seating-editor__ghost {
        height: 40px;
        color: transparent;
        background: none;
        box-shadow: none;
        outline: 1.5px dashed var(--text-on-table-strong);
        outline-offset: -1.5px;
        pointer-events: none;
    }
    .seating-editor__status {
        min-height: 2.9em;
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        font-weight: var(--font-weight-semibold);
        line-height: 1.45;
        text-align: center;
        color: var(--text-on-table-secondary);
    }
    .seating-editor__tools {
        display: flex;
        gap: var(--space-3);
    }
    @media (prefers-reduced-motion: reduce) {
        .seating-editor__seat {
            transition: none;
        }
    }
</style>
