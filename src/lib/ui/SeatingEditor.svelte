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
    import { englishSeatingWords, type SeatingWords } from './seating-words'

    /**
     * The host's seating editor: a round table drawn from `anchor`'s seat, with "You" fixed at
     * the bottom. Drag a player onto another to swap them, or between two to move them there;
     * the others slide live to where they would end up. Letting go off the table cancels.
     * Without dragging, tap (or press Enter on) one player and then another to swap them.
     * Three players can only sit two ways round, so the editor is then just Reverse.
     * Start it from any seating (join order, or later a compass guess) and bind `seating`.
     */
    let {
        players,
        seating = $bindable(),
        anchor,
        size = 260,
        words = englishSeatingWords,
    }: {
        players: readonly SeatedPlayer[]
        seating: Seating
        /** The player holding the phone. Stays at the bottom and can't be dragged. */
        anchor: string
        size?: number
        words?: SeatingWords
    } = $props()

    // How far above the finger the lifted name is drawn, so the finger doesn't hide it.
    const lift = 22
    // How far a finger must move, in pixels, before letting go is a drop rather than a tap.
    const slop = 6

    const seats = $derived(startingFrom(seating, anchor))
    // From four players on, the host moves people; with three only Reverse changes anything.
    const movable = $derived(seats.length > 3)
    let history = $state<Seating[]>([])
    let table = $state<HTMLElement>()
    // The dragged player, the finger dragging them, and where their name is, in fractions of the
    // table box. Other fingers on the screen are ignored, so a second touch can't steal the drag.
    let drag = $state<{
        id: string
        pointer: number
        x: number
        y: number
        from: { x: number; y: number }
        moved: boolean
    }>()
    // The player tapped first, waiting for the one to swap with. Gone if they leave the table.
    let pendingSwap = $state<string>()
    const picked = $derived(pendingSwap && seats.includes(pendingSwap) ? pendingSwap : undefined)
    // The name only lifts off its seat once the finger moves, so a tap stays on the button.
    const lifted = $derived(drag?.moved ? drag : undefined)
    // A drag that let go over its own name still ends in a click, which isn't a tap.
    let swallowClick = false

    const name = (id: string) => players.find((p) => p.id === id)?.name ?? id
    const you = (id: string) => (id === anchor ? words.youObject : name(id))

    const target = $derived.by((): SeatTarget | undefined => {
        if (!lifted) return undefined
        const t = seatTargetAt(lifted.x, lifted.y, seats.length)
        const from = seats.indexOf(lifted.id)
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
    const preview = $derived(lifted && target ? apply(lifted.id, target) : seats)

    const status = $derived.by(() => {
        if (lifted) {
            const who = name(lifted.id)
            if (!target) return words.letGoToCancel
            if (target.kind === 'seat') return words.swap(who, name(seats[target.seat]))
            const after = seats[target.after]
            return words.moveBetween(who, you(after), you(leftOf(seats, after)))
        }
        if (picked) return words.pickSwap(name(picked))
        if (seats.length === 2) return words.acrossFromYou(name(seats[1]))
        if (seats.length > 2)
            return words.yourNeighbours(name(leftOf(seats, anchor)), name(rightOf(seats, anchor)))
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
        if (drag) return
        swallowClick = false
        drag = {
            id,
            pointer: e.pointerId,
            ...point(e),
            from: { x: e.clientX, y: e.clientY },
            moved: false,
        }
    }
    function move(e: PointerEvent) {
        if (drag?.pointer !== e.pointerId) return
        Object.assign(drag, point(e))
        drag.moved ||= Math.hypot(e.clientX - drag.from.x, e.clientY - drag.from.y) > slop
    }
    function drop(e: PointerEvent) {
        if (drag?.pointer !== e.pointerId) return
        // A finger that stayed put is a tap, left to the click that follows.
        if (target) commit(apply(drag.id, target))
        swallowClick = drag.moved
        drag = undefined
    }
    function cancel(e: PointerEvent) {
        if (drag?.pointer === e.pointerId) drag = undefined
    }

    // Tap one player, then another to swap them; tap the first again to put them down.
    // A keyboard press (no pointer, so `detail` 0) is always a tap, and a second finger tapping
    // while another drags is ignored.
    function tap(e: MouseEvent, id: string) {
        const swallow = swallowClick && e.detail !== 0
        swallowClick = false
        if (swallow || drag) return
        if (!picked) pendingSwap = id
        else if (picked === id) pendingSwap = undefined
        else commit(swapSeats(seats, picked, id))
    }

    function commit(next: Seating) {
        history.push(seating)
        seating = next
        pendingSwap = undefined
    }
    function undo() {
        seating = history.pop() ?? seating
    }
</script>

<!-- Listen on the window: seats move in the DOM while dragging, which would drop a pointer capture. -->
<svelte:window
    onpointermove={move}
    onpointerup={drop}
    onpointercancel={cancel}
    onkeydown={(e) => {
        if (e.key === 'Escape') pendingSwap = undefined
    }} />

<div class="seating-editor">
    <div
        class={['seating-editor__table', seats.length >= 8 && 'seating-editor__table--compact']}
        bind:this={table}
        style:width="{size}px"
        style:height="{size}px">
        <div class="seating-editor__top">{words.turnsGoLeft}</div>
        <!-- Stable DOM order, so dragging never reorders the elements under the pointer. -->
        {#each seats.toSorted() as id (id)}
            {@const dragging = lifted?.id === id}
            {@const p = seatPoint(preview.indexOf(id), preview.length)}
            {#if dragging}
                <span
                    class="ui-chip seating-editor__ghost"
                    style:left="{p.x * 100}%"
                    style:top="{p.y * 100}%">{name(id)}</span>
            {/if}
            {#if id === anchor || !movable}
                <span
                    class={['ui-chip', id === anchor && 'ui-chip--active', 'seating-editor__seat']}
                    style:left="{p.x * 100}%"
                    style:top="{p.y * 100}%">{id === anchor ? words.you : name(id)}</span>
            {:else}
                <button
                    type="button"
                    class={[
                        'ui-chip',
                        'seating-editor__seat',
                        dragging && 'seating-editor__seat--dragging',
                        picked === id && 'seating-editor__seat--picked',
                        target?.kind === 'seat' &&
                            seats[target.seat] === id &&
                            'seating-editor__seat--target',
                    ]}
                    style:left="{(dragging ? lifted!.x : p.x) * 100}%"
                    style:top="{(dragging ? lifted!.y : p.y) * 100}%"
                    aria-pressed={picked === id}
                    onpointerdown={(e) => start(e, id)}
                    onclick={(e) => tap(e, id)}>{name(id)}</button>
            {/if}
        {/each}
    </div>
    <p
        class="seating-editor__status"
        aria-live="polite">
        {status}
    </p>
    <div class="seating-editor__tools">
        {#if movable}
            <Button
                variant="ghost"
                disabled={!history.length}
                onclick={undo}>{words.undo}</Button>
        {/if}
        {#if seats.length > 2}
            <Button
                variant="ghost"
                onclick={() => commit(reversed(seats, anchor))}>{words.reverse}</Button>
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
        padding: var(--space-3);
        text-wrap: balance;
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
    .seating-editor__seat--dragging,
    .seating-editor__seat--picked {
        color: var(--text-on-paper);
        background: var(--surface-paper-bright);
        box-shadow: var(--shadow-paper-raised);
    }
    .seating-editor__seat--dragging {
        z-index: 1;
        scale: 1.1;
        cursor: grabbing;
        transition: none;
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
