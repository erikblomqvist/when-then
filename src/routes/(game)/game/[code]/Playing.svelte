<script lang="ts">
    import { enhance, type SubmitFunction } from '$app/forms'
    import { Button, PlayerIcon, Surface, Text } from '#lib'
    import { refusalMessage } from '#lib/game/refusals.js'
    import { hasOtherReader, holdingUp, type GamePlayer, type Skipped } from '#lib/game/state.js'
    import { m } from '#lib/paraglide/messages.js'
    import AbsentPlayers from './AbsentPlayers.svelte'
    import EndEarly from './EndEarly.svelte'
    import HostMenu from './HostMenu.svelte'
    import RemoveFromGame from './RemoveFromGame.svelte'
    import type { ActionData, PageData } from './$types'

    /**
     * The game from Confirm seating on. Until the phone views per role (#16) take its place, it
     * shows only whose turn it is, and to the host, who is absent, with a menu to skip whatever
     * an absent player is holding up or remove them from the game, and End game early.
     */
    let {
        game,
        absentPlayers,
        form,
    }: {
        game: Extract<PageData['game'], { started: true }>
        absentPlayers: GamePlayer[]
        form: ActionData
    } = $props()

    const view = $derived(game.view)
    const isHost = $derived(view.players.some((player) => player.id === view.seat && player.host))
    const activeId = $derived(view.phase.name === 'playing' ? view.phase.activeId : undefined)
    const active = $derived(view.players.find((player) => player.id === activeId))
    const error = $derived(form?.refusal && refusalMessage(form.refusal))

    // What the host can skip of each player's, by seat.
    const skippable = $derived(
        new Map<string, Skipped>(
            view.phase.name === 'playing'
                ? holdingUp(view.phase.play, view.phase.activeId)
                      .filter(({ what }) => what !== 'reading' || hasOtherReader(view.seating))
                      .map(({ playerId, what }) => [playerId, what])
                : [],
        ),
    )
    const skipLabels: Record<Skipped, () => string> = {
        turn: m.skip_turn,
        steal: m.skip_steal,
        reading: m.skip_reading,
    }

    const skipping: SubmitFunction =
        () =>
        ({ update }) =>
            update({ reset: false })
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
        <AbsentPlayers players={absentPlayers}>
            {#snippet action(player)}
                {@const what = skippable.get(player.id)}
                <HostMenu name={player.name}>
                    {#if what}
                        <form
                            method="post"
                            action="?/skip"
                            use:enhance={skipping}>
                            <input
                                type="hidden"
                                name="seat"
                                value={player.id} />
                            <input
                                type="hidden"
                                name="version"
                                value={game.version} />
                            <Button
                                type="submit"
                                variant="ink"
                                block>{skipLabels[what]()}</Button>
                        </form>
                    {/if}
                    <RemoveFromGame
                        seat={player.id}
                        name={player.name}
                        version={game.version} />
                </HostMenu>
            {/snippet}
        </AbsentPlayers>
        {#if error}
            <p
                class="error"
                role="alert">
                {error}
            </p>
        {/if}
        {#if isHost}
            <EndEarly version={game.version} />
        {/if}
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
    .error {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-error-on-table);
    }
</style>
