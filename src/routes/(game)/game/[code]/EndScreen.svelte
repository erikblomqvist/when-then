<script lang="ts">
    import ListIcon from '@lucide/svelte/icons/list'
    import { enhance } from '$app/forms'
    import {
        Button,
        Card,
        IconButton,
        Notepad,
        PlayerIcon,
        PlayerRow,
        Surface,
        Text,
        Timeline,
        TimelineSlot,
        type CategoryLook,
    } from '#lib'
    import { decadeLabel } from '#lib/cards/date-parts.js'
    import { refusalMessage } from '#lib/game/refusals.js'
    import { firstPlacedYear, type GameDate } from '#lib/game/state.js'
    import { standings } from '#lib/game/view.js'
    import { m } from '#lib/paraglide/messages.js'
    import { getLocale } from '#lib/paraglide/runtime.js'
    import type { ActionData, PageData } from './$types'

    /**
     * The end screen, once the game is won, ended early or abandoned: the final standings with
     * the winners marked, or the locked scores with no winner, and every seated player's
     * timeline to look back at, this phone's own first. The host plays again from here.
     */
    let { game, form }: { game: Extract<PageData['game'], { started: true }>; form: ActionData } =
        $props()

    const view = $derived(game.view)
    const isHost = $derived(view.players.some((player) => player.id === view.seat && player.host))
    const error = $derived(form?.refusal && refusalMessage(form.refusal))
    const rows = $derived(standings(view))
    const winners = $derived(rows.filter((row) => row.winner).map((row) => row.player.name))
    // A tie shares its place.
    const place = (score: number) => 1 + rows.filter((row) => row.score > score).length

    let picked = $state<string>()
    const shown = $derived(
        rows.find((row) => row.player.id === picked) ??
            rows.find((row) => row.player.id === view.seat) ??
            rows[0],
    )
    // Only the anchor and the locked cards: what the score counts.
    const timeline = $derived(
        (shown && view.timelines[shown.player.id])?.filter(
            (entry) => entry.kind === 'anchor' || entry.locked,
        ) ?? [],
    )

    // How the anchor and a card whose category is gone show on the timeline.
    const plainLook: CategoryLook = { name: '', icon: 'flag', colour: 'blue' }

    /** A year from 1500 as it is; a decade before it as people say it, in the app language. */
    function dateLabel(date: GameDate): string {
        if (date >= firstPlacedYear) return String(date)
        const label = m.game_date_decade({ decade: decadeLabel(date) })
        return date < 0 ? m.game_date_bc({ date: label }) : label
    }
</script>

<svelte:head>
    <title>{game.code} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="end-screen-page">
    <div class="end-screen">
        {#if view.phase.name === 'finished'}
            <Text role="heading-1">{m.game_over()}</Text>
            <p class="hint">
                {m.game_won_by({
                    names: new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(
                        winners,
                    ),
                })}
            </p>
        {:else if view.phase.name === 'abandoned'}
            <Text role="heading-1">{m.abandoned()}</Text>
            <p class="hint">{m.abandoned_hint()}</p>
        {:else}
            <Text role="heading-1">{m.ended_early()}</Text>
            <p class="hint">{m.ended_early_hint()}</p>
        {/if}

        <Notepad
            title={m.standings()}
            meta={m.score()}>
            {#each rows as row (row.player.id)}
                <div
                    class="standing"
                    class:standing--winner={row.winner}>
                    <PlayerRow
                        number={place(row.score)}
                        name={row.player.name}
                        icon={row.player.icon}
                        role={row.winner
                            ? m.winner()
                            : row.player.id === view.seat
                              ? m.you()
                              : undefined}>
                        {#snippet action()}
                            <span class="standing__score">{row.score}</span>
                            <IconButton
                                label={m.show_timeline({ name: row.player.name })}
                                aria-pressed={row === shown}
                                onclick={() => (picked = row.player.id)}>
                                <ListIcon />
                            </IconButton>
                        {/snippet}
                    </PlayerRow>
                </div>
            {/each}
        </Notepad>

        {#if shown}
            <section
                class="timeline"
                aria-labelledby="shown-timeline">
                <h2
                    class="timeline__title"
                    id="shown-timeline">
                    <PlayerIcon icon={shown.player.icon} />
                    {m.timeline_of({ name: shown.player.name })}
                </h2>
                <div class="timeline__scroll">
                    <Timeline
                        startLabel={m.timeline_earlier()}
                        endLabel={m.timeline_later()}>
                        {#each timeline as entry (entry.kind === 'card' ? entry.cardId : 'anchor')}
                            <TimelineSlot>
                                {#if entry.kind === 'anchor'}
                                    <Card
                                        face="timeline"
                                        size="sm"
                                        category={plainLook}
                                        year={dateLabel(entry.date)}
                                        text={m.anchor_year()}
                                        state="anchor" />
                                {:else}
                                    {@const card = view.cards[entry.cardId]}
                                    <Card
                                        face="timeline"
                                        size="sm"
                                        category={game.categories[card.category] ?? plainLook}
                                        year={dateLabel(entry.date)}
                                        text={card.text} />
                                {/if}
                            </TimelineSlot>
                        {/each}
                    </Timeline>
                </div>
            </section>
        {/if}

        {#if error}
            <p
                class="error"
                role="alert">
                {error}
            </p>
        {/if}
        {#if isHost}
            <form
                class="play-again"
                method="post"
                action="?/playAgain"
                use:enhance>
                <Button
                    type="submit"
                    variant="ink"
                    block>{m.play_again()}</Button>
            </form>
        {/if}
        <Button
            variant="ghost"
            href="/">{m.back_home()}</Button>
    </div>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.end-screen-page) {
        min-height: 100vh;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    .end-screen {
        display: grid;
        gap: var(--space-7);
        justify-items: center;
        width: min(100%, 420px);
        margin: 0 auto;
        text-align: center;
    }
    .end-screen > :global(.ui-notepad) {
        justify-self: stretch;
        text-align: start;
    }
    .hint {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        color: var(--text-on-table-secondary);
    }
    .error {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-error-on-table);
    }
    .play-again {
        justify-self: stretch;
    }
    .standing--winner :global(.ui-role-tag) {
        color: var(--text-on-paper);
        background: oklch(from var(--palette-amber-500) l c h / 0.35);
    }
    .standing__score {
        font-family: var(--font-family-serif);
        font-size: var(--font-size-21);
        font-weight: var(--font-weight-bold);
        font-variant-numeric: tabular-nums;
    }
    .timeline {
        display: grid;
        gap: var(--space-3);
        justify-self: stretch;
        min-width: 0;
    }
    .timeline__title {
        display: inline-flex;
        gap: var(--space-3);
        align-items: center;
        justify-content: center;
        margin: 0;
        font-family: var(--font-family-serif);
        font-size: var(--font-size-21);
        color: var(--text-on-table);
    }
    .timeline__scroll {
        overflow-x: auto;
    }
</style>
