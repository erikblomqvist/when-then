<script lang="ts">
    import { PlayerIcon } from '#lib'
    import type { GamePlayer } from '#lib/game/state.js'
    import { m } from '#lib/paraglide/messages.js'

    /** The host's list of absent players (`#lib/game/absence.js`); nothing when it's empty. */
    let { players }: { players: GamePlayer[] } = $props()
</script>

{#if players.length}
    <ul
        class="absent"
        aria-label={m.absent_players()}>
        {#each players as player (player.id)}
            <li class="absent__player">
                <PlayerIcon icon={player.icon} />
                <span>{player.name}</span>
                <span class="absent__tag">{m.absent()}</span>
            </li>
        {/each}
    </ul>
{/if}

<style>
    .absent {
        display: grid;
        gap: var(--space-3);
        justify-items: center;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .absent__player {
        display: inline-flex;
        gap: var(--space-3);
        align-items: center;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        color: var(--text-on-table);
    }
    .absent__tag {
        padding: 3px 9px;
        border-radius: var(--radius-pill);
        font-size: var(--font-size-13);
        font-weight: var(--font-weight-bold);
        color: var(--text-error-on-table);
        box-shadow: var(--shadow-outline-on-table);
    }
</style>
