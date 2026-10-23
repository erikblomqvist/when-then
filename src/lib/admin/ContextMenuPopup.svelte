<!--
    A `ContextMenu` behind a small "⋯" button, for actions on an item in a list or table row.
    The menu is a native popover: it opens under the button (anchored to it; where the browser
    can't anchor, it opens in the middle of the screen), and closes on Escape, on a click
    outside it, and once one of its actions is picked.

        <ContextMenuPopup label="Actions for {card.text}" actions={[...]} />
-->
<script lang="ts">
    import EllipsisIcon from '@lucide/svelte/icons/ellipsis'
    import { Button } from '#lib/components/ui/button/index.js'
    import ContextMenu from './ContextMenu.svelte'
    import type { ContextMenuAction } from './context-menu.js'

    type Props = {
        /** Names the button and the menu, e.g. "Actions for Moon landing". */
        label: string
        actions: ContextMenuAction[]
    }

    let { label, actions }: Props = $props()

    const uid = $props.id()
    const menuId = `${uid}-menu`
    const anchor = `--${uid}-anchor`
    let popover: HTMLElement | undefined = $state()
</script>

<Button
    variant="ghost"
    size="icon-sm"
    aria-label={label}
    popovertarget={menuId}
    style="anchor-name: {anchor}">
    <EllipsisIcon aria-hidden="true" />
</Button>

<div
    bind:this={popover}
    id={menuId}
    popover="auto"
    class="popup m-auto w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-transparent p-0 shadow-lg"
    style="position-anchor: {anchor}">
    <ContextMenu
        {label}
        {actions}
        onaction={() => popover?.hidePopover()} />
</div>

<style>
    /* Under the button, its right edges lined up; flipped above or leftwards when out of room. */
    @supports (position-area: bottom) {
        .popup {
            inset: auto;
            margin: 0.25rem 0;
            position-area: bottom span-left;
            position-try-fallbacks: flip-block, flip-inline;
        }
    }
</style>
