<script lang="ts">
    import favicon from '#lib/assets/favicon.svg'
    import type { LayoutProps } from './$types'

    // No CSS here: the game's styles load in (game)/+layout.svelte and the admin's in
    // (admin)/admin/+layout.svelte, so neither ever loads on the other side.
    let { children }: LayoutProps = $props()
</script>

<svelte:head>
    <link
        rel="icon"
        href={favicon} />
</svelte:head>

{@render children()}
