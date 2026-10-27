<script
    module
    lang="ts">
    export const name = 'Table (Figma)'
</script>

<script lang="ts">
    // PROTOTYPE (#16), variant A: the Figma "In-game" flow as drawn. One stacked screen: the
    // focus timeline in a horizontal tray, the card under it, round action buttons at the bottom,
    // and every timeline in a sheet behind the top-left button.
    import ArrowDown from '@lucide/svelte/icons/arrow-down'
    import Layers from '@lucide/svelte/icons/layers'
    import Lock from '@lucide/svelte/icons/lock'
    import Trophy from '@lucide/svelte/icons/trophy'
    import Users from '@lucide/svelte/icons/users'
    import X from '@lucide/svelte/icons/x'
    import { tick } from 'svelte'
    import {
        ActionButton,
        Button,
        Card,
        CategoryIcon,
        Chip,
        IconButton,
        PlayerIcon,
        Surface,
        Text,
        Timeline,
        TimelineGap,
        TimelineSlot,
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
    const placing = $derived(
        (play?.step === 'placing' && role === 'active') ||
            (play?.step === 'stealing' && role === 'stealer'),
    )
    const timeline = $derived(focus ? (view.timelines[focus] ?? []) : [])
    const outcome = $derived(latestOutcome(view))
    const wobble = $derived(
        Math.min(4, Math.max(1, focus ? unlockedCount(view, focus) : 1)) as 1 | 2 | 3 | 4,
    )

    let slot = $state<number | null>(null)
    $effect.pre(() => {
        void outcomeKey(view)
        void play?.step
        slot = null
    })

    let introSeen = $state(false)
    const intro = $derived(!introSeen && isFirstTurn(view) && view.startingPlayerId !== null)

    let sheet = $state<HTMLDialogElement>()
    let tray = $state<HTMLElement>()

    async function choose(gap: number) {
        slot = gap
        await tick()
        tray?.querySelector('.ui-timeline__gap--selected')?.scrollIntoView({
            behavior: 'smooth',
            inline: 'center',
            block: 'nearest',
        })
    }

    function place() {
        if (slot === null || !play) return
        dispatch(
            play.step === 'stealing'
                ? { type: 'steal', by: me, slot }
                : { type: 'place', by: me, slot },
        )
    }

    const focusName = $derived(focus ? nameOf(view, focus) : '')
    const activeName = $derived(
        view.phase.name === 'playing' ? nameOf(view, view.phase.activeId) : '',
    )

    const topLine = $derived.by(() => {
        if (!play) return 'Game over'
        if (play.step === 'stealing') return 'Steal'
        return role === 'active' ? 'Your turn' : `${activeName}'s turn`
    })

    const heading = $derived.by(() => {
        if (!play) return 'Game over'
        switch (play.step) {
            case 'picking':
                return play.pickerId === me
                    ? 'Pick a category'
                    : `${nameOf(view, play.pickerId)} picks a category`
            case 'placing':
                if (role === 'active') return 'Your turn'
                if (role === 'reader') return `You read for ${activeName}`
                return `${activeName} is placing a card`
            case 'deciding':
                return role === 'active' ? 'Right! Lock in or go on?' : `${activeName} got it right`
            case 'stealing':
                return role === 'stealer'
                    ? 'Your steal'
                    : `${nameOf(view, play.stealerId)} is stealing`
        }
    })

    const hint = $derived.by(() => {
        if (!play) return ''
        const reader = nameOf(view, play.readerId)
        switch (play.step) {
            case 'picking':
                return play.pickerId === me
                    ? play.draw.kind === 'readersChoice'
                        ? `Pick the category ${activeName} gets.`
                        : 'Pick the category you want.'
                    : 'The card comes once a category is picked.'
            case 'placing':
                if (role === 'active')
                    return `${reader} reads the card. Tap where you think it belongs, then Place.`
                if (role === 'reader')
                    return 'Read the card aloud. Only you see the text; the year stays hidden until it is placed.'
                return `If ${activeName} misplaces it, the card passes round the table. Open the timelines to prepare a steal.`
            case 'deciding':
                return role === 'active'
                    ? `Lock in keeps what you have unlocked. Go on risks them for more.`
                    : `${activeName} can lock in or draw another card.`
            case 'stealing':
                return role === 'stealer'
                    ? `${activeName} misplaced the card. Place it right on your timeline and it locks there for 1 point. A miss costs nothing.`
                    : `${activeName} misplaced it. Now ${focusName} tries on their own timeline.`
        }
    })
</script>

<Surface
    kind="table"
    grain
    class="variant-a">
    <div class="screen">
        <header class="top">
            <IconButton
                label="View timelines"
                onclick={() => sheet?.showModal()}><Users /></IconButton>
            <span class="top-line">{topLine}</span>
            <Chip><Trophy />{view.scores[me] ?? 0} of {view.settings.targetScore}</Chip>
        </header>

        {#key outcomeKey(view)}
            {#if outcome}
                <p class={['outcome', outcome.tone]}>
                    <strong>{outcome.title}</strong>
                    {#if outcome.detail}<span>{outcome.detail}</span>{/if}
                </p>
            {/if}
        {/key}

        <Text role="heading-1">{heading}</Text>

        {#if focus}
            <Text role="label">{focus === me ? 'Your timeline' : `${focusName}'s timeline`}</Text>
            <div
                class="tray-scroll"
                bind:this={tray}>
                <Timeline>
                    {#each timeline as entry, i (entry.kind === 'card' ? entry.cardId : `a${i}`)}
                        {@const s = shown(view, entry)}
                        {#if placing}
                            <TimelineGap
                                selected={slot === i}
                                label="Place before {year(entry.date)}"
                                onselect={() => choose(i)} />
                        {/if}
                        <TimelineSlot>
                            <Card
                                face="timeline"
                                category={s.category}
                                year={year(entry.date)}
                                text={s.state === 'anchor' ? undefined : s.text}
                                state={s.state}
                                {wobble}
                                lean={i % 2 ? 'left' : 'right'}
                                nudged={slot !== null && (slot === i || slot === i + 1)} />
                        </TimelineSlot>
                    {/each}
                    {#if placing}
                        <TimelineGap
                            selected={slot === timeline.length}
                            label="Place last"
                            onselect={() => choose(timeline.length)} />
                    {/if}
                </Timeline>
            </div>
        {/if}

        <section class="card-area">
            {#if play?.step === 'picking'}
                <Chip>{drawLabel(view)}</Chip>
                <div class="categories">
                    {#each play.categories as category (category)}
                        {@const c = look(category)}
                        {#if play.pickerId === me}
                            <Chip
                                onclick={() => dispatch({ type: 'pickCategory', by: me, category })}
                                ><CategoryIcon icon={c.icon} />{c.name}</Chip>
                        {:else}
                            <Chip><CategoryIcon icon={c.icon} />{c.name}</Chip>
                        {/if}
                    {/each}
                </div>
            {:else if card}
                {#key card.category + view.log.length}
                    <span class="reveal"
                        ><Chip active
                            ><CategoryIcon icon={look(card.category).icon} />{drawLabel(view)}</Chip
                        ></span>
                {/key}
                <Card
                    face={card.text ? 'front' : 'sleeve'}
                    category={look(card.category)}
                    text={card.text ?? ''}
                    size="md"
                    class="ui-float" />
            {/if}
            <p class="hint">{hint}</p>
        </section>

        <footer class="actions">
            {#if placing}
                <ActionButton
                    label="Place"
                    disabled={slot === null}
                    onclick={place}><ArrowDown /></ActionButton>
            {:else if play?.step === 'deciding' && role === 'active'}
                <ActionButton
                    label="Go on"
                    onclick={() => dispatch({ type: 'continue', by: me })}><Layers /></ActionButton>
                <ActionButton
                    label="Lock in"
                    count="{unlockedCount(view, me)} {unlockedCount(view, me) === 1
                        ? 'card'
                        : 'cards'}"
                    onclick={() => dispatch({ type: 'lockIn', by: me })}><Lock /></ActionButton>
            {:else if role === 'reader' && play?.step === 'placing'}
                <p class="waiting">Waiting for {activeName} to place the card…</p>
            {:else}
                <Button
                    variant="ghost"
                    block
                    onclick={() => sheet?.showModal()}><Users /> View timelines</Button>
            {/if}
        </footer>
    </div>
</Surface>

<dialog
    bind:this={sheet}
    class="ui-sheet sheet"
    closedby="any">
    <header class="sheet-top">
        <Text role="heading-2">Timelines</Text>
        <IconButton
            label="Close"
            onclick={() => sheet?.close()}><X /></IconButton>
    </header>
    {#each view.seating as id (id)}
        {@const p = player(view, id)}
        <section class="sheet-player">
            <div class="sheet-name">
                <PlayerIcon icon={p.icon} />
                <strong>{nameOf(view, id)}</strong>
                {#if id === focus}<span class="tag">on the table</span>{/if}
                {#if play && id === play.readerId}<span class="tag">reader</span>{/if}
                <span class="score">{view.scores[id]} / {view.settings.targetScore}</span>
            </div>
            <div class="mini">
                {#each view.timelines[id] ?? [] as entry, i (i)}
                    {@const s = shown(view, entry)}
                    <Card
                        face="timeline"
                        size="sm"
                        category={s.category}
                        year={year(entry.date)}
                        text={s.state === 'anchor' ? undefined : s.text}
                        state={s.state} />
                {/each}
            </div>
        </section>
    {/each}
</dialog>

{#if intro && view.startingPlayerId}
    {@const starter = player(view, view.startingPlayerId)}
    <Surface
        kind="veil"
        class="intro">
        <Surface
            kind="panel"
            class="intro-panel">
            <span class="intro-icon"><PlayerIcon icon={starter.icon} /></span>
            <Text role="heading-1"
                >{nameOf(view, starter.id)} {starter.id === me ? 'start' : 'starts'}</Text>
            <Text role="body">Picked at random. Every round opens with them.</Text>
            <Button
                variant="ink"
                block
                onclick={() => (introSeen = true)}>Let's play</Button>
        </Surface>
    </Surface>
{/if}

<style>
    :global(body) {
        margin: 0;
    }
    :global(.variant-a) {
        min-height: 100dvh;
        box-sizing: border-box;
        padding: var(--space-5) var(--space-6)
            calc(var(--space-6) + var(--prototype-bar-space, 0px));
    }
    .screen {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        width: min(100%, 420px);
        margin: 0 auto;
        min-height: calc(100dvh - var(--space-11) - var(--prototype-bar-space, 0px));
    }
    .top {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        /* Clear of the layout's corner menu. */
        padding-inline-end: 56px;
    }
    .top-line {
        flex: 1;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-table-secondary);
    }
    .outcome {
        display: grid;
        gap: 2px;
        margin: 0;
        padding: var(--space-3) var(--space-5);
        border-radius: var(--radius-lg);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        color: var(--text-on-table);
        background: var(--surface-table-inset);
        animation: drop var(--duration-slow) var(--ease-overshoot);
    }
    .outcome.good {
        box-shadow: inset 4px 0 0 var(--palette-green-500);
    }
    .outcome.bad {
        box-shadow: inset 4px 0 0 var(--palette-red-500);
    }
    .outcome span {
        color: var(--text-on-table-secondary);
    }
    .tray-scroll {
        overflow-x: auto;
        margin-inline: calc(-1 * var(--space-6));
        padding-inline: var(--space-6);
        scrollbar-width: none;
    }
    .tray-scroll :global(.ui-tray) {
        width: max-content;
        min-width: 100%;
    }
    /* A closed gap takes no room but still catches a finger, with a faint mark to aim for. */
    .tray-scroll :global(button.ui-timeline__gap:not(.ui-timeline__gap--selected)) {
        z-index: 1;
        width: 36px;
        margin-inline: -18px;
    }
    .tray-scroll :global(button.ui-timeline__gap:not(.ui-timeline__gap--selected)::after) {
        content: '';
        position: absolute;
        inset: 30% 17px;
        border-left: 2px dashed var(--border-on-table-strong);
    }
    .card-area {
        display: grid;
        justify-items: center;
        gap: var(--space-4);
        text-align: center;
    }
    .categories {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--space-3);
    }
    .reveal {
        animation: drop var(--duration-slow) var(--ease-overshoot);
    }
    .hint,
    .waiting {
        margin: 0;
        max-width: 32ch;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-bold);
        color: var(--text-on-table-secondary);
    }
    .waiting {
        font-size: var(--font-size-15);
        color: var(--text-on-table);
    }
    .actions {
        display: flex;
        justify-content: center;
        gap: var(--space-7);
        margin-top: auto;
    }
    .sheet {
        width: min(100% - 24px, 440px);
        max-height: 85dvh;
        overflow-y: auto;
        border: none;
    }
    /* .ui-sheet's display would otherwise show the dialog while closed. */
    .sheet:not([open]) {
        display: none;
    }
    .sheet::backdrop {
        background: var(--surface-veil);
    }
    .sheet-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .sheet-player {
        display: grid;
        gap: var(--space-3);
    }
    .sheet-name {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
    }
    .tag {
        padding: 2px var(--space-3);
        border-radius: var(--radius-pill);
        font-size: var(--font-size-11);
        font-weight: var(--font-weight-bold);
        background: var(--surface-paper-sunken);
    }
    .score {
        margin-inline-start: auto;
        font-variant-numeric: tabular-nums;
    }
    .mini {
        display: flex;
        gap: var(--space-3);
        overflow-x: auto;
        padding: var(--space-3) 0 var(--space-4);
    }
    .mini :global(.ui-card) {
        --card-size: 8px;
    }
    :global(.intro) {
        position: fixed;
        inset: 0;
        display: grid;
        place-items: center;
        padding: var(--space-6);
        z-index: 5;
    }
    :global(.intro-panel) {
        display: grid;
        justify-items: center;
        gap: var(--space-5);
        width: min(100%, 340px);
        text-align: center;
        animation: drop var(--duration-slow) var(--ease-overshoot);
    }
    .intro-icon {
        display: inline-flex;
        transform: scale(2.2);
        margin: var(--space-6);
    }
    @keyframes drop {
        from {
            opacity: 0;
            transform: translateY(-12px) scale(0.96);
        }
    }
</style>
