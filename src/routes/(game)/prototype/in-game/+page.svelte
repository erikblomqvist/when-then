<script lang="ts">
    // PROTOTYPE (#16), throwaway: three in-game phone screens, switchable with `?variant=A|B|C`,
    // over a real game played in memory by the machine. `seat` is whose phone (a player number,
    // or `follow` for whoever has the move), `moment` where the game starts, and `layout=table`
    // shows every seat's phone side by side. Developer-only, so its words aren't translated.
    import { untrack } from 'svelte'
    import { goto } from '$app/navigation'
    import { page } from '$app/state'
    import { redact } from '#lib/game/view.js'
    import { PrototypeGame } from './game.svelte'
    import { roleOf, type Role } from './lib'
    import { moments } from './moments'
    import PrototypeBar from './PrototypeBar.svelte'
    import VariantA, { name as nameA } from './VariantA.svelte'
    import VariantB, { name as nameB } from './VariantB.svelte'
    import VariantC, { name as nameC } from './VariantC.svelte'

    const variants = [
        { key: 'A', label: nameA, component: VariantA },
        { key: 'B', label: nameB, component: VariantB },
        { key: 'C', label: nameC, component: VariantC },
    ]

    const params = $derived(page.url.searchParams)
    const variant = $derived(
        variants.find((v) => v.key === params.get('variant')?.toUpperCase()) ?? variants[0],
    )
    const seat = $derived(params.get('seat') ?? 'follow')
    const layout = $derived(params.get('layout') === 'table' ? 'table' : 'phone')
    const embed = $derived(params.has('embed'))

    const game = new PrototypeGame(page.url.searchParams.get('moment') ?? '')
    $effect(() => () => game.destroy())
    $effect(() => {
        const moment = params.get('moment') ?? moments[0].key
        untrack(() => {
            if (moment !== game.moment) game.reset(moment)
        })
    })

    const view = $derived(game.viewFor(seat))

    function change(changes: Record<string, string | null>) {
        const url = new URL(page.url.href)
        for (const [key, value] of Object.entries(changes)) {
            if (value === null) url.searchParams.delete(key)
            else url.searchParams.set(key, value)
        }
        void goto(url, { replace: true })
    }

    const roleWords: Record<Role, string> = {
        active: 'active',
        reader: 'reader',
        stealer: 'stealer',
        picker: 'picks',
        watcher: '',
    }
    const seats = $derived.by(() => {
        const ids = game.players
        return [
            { key: 'follow', label: 'Follow the move' },
            ...ids.map((p, i) => {
                const role = roleWords[roleOf(redact(game.state, p.id))]
                return {
                    key: String(i + 1),
                    label: `${i + 1} ${p.name}${role ? ` · ${role}` : ''}`,
                }
            }),
        ]
    })

    function phoneSrc(n: number) {
        const url = new URL(page.url.href)
        url.searchParams.set('seat', String(n))
        url.searchParams.set('moment', game.moment)
        url.searchParams.set('embed', '')
        url.searchParams.delete('layout')
        return url.pathname + url.search
    }
</script>

<svelte:head>
    <title>Prototype: in-game {variant.key} · When Then?</title>
</svelte:head>

{#if layout === 'table' && !embed}
    <main class="table">
        {#each game.players as p, i (p.id)}
            <figure>
                <figcaption>{seats[i + 1].label}</figcaption>
                <div class="phone">
                    <iframe
                        title="{p.name}'s phone"
                        src={phoneSrc(i + 1)}></iframe>
                </div>
            </figure>
        {/each}
    </main>
{:else}
    <div style:--prototype-bar-space={embed ? '0px' : '64px'}>
        {#key variant.key}
            <variant.component
                {view}
                dispatch={game.dispatch} />
        {/key}
    </div>
    {#if game.refusal}
        <p
            class="refusal"
            role="alert">
            {game.refusal}
        </p>
    {/if}
{/if}

{#if !embed}
    <PrototypeBar
        variants={variants.map(({ key, label }) => ({ key, label }))}
        variant={variant.key}
        {seats}
        {seat}
        moments={moments.map(({ key, label }) => ({ key, label }))}
        moment={game.moment}
        {layout}
        onchange={change}
        onreset={() => game.reset()} />
{/if}

<style>
    .table {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 24px;
        min-height: 100dvh;
        box-sizing: border-box;
        padding: 24px 24px 96px;
        background: #1a1a1f;
    }
    figure {
        display: grid;
        gap: 8px;
        margin: 0;
        font:
            13px ui-monospace,
            monospace;
        color: #fffc;
    }
    /* A 390 × 844 phone at 62%. */
    .phone {
        width: 242px;
        height: 523px;
        overflow: hidden;
        border-radius: 24px;
        box-shadow:
            0 0 0 6px #000,
            0 0 0 7px #fff3;
    }
    iframe {
        width: 390px;
        height: 844px;
        border: none;
        transform: scale(0.62);
        transform-origin: 0 0;
    }
    .refusal {
        position: fixed;
        top: 72px;
        left: 50%;
        z-index: 50;
        margin: 0;
        padding: 8px 14px;
        border-radius: 999px;
        transform: translateX(-50%);
        font:
            13px ui-monospace,
            monospace;
        color: #fff;
        background: #b3261e;
    }
</style>
