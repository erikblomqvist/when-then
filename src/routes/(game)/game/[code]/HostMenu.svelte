<script lang="ts">
    import EllipsisIcon from '@lucide/svelte/icons/ellipsis-vertical'
    import type { Snippet } from 'svelte'
    import { IconButton, Text } from '#lib'
    import { m } from '#lib/paraglide/messages.js'

    /**
     * What the host can do about `name`'s player: a round button that opens their actions on
     * paper. A button group in a popover, like the corner menu: Escape or a tap outside closes
     * it, and so does sending a form in it. Each opening starts its actions afresh, so a
     * confirmation left open isn't waiting the next time.
     */
    let { name, children }: { name: string; children: Snippet } = $props()
    const id = $props.id()
    let menu = $state<HTMLElement>()
    let openings = $state(0)
</script>

<IconButton
    label={m.host_menu_for({ name })}
    popovertarget={id}>
    <EllipsisIcon />
</IconButton>
<div
    {id}
    popover="auto"
    class="ui-paper host-menu"
    bind:this={menu}
    onsubmit={() => menu?.hidePopover()}
    ontoggle={(event) => {
        if (event.newState === 'open') openings++
    }}>
    <Text role="heading-2">{name}</Text>
    {#key openings}
        {@render children()}
    {/key}
</div>

<style>
    .host-menu {
        margin: auto;
        border: none;
        display: none;
        flex-direction: column;
        gap: var(--space-4);
        min-width: 240px;
        box-shadow: var(--shadow-overlay);
    }
    .host-menu:popover-open {
        display: flex;
    }
</style>
