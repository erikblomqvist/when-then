<script lang="ts">
    import MenuIcon from '@lucide/svelte/icons/menu'
    import type { Snippet } from 'svelte'

    type Props = {
        /** Required: the trigger is an icon with no text. */
        label: string
        children: Snippet
    }

    let { label, children }: Props = $props()
    const id = $props.id()
</script>

<!-- A button group in a popover, not an ARIA menu: Tab moves through it, Escape or a tap
     outside closes it. -->
<button
    type="button"
    class="ui-button ui-button--ghost ui-icon-button ui-corner-menu__trigger"
    aria-label={label}
    popovertarget={id}>
    <MenuIcon />
</button>
<div
    {id}
    popover="auto"
    class="ui-paper ui-corner-menu">
    {@render children()}
</div>
