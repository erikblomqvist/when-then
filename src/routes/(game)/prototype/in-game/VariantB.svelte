<script
    module
    lang="ts">
    export const name = 'Ledger (vertical)'
</script>

<script lang="ts">
    // PROTOTYPE (#16), variant B: the timeline runs down the screen, earlier at the top, so a
    // long one scrolls the natural way on a phone. Every player sits in a rail along the top with
    // their score, one tap from their timeline, and the card waits in a dock at the bottom.
    import BookOpen from '@lucide/svelte/icons/book-open'
    import Hand from '@lucide/svelte/icons/hand'
    import { tick } from 'svelte'
    import {
        Button,
        Card,
        CategoryDot,
        CategoryIcon,
        Chip,
        NumberBadge,
        PlayerIcon,
        Stamp,
        Surface,
        Text,
    } from '#lib'
    import {
        actorOf,
        cardInPlay,
        drawLabel,
        focusOf,
        latestOutcome,
        look,
        nameOf,
        outcomeKey,
        player,
        playOf,
        roleOf,
        shown,
        unlockedCount,
        year,
        type VariantProps,
    } from './lib'

    let { view, dispatch }: VariantProps = $props()

    const play = $derived(playOf(view))
    const role = $derived(roleOf(view))
    const focus = $derived(focusOf(view))
    const card = $derived(cardInPlay(view))
    const me = $derived(view.seat)
    const outcome = $derived(latestOutcome(view))
    const activeId = $derived(view.phase.name === 'playing' ? view.phase.activeId : null)

    // Whose timeline is open: the one in play until the player taps someone else.
    let picked = $state<string | null>(null)
    let slot = $state<number | null>(null)
    $effect.pre(() => {
        void outcomeKey(view)
        void play?.step
        void focus
        picked = null
        slot = null
    })
    const viewing = $derived(picked ?? focus ?? me)
    const timeline = $derived(view.timelines[viewing] ?? [])
    const placing = $derived(
        viewing === me &&
            ((play?.step === 'placing' && role === 'active') ||
                (play?.step === 'stealing' && role === 'stealer')),
    )

    let ledger = $state<HTMLElement>()
    async function choose(gap: number) {
        slot = slot === gap ? null : gap
        await tick()
        ledger?.querySelector('.ghost')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    function place() {
        if (slot === null || !play) return
        dispatch(
            play.step === 'stealing'
                ? { type: 'steal', by: me, slot }
                : { type: 'place', by: me, slot },
        )
    }

    const between = $derived.by(() => {
        if (slot === null) return ''
        const before = timeline[slot - 1]
        const after = timeline[slot]
        if (!before) return `Before ${year(after.date)}`
        if (!after) return `After ${year(before.date)}`
        return `Between ${year(before.date)} and ${year(after.date)}`
    })

    const status = $derived.by(() => {
        if (!play || !activeId) return 'Game over'
        const active = nameOf(view, activeId)
        const reader = nameOf(view, play.readerId)
        switch (play.step) {
            case 'picking':
                return `${nameOf(view, play.pickerId)} ${play.pickerId === me ? 'pick' : 'picks'} a category`
            case 'placing':
                return `${active} ${activeId === me ? 'place' : 'places'} · ${reader} ${play.readerId === me ? 'read' : 'reads'}`
            case 'deciding':
                return `${active} ${activeId === me ? 'decide' : 'decides'}: lock in or go on`
            case 'stealing':
                return `${nameOf(view, play.stealerId)} ${play.stealerId === me ? 'steal' : 'steals'}`
        }
    })
</script>

<Surface
    kind="table"
    grain
    class="variant-b">
    <nav
        class="rail"
        aria-label="Players">
        {#each view.seating as id (id)}
            {@const p = player(view, id)}
            <button
                type="button"
                class={['seat', id === viewing && 'viewing', id === actorOf(view) && 'acting']}
                aria-pressed={id === viewing}
                onclick={() => (picked = id)}>
                <span class="avatar">
                    <PlayerIcon icon={p.icon} />
                    {#if play && id === play.readerId}
                        <span class="badge"><BookOpen /></span>
                    {:else if play?.step === 'stealing' && id === play.stealerId}
                        <span class="badge"><Hand /></span>
                    {/if}
                </span>
                <span class="seat-name">{id === me ? 'You' : p.name}</span>
                <NumberBadge value={view.scores[id]} />
            </button>
        {/each}
    </nav>

    <div class="status">
        <Text role="label">{status}</Text>
        <span class="target">to {view.settings.targetScore}</span>
    </div>

    <main
        class="ledger"
        bind:this={ledger}>
        <div class="axis-label">Earlier</div>
        {#if placing}
            {@render gap(0)}
        {/if}
        {#each timeline as entry, i (entry.kind === 'card' ? entry.cardId : `a${i}`)}
            {@const s = shown(view, entry)}
            <div class={['row', s.state]}>
                <span class="year">{year(entry.date)}</span>
                <span class="caption">
                    {#if s.state === 'anchor'}
                        Anchor year
                    {:else}
                        <CategoryDot category={s.category} />
                        {s.text}
                    {/if}
                </span>
                {#if s.state !== 'anchor'}
                    <Stamp variant={s.state} />
                {/if}
            </div>
            {#if placing}
                {@render gap(i + 1)}
            {/if}
        {/each}
        <div class="axis-label">Later</div>
    </main>

    <Surface
        kind="paper"
        class="dock">
        {#key outcomeKey(view)}
            {#if outcome}
                <p class={['outcome', outcome.tone]}>
                    <strong>{outcome.title}.</strong>
                    {outcome.detail}
                </p>
            {/if}
        {/key}

        {#if viewing !== (focus ?? me)}
            <p class="peek">
                You're looking at {nameOf(view, viewing)}'s timeline.
                <button
                    type="button"
                    class="link"
                    onclick={() => (picked = null)}>Back to the play</button>
            </p>
        {/if}

        {#if play?.step === 'picking'}
            <Text role="label">{drawLabel(view)}</Text>
            <div class="choices">
                {#each play.categories as category (category)}
                    {@const c = look(category)}
                    <Button
                        variant={play.pickerId === me ? 'ink' : 'ghost'}
                        disabled={play.pickerId !== me}
                        onclick={() => dispatch({ type: 'pickCategory', by: me, category })}
                        ><CategoryIcon icon={c.icon} /> {c.name}</Button>
                {/each}
            </div>
        {:else if card}
            <div class="hand">
                <Card
                    face={card.text ? 'front' : 'sleeve'}
                    category={look(card.category)}
                    text={card.text ?? ''}
                    size={card.text ? 'md' : 'sm'} />
                <div class="hand-text">
                    <Text role="caption">{drawLabel(view)}</Text>
                    {#if role === 'reader'}
                        <Text role="heading-2">Read it aloud</Text>
                        <Text role="body">Only you see the text. Never say the year.</Text>
                    {:else if placing}
                        <Text role="heading-2"
                            >{play?.step === 'stealing' ? 'Your steal' : 'Your card'}</Text>
                        <Text role="body"
                            >{slot === null ? 'Tap a line in your timeline.' : between}</Text>
                    {:else if play?.step === 'deciding' && role === 'active'}
                        <Text role="heading-2">Right!</Text>
                        <Text role="body"
                            >{unlockedCount(view, me)} unlocked. Lock in, or risk them for more.</Text>
                    {:else if role === 'stealer' || role === 'active'}
                        <Text role="heading-2">Your move</Text>
                        <Text role="body">Open your own timeline to place it.</Text>
                    {:else}
                        <Text role="heading-2">Watch</Text>
                        <Text role="body">Tap a player above to see their timeline.</Text>
                    {/if}
                </div>
            </div>
        {/if}

        {#if placing}
            <Button
                variant="ink"
                size="lg"
                block
                disabled={slot === null}
                onclick={place}
                >{play?.step === 'stealing' ? 'Steal it here' : 'Place it here'}</Button>
        {:else if play?.step === 'deciding' && role === 'active'}
            <div class="two">
                <Button
                    variant="ghost"
                    size="lg"
                    onclick={() => dispatch({ type: 'continue', by: me })}>Go on</Button>
                <Button
                    variant="ink"
                    size="lg"
                    onclick={() => dispatch({ type: 'lockIn', by: me })}>Lock in</Button>
            </div>
        {/if}
    </Surface>
</Surface>

{#snippet gap(at: number)}
    {#if slot === at && card}
        <button
            type="button"
            class="row ghost cat-{look(card.category).colour}"
            onclick={() => choose(at)}>
            <span class="year">?</span>
            <span class="caption">{between}</span>
        </button>
    {:else}
        <button
            type="button"
            class="gap"
            aria-label="Place {at === 0 ? 'first' : `after ${year(timeline[at - 1].date)}`}"
            onclick={() => choose(at)}></button>
    {/if}
{/snippet}

<style>
    :global(body) {
        margin: 0;
    }
    :global(.variant-b) {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        box-sizing: border-box;
        padding-bottom: var(--prototype-bar-space, 0px);
    }
    .rail {
        display: flex;
        gap: var(--space-3);
        overflow-x: auto;
        /* Clear of the layout's corner menu. */
        padding: var(--space-5) 64px var(--space-3) var(--space-5);
        scrollbar-width: none;
        flex: none;
    }
    .seat {
        display: grid;
        justify-items: center;
        gap: 2px;
        min-width: 58px;
        padding: var(--space-2);
        border: none;
        border-radius: var(--radius-lg);
        color: var(--text-on-table-secondary);
        background: none;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-11);
        font-weight: var(--font-weight-bold);
        cursor: pointer;
    }
    .seat.viewing {
        color: var(--text-on-table);
        background: var(--surface-table-inset);
    }
    .avatar {
        position: relative;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-round);
        box-shadow: var(--shadow-outline-on-table);
    }
    .acting .avatar {
        box-shadow: 0 0 0 3px var(--color-paper-300);
        animation: pulse var(--duration-ambient-breathe) ease-in-out infinite;
    }
    .badge {
        position: absolute;
        right: -4px;
        bottom: -4px;
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: var(--radius-round);
        color: var(--text-on-paper);
        background: var(--surface-paper);
    }
    .badge :global(svg) {
        width: 11px;
        height: 11px;
    }
    .seat-name {
        max-width: 58px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .status {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0 var(--space-6) var(--space-3);
        color: var(--text-on-table);
        flex: none;
    }
    .target {
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        color: var(--text-on-table-subtle);
    }
    .ledger {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        padding: var(--space-3) var(--space-6) var(--space-6);
    }
    .axis-label {
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-table-subtle);
        text-align: center;
    }
    .row {
        display: grid;
        grid-template-columns: 76px 1fr auto;
        align-items: center;
        gap: var(--space-4);
        min-height: 56px;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        color: var(--text-on-paper);
        background: var(--gradient-card-face);
        box-shadow: var(--shadow-paper);
        text-align: left;
        font: inherit;
    }
    .row.anchor {
        color: var(--text-on-table);
        background: var(--surface-table-inset);
        box-shadow: inset 0 0 0 1.5px var(--border-on-table-strong);
    }
    .row.unlocked {
        transform: rotate(-0.6deg);
        box-shadow:
            var(--shadow-paper),
            0 0 0 2px var(--palette-amber-500);
    }
    .row :global(.ui-stamp) {
        position: static;
        transform: rotate(-8deg) scale(0.85);
    }
    .year {
        font-family: var(--font-family-serif);
        font-variation-settings: var(--font-variation-numeral);
        font-size: var(--font-size-28);
        font-weight: var(--font-weight-black);
        font-variant-numeric: tabular-nums lining-nums;
    }
    .caption {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-semibold);
    }
    .gap {
        position: relative;
        height: 22px;
        margin: -6px 0;
        border: none;
        background: none;
        cursor: pointer;
    }
    .gap::before {
        content: '';
        position: absolute;
        inset: 10px 18%;
        border-top: 2px dashed var(--border-on-table-strong);
    }
    .gap:hover::before,
    .gap:focus-visible::before {
        border-color: var(--color-paper-300);
        inset-inline: 0;
    }
    .ghost {
        border: 2px dashed var(--cat);
        color: var(--text-on-table);
        background: oklch(from var(--color-paper-300) l c h / 0.12);
        box-shadow: 0 0 24px oklch(from var(--color-paper-300) l c h / 0.25);
        animation: pulse var(--duration-ambient-breathe) ease-in-out infinite;
        cursor: pointer;
    }
    :global(.dock) {
        display: grid;
        gap: var(--space-4);
        padding: var(--space-5) var(--space-6) var(--space-6);
        border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
        box-shadow: var(--shadow-overlay);
        flex: none;
    }
    .outcome {
        margin: 0;
        padding: var(--space-3) var(--space-4);
        border-radius: var(--radius-md);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        background: var(--surface-paper-sunken);
        animation: rise var(--duration-slow) var(--ease-overshoot);
    }
    .outcome.good {
        box-shadow: inset 4px 0 0 var(--palette-green-500);
    }
    .outcome.bad {
        box-shadow: inset 4px 0 0 var(--palette-red-500);
    }
    .peek {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        color: var(--text-on-paper-secondary);
    }
    .link {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-weight: var(--font-weight-bold);
        text-decoration: underline;
        color: var(--text-on-paper);
        cursor: pointer;
    }
    .choices {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3);
    }
    .hand {
        display: flex;
        align-items: center;
        gap: var(--space-5);
    }
    .hand-text {
        display: grid;
        gap: var(--space-2);
    }
    .hand-text :global(.ui-body) {
        margin: 0;
        color: var(--text-on-paper-secondary);
    }
    .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4);
    }
    @keyframes pulse {
        50% {
            opacity: 0.7;
        }
    }
    @keyframes rise {
        from {
            opacity: 0;
            transform: translateY(8px);
        }
    }
</style>
