<script lang="ts">
    import type { Snippet } from 'svelte'
    import type { PlayerIcon as Icon } from '../game/player'
    import PlayerIcon from './PlayerIcon.svelte'

    /** One player in a list. Without a name it shows the empty text. `action` ends the row. */
    let {
        number,
        name,
        icon,
        emptyText = 'Waiting for a player…',
        role,
        action,
    }: {
        number: number
        name?: string
        icon?: Icon
        emptyText?: string
        role?: string
        action?: Snippet
    } = $props()
</script>

<div class="ui-player-row">
    <span class="ui-player-row__number">{number}</span>
    {#if icon}
        <span class="ui-player-row__icon"><PlayerIcon {icon} /></span>
    {/if}
    {#if name}
        <span class="ui-player-row__name">{name}</span>
    {:else}
        <span class="ui-player-row__empty">{emptyText}</span>
    {/if}
    <span class="ui-role-tag">{role ?? ''}</span>
    {@render action?.()}
</div>
