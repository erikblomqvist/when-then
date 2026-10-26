<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import { watchGame } from '#lib/supabase-browser.js'
    import Lobby from './Lobby.svelte'
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
</script>

{#if data.game.started}
    <Seating
        game={data.game}
        {form} />
{:else}
    <Lobby
        lobby={data.game.lobby}
        joinUrl={data.joinUrl}
        {form} />
{/if}
