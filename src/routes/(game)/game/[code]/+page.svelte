<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import { watchGame } from '#lib/supabase-browser.js'
    import { holdWakeLock } from '#lib/wake-lock.js'
    import Lobby from './Lobby.svelte'
    import Playing from './Playing.svelte'
    import Seating from './Seating.svelte'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    // Every phone follows the game live: refetch on every nudge newer than what's shown. The
    // effect tracks the id alone, so a refetch (a new `game` object) doesn't resubscribe.
    const gameId = $derived(data.game.gameId)
    $effect(() =>
        watchGame(
            gameId,
            () => data.game.version,
            () => void invalidateAll(),
        ),
    )

    const phase = $derived(data.game.started ? data.game.view.phase.name : 'lobby')
    // The screen stays on through seating and play, across the phase change between them.
    const awake = $derived(phase === 'seating' || phase === 'playing')
    $effect(() => {
        if (awake) return holdWakeLock()
    })
</script>

{#if !data.game.started}
    <Lobby
        lobby={data.game.lobby}
        joinUrl={data.joinUrl}
        {form} />
{:else if phase === 'seating'}
    <Seating
        game={data.game}
        {form} />
{:else}
    <Playing game={data.game} />
{/if}
