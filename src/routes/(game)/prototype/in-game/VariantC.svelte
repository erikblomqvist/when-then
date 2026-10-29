<script
    module
    lang="ts">
    export const name = 'Focus (card + ruler)'
</script>

<script lang="ts">
    // PROTOTYPE (#16), variant C: the card is the hero, big in the middle. The timeline shrinks to
    // a ruler of years under it that the player scrubs (drag, tap or step) to move a marker,
    // reading back "between 1564 and 1800". Each beat of the game gets a full-screen moment:
    // who starts, the category draw, the steal hand-off and the result. Other timelines page
    // sideways with the arrows by the name.
    import ChevronLeft from '@lucide/svelte/icons/chevron-left'
    import ChevronRight from '@lucide/svelte/icons/chevron-right'
    import Hand from '@lucide/svelte/icons/hand'
    import { tick } from 'svelte'
    import {
        Button,
        Card,
        CategoryIcon,
        Chip,
        IconButton,
        PlayerIcon,
        Stamp,
        Surface,
        Text,
    } from '#lib'
    import {
        cardInPlay,
        drawLabel,
        focusOf,
        isFirstTurn,
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
    const activeId = $derived(view.phase.name === 'playing' ? view.phase.activeId : null)

    let picked = $state<string | null>(null)
    let slot = $state(0)
    // Full-screen moments, shown one after another; a tap moves on to the next.
    let moments = $state<('start' | 'draw' | 'steal' | 'result')[]>([])
    const moment = $derived(moments[0] ?? null)
    let seenStart = false

    // A new beat: back to the play, marker in the middle, and the moments that go with it.
    $effect.pre(() => {
        void outcomeKey(view)
        const step = play?.step
        const f = focus
        picked = null
        slot = Math.floor((view.timelines[f ?? me]?.length ?? 0) / 2)
        const next: typeof moments = []
        if (!seenStart && isFirstTurn(view)) {
            seenStart = true
            next.push('start')
        } else if (latestOutcome(view)) next.push('result')
        if (step === 'stealing' && role === 'stealer') next.push('steal')
        if (step === 'placing') next.push('draw')
        moments = next
    })

    const viewing = $derived(picked ?? focus ?? me)
    const timeline = $derived(view.timelines[viewing] ?? [])
    const placing = $derived(
        viewing === me &&
            ((play?.step === 'placing' && role === 'active') ||
                (play?.step === 'stealing' && role === 'stealer')),
    )
    const order = $derived(view.seating)
    function page(by: number) {
        const i = order.indexOf(viewing)
        picked = order[(i + by + order.length) % order.length]
    }

    const between = $derived.by(() => {
        const before = timeline[slot - 1]
        const after = timeline[slot]
        if (!before && !after) return ''
        if (!before) return `Before ${year(after.date)}`
        if (!after) return `After ${year(before.date)}`
        return `Between ${year(before.date)} and ${year(after.date)}`
    })

    // Scrubbing: the marker goes to the gap nearest the finger.
    let ruler = $state<HTMLElement>()
    let dragging = false
    function scrubTo(x: number) {
        if (!ruler) return
        const ticks = [...ruler.querySelectorAll<HTMLElement>('.tick')]
        let next = ticks.length
        for (let i = 0; i < ticks.length; i++) {
            const box = ticks[i].getBoundingClientRect()
            if (x < box.left + box.width / 2) {
                next = i
                break
            }
        }
        slot = next
    }
    function down(event: PointerEvent) {
        if (!placing) return
        dragging = true
        ruler?.setPointerCapture(event.pointerId)
        scrubTo(event.clientX)
    }
    function move(event: PointerEvent) {
        if (dragging) scrubTo(event.clientX)
    }
    function up() {
        dragging = false
    }
    $effect(() => {
        void slot
        void tick().then(() =>
            ruler
                ?.querySelector('.marker')
                ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }),
        )
    })

    function place() {
        if (!play) return
        dispatch(
            play.step === 'stealing'
                ? { type: 'steal', by: me, slot }
                : { type: 'place', by: me, slot },
        )
    }

    const line = $derived.by(() => {
        if (!play || !activeId) return 'Game over'
        const active = nameOf(view, activeId)
        switch (play.step) {
            case 'picking':
                return play.pickerId === me
                    ? 'Pick a category'
                    : `${nameOf(view, play.pickerId)} picks a category`
            case 'placing':
                if (role === 'active') return `${nameOf(view, play.readerId)} reads you a card`
                if (role === 'reader') return `Read this to ${active}`
                return `${active} is placing`
            case 'deciding':
                return role === 'active' ? 'Right! Lock in or go on?' : `${active} is deciding`
            case 'stealing':
                return role === 'stealer'
                    ? 'Your steal'
                    : `${nameOf(view, play.stealerId)} is stealing`
        }
    })

    const outcome = $derived(latestOutcome(view))
</script>

<Surface
    kind="table"
    grain
    class="variant-c">
    <header class="who">
        <IconButton
            label="Previous player"
            onclick={() => page(-1)}><ChevronLeft /></IconButton>
        <div class="who-name">
            <span class="who-icon"><PlayerIcon icon={player(view, viewing).icon} /></span>
            <strong
                >{viewing === me
                    ? 'Your timeline'
                    : `${player(view, viewing).name}'s timeline`}</strong>
            <span class="who-score">{view.scores[viewing]} of {view.settings.targetScore}</span>
        </div>
        <IconButton
            label="Next player"
            onclick={() => page(1)}><ChevronRight /></IconButton>
    </header>
    <div class="dots">
        {#each order as id (id)}
            <button
                type="button"
                class={['dot', id === viewing && 'on', id === focus && 'play']}
                aria-label={nameOf(view, id)}
                onclick={() => (picked = id)}></button>
        {/each}
    </div>

    <main class="stage">
        <Text role="label">{line}</Text>
        {#if play?.step === 'picking'}
            <div class="wheel">
                {#each play.categories as category (category)}
                    {@const c = look(category)}
                    <button
                        type="button"
                        class="pick cat-{c.colour}"
                        disabled={play.pickerId !== me}
                        onclick={() => dispatch({ type: 'pickCategory', by: me, category })}>
                        <CategoryIcon icon={c.icon} />
                        <span>{c.name}</span>
                    </button>
                {/each}
            </div>
        {:else if card}
            <Card
                face={card.text ? 'front' : 'sleeve'}
                category={look(card.category)}
                text={card.text ?? ''}
                size={card.text ? 'xl' : 'lg'}
                lifted={placing}
                class="ui-float" />
            <Chip><CategoryIcon icon={look(card.category).icon} />{drawLabel(view)}</Chip>
        {/if}
    </main>

    <section
        class={['ruler', placing && 'live']}
        role="group"
        aria-label="Timeline: drag to choose where the card goes"
        bind:this={ruler}
        onpointerdown={down}
        onpointermove={move}
        onpointerup={up}
        onpointercancel={up}>
        <div class="track">
            {#each timeline as entry, i (entry.kind === 'card' ? entry.cardId : `a${i}`)}
                {@const s = shown(view, entry)}
                {#if placing && slot === i}
                    <span class="marker">?</span>
                {/if}
                <span
                    class={['tick', s.state, s.state !== 'anchor' && `cat-${s.category.colour}`]}
                    title={s.text}>
                    {year(entry.date)}
                </span>
            {/each}
            {#if placing && slot === timeline.length}
                <span class="marker">?</span>
            {/if}
        </div>
    </section>

    <footer class="bottom">
        {#if placing}
            <div class="stepper">
                <IconButton
                    label="Earlier"
                    disabled={slot === 0}
                    onclick={() => (slot = Math.max(0, slot - 1))}><ChevronLeft /></IconButton>
                <span class="between">{between}</span>
                <IconButton
                    label="Later"
                    disabled={slot === timeline.length}
                    onclick={() => (slot = Math.min(timeline.length, slot + 1))}
                    ><ChevronRight /></IconButton>
            </div>
            <Button
                size="lg"
                block
                onclick={place}
                >{play?.step === 'stealing' ? 'Steal it here' : 'Place it here'}</Button>
        {:else if play?.step === 'deciding' && role === 'active'}
            <div class="two">
                <Button
                    variant="ghost"
                    size="lg"
                    onclick={() => dispatch({ type: 'continue', by: me })}>Go on</Button>
                <Button
                    size="lg"
                    onclick={() => dispatch({ type: 'lockIn', by: me })}
                    >Lock in {unlockedCount(view, me)}</Button>
            </div>
        {:else if viewing !== (focus ?? me)}
            <Button
                variant="ghost"
                block
                onclick={() => (picked = null)}>Back to the play</Button>
        {:else if role === 'reader'}
            <p class="note">Only you see the text. The year stays hidden until it's placed.</p>
        {:else}
            <p class="note">Swipe through the timelines with the arrows to plan a steal.</p>
        {/if}
    </footer>
</Surface>

{#if moment}
    <Surface
        kind="veil"
        class="moment"
        onclick={() => (moments = moments.slice(1))}>
        <div class="moment-body">
            {#if moment === 'start' && view.startingPlayerId}
                {@const starter = player(view, view.startingPlayerId)}
                <span class="big-icon"><PlayerIcon icon={starter.icon} /></span>
                <Text role="display">{nameOf(view, starter.id)}</Text>
                <Text role="heading-2">{starter.id === me ? 'start' : 'starts'} the game</Text>
            {:else if moment === 'draw' && card}
                {@const c = look(card.category)}
                <span class="draw cat-{c.colour}"><CategoryIcon icon={c.icon} /></span>
                <Text role="label">{drawLabel(view)}</Text>
                <Text role="display">{c.name}</Text>
            {:else if moment === 'steal'}
                <span class="big-icon"><Hand /></span>
                <Text role="display">Your steal</Text>
                <Text role="body"
                    >{activeId ? nameOf(view, activeId) : 'They'} misplaced it. Get it right on your timeline
                    for 1 point. A miss costs nothing.</Text>
            {:else if moment === 'result' && outcome}
                <span class="result-stamp"
                    ><Stamp
                        variant={outcome.tone === 'good' ? 'locked' : 'unlocked'}
                        animateIn
                        >{outcome.tone === 'good'
                            ? 'Right'
                            : outcome.tone === 'bad'
                              ? 'Wrong'
                              : 'Miss'}</Stamp
                    ></span>
                <Text role="heading-1">{outcome.title}</Text>
                <Text role="body">{outcome.detail}</Text>
            {/if}
            <Text role="caption">Tap to go on</Text>
        </div>
    </Surface>
{/if}

<style>
    :global(body) {
        margin: 0;
    }
    :global(.variant-c) {
        display: flex;
        flex-direction: column;
        height: 100dvh;
        box-sizing: border-box;
        padding: var(--space-5) 0 calc(var(--space-5) + var(--prototype-bar-space, 0px));
        color: var(--text-on-table);
    }
    .who {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        /* Clear of the layout's corner menu. */
        padding: 0 64px 0 var(--space-5);
    }
    .who-name {
        flex: 1;
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        column-gap: var(--space-3);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
    }
    .who-icon {
        grid-row: span 2;
        display: inline-flex;
    }
    .who-score {
        font-size: var(--font-size-13);
        color: var(--text-on-table-secondary);
    }
    .dots {
        display: flex;
        justify-content: center;
        gap: var(--space-3);
        padding: var(--space-3);
    }
    .dot {
        width: 8px;
        height: 8px;
        padding: 0;
        border: none;
        border-radius: var(--radius-round);
        background: var(--border-on-table-strong);
        cursor: pointer;
    }
    .dot.play {
        box-shadow: 0 0 0 2px var(--color-paper-300);
    }
    .dot.on {
        background: var(--color-paper-300);
        width: 20px;
        border-radius: var(--radius-pill);
    }
    .stage {
        flex: 1;
        display: grid;
        place-content: center;
        justify-items: center;
        gap: var(--space-5);
        padding: var(--space-4) var(--space-6);
        text-align: center;
    }
    .wheel {
        display: grid;
        grid-template-columns: repeat(2, 120px);
        gap: var(--space-4);
    }
    .pick {
        display: grid;
        justify-items: center;
        gap: var(--space-2);
        padding: var(--space-5) var(--space-3);
        border: none;
        border-radius: var(--radius-lg);
        color: var(--text-on-category);
        background: var(--gradient-lacquer-highlight), var(--cat);
        box-shadow: 0 4px 0 var(--cat-dark);
        font-family: var(--font-family-sans);
        font-weight: var(--font-weight-bold);
        cursor: pointer;
    }
    .pick:disabled {
        cursor: default;
        opacity: 0.75;
    }
    .ruler {
        overflow-x: auto;
        padding: var(--space-5) var(--space-6);
        background: var(--surface-table-inset);
        scrollbar-width: none;
        touch-action: pan-x;
    }
    .ruler.live {
        touch-action: none;
        cursor: ew-resize;
    }
    .track {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        width: max-content;
        margin: 0 auto;
        padding-bottom: var(--space-3);
        border-bottom: 2px solid var(--border-on-table-strong);
    }
    .tick {
        min-width: 44px;
        padding: var(--space-3) var(--space-2);
        border-radius: var(--radius-sm);
        text-align: center;
        font-family: var(--font-family-serif);
        font-variation-settings: var(--font-variation-numeral);
        font-size: var(--font-size-16);
        font-weight: var(--font-weight-black);
        font-variant-numeric: tabular-nums lining-nums;
        user-select: none;
    }
    .tick.locked {
        color: var(--text-on-paper);
        background: var(--gradient-card-face);
        box-shadow: 0 3px 0 var(--cat-dark);
    }
    .tick.unlocked {
        color: var(--text-on-paper);
        background: var(--gradient-card-face);
        outline: 2px dashed var(--cat);
        outline-offset: 2px;
        transform: translateY(-4px);
    }
    .tick.anchor {
        box-shadow: inset 0 0 0 1.5px var(--border-on-table-strong);
    }
    .marker {
        display: grid;
        place-items: center;
        width: 36px;
        height: 48px;
        border-radius: var(--radius-sm);
        color: var(--text-on-paper);
        background: var(--surface-paper-bright);
        box-shadow: 0 0 22px oklch(from var(--color-paper-300) l c h / 0.6);
        font-family: var(--font-family-serif);
        font-size: var(--font-size-28);
        font-weight: var(--font-weight-black);
        transition: transform var(--duration-fast) var(--ease-overshoot);
    }
    .bottom {
        display: grid;
        gap: var(--space-4);
        padding: var(--space-5) var(--space-6) 0;
    }
    .stepper {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .between {
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        font-weight: var(--font-weight-bold);
    }
    .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-4);
    }
    .note {
        margin: 0;
        text-align: center;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        color: var(--text-on-table-secondary);
    }
    :global(.moment) {
        position: fixed;
        inset: 0;
        z-index: 5;
        display: grid;
        place-items: center;
        padding: var(--space-7);
        color: var(--text-on-table);
        background: oklch(from var(--color-navy-950) l c h / 0.94);
        cursor: pointer;
        animation: fade var(--duration-base) var(--ease-standard);
    }
    .moment-body {
        display: grid;
        justify-items: center;
        gap: var(--space-4);
        max-width: 320px;
        text-align: center;
        animation: pop var(--duration-slow) var(--ease-overshoot);
    }
    .big-icon {
        display: inline-flex;
        transform: scale(2.4);
        margin: var(--space-8);
    }
    .draw {
        display: grid;
        place-items: center;
        width: 120px;
        height: 120px;
        border-radius: var(--radius-2xl);
        color: var(--text-on-category);
        background: var(--gradient-lacquer-highlight), var(--cat);
        box-shadow: 0 6px 0 var(--cat-dark);
        animation: spin var(--duration-slower) var(--ease-overshoot);
    }
    .draw :global(svg) {
        width: 56px;
        height: 56px;
    }
    .result-stamp {
        display: inline-flex;
        transform: scale(2);
        margin: var(--space-8);
    }
    .result-stamp :global(.ui-stamp) {
        position: static;
    }
    @keyframes fade {
        from {
            opacity: 0;
        }
    }
    @keyframes pop {
        from {
            opacity: 0;
            transform: scale(0.9);
        }
    }
    @keyframes spin {
        from {
            transform: rotate(-200deg) scale(0.4);
        }
    }
</style>
