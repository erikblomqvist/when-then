<script lang="ts">
    import { PlayerIcon, Surface, Text } from '#lib'
    import type { GamePlayer } from '#lib/game/state.js'
    import { m } from '#lib/paraglide/messages.js'
    import AbsentPlayers from './AbsentPlayers.svelte'
    import type { PageData } from './$types'

    /**
     * The game from Confirm seating on. Until the phone views per role (#16) take its place, it
     * shows only whose turn it is, and to the host, who is absent.
     */
    let {
        game,
        absentPlayers,
    }: {
        game: Extract<PageData['game'], { started: true }>
        absentPlayers: GamePlayer[]
    } = $props()

    const view = $derived(game.view)
    const activeId = $derived(view.phase.name === 'playing' ? view.phase.activeId : undefined)
    const active = $derived(view.players.find((player) => player.id === activeId))
</script>

<svelte:head>
    <title>{game.code} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="playing-page">
    <div class="playing">
        {#if active}
            <span class="icon"><PlayerIcon icon={active.icon} /></span>
            <Text role="heading-1">
                {active.id === view.seat
                    ? m.play_your_turn()
                    : m.play_their_turn({ name: active.name })}
            </Text>
        {:else}
            <Text role="heading-1">{m.game_under_way()}</Text>
        {/if}
        <AbsentPlayers players={absentPlayers} />
    </div>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.playing-page) {
        min-height: 100vh;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    .playing {
        display: grid;
        gap: var(--space-5);
        justify-items: center;
        width: min(100%, 420px);
        margin: 0 auto;
        text-align: center;
    }
    .icon {
        display: inline-flex;
        color: var(--text-on-table);
    }
</style>
