<script lang="ts">
    import type { PageProps } from './$types'

    // A plain readout of the seat's view until the in-game screens exist; the contract is the
    // view, not the look. Developer-only, so its words aren't translated.
    let { data }: PageProps = $props()

    const view = $derived(data.scenario?.view)
    const absent = $derived(data.scenario?.absent ?? [])
    const name = (id: string) => view?.players.find((player) => player.id === id)?.name ?? id
    const play = $derived(view?.phase.name === 'playing' ? view.phase.play : null)
    const card = $derived(play && 'card' in play ? play.card : null)
</script>

<svelte:head>
    <title>Scenario · When Then?</title>
</svelte:head>

<main class="scenario">
    <h1>Scenario</h1>
    {#if data.error}
        <p role="alert">{data.error}</p>
    {:else if view}
        <dl>
            <dt>Seen from</dt>
            <dd data-testid="seat">{name(view.seat)}</dd>
            <dt>Phase</dt>
            <dd>{view.phase.name}</dd>
            {#if view.phase.name === 'playing' && play}
                <dt>Step</dt>
                <dd>{play.step}</dd>
                <dt>Active player</dt>
                <dd>{name(view.phase.activeId)}</dd>
                <dt>Reader</dt>
                <dd>{name(play.readerId)}</dd>
                {#if play.step === 'stealing'}
                    <dt>Stealer</dt>
                    <dd>{name(play.stealerId)}</dd>
                {/if}
            {/if}
            {#if view.phase.name === 'finished'}
                <dt>Winners</dt>
                <dd>{view.phase.winners.map(name).join(', ')}</dd>
            {/if}
            {#if card}
                <dt>Card in play</dt>
                <dd data-testid="card">
                    {card.category} · {card.text ?? 'text hidden'} · {card.date ?? 'date hidden'}
                </dd>
            {/if}
        </dl>

        <table>
            <thead>
                <tr><th>Player</th><th>Score</th><th>Timeline</th><th></th></tr>
            </thead>
            <tbody>
                {#each view.players as player (player.id)}
                    <tr>
                        <td>{player.name}</td>
                        <td>{view.scores[player.id] ?? '–'}</td>
                        <td>
                            {(view.timelines[player.id] ?? [])
                                .map((entry) =>
                                    entry.kind === 'card' && !entry.locked
                                        ? `(${entry.date})`
                                        : entry.date,
                                )
                                .join(' ')}
                        </td>
                        <td>
                            {[
                                player.removed && 'removed',
                                absent.includes(player.id) && 'absent',
                                player.id === view.seat && 'you',
                            ]
                                .filter(Boolean)
                                .join(', ')}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>

        <details>
            <summary>Seat view</summary>
            <pre>{JSON.stringify(view, null, 2)}</pre>
        </details>
    {/if}
</main>

<style>
    .scenario {
        padding: var(--space-5);
        font-family: ui-monospace, monospace;
    }

    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.25rem 1rem;
    }

    dd {
        margin: 0;
    }

    table {
        margin-block: 1rem;
        border-collapse: collapse;
    }

    th,
    td {
        padding: 0.25rem 0.75rem 0.25rem 0;
        text-align: left;
    }

    pre {
        overflow-x: auto;
        font-size: 0.75rem;
    }
</style>
