<script lang="ts">
    import ScenarioReadout from '#lib/ui/ScenarioReadout.svelte'
    import type { PageProps } from './$types'

    // Developer-only, so its words aren't translated.
    let { data }: PageProps = $props()

    const view = $derived(data.scenario?.view)
</script>

<svelte:head>
    <title>Scenario · When Then?</title>
</svelte:head>

<main class="scenario">
    <h1>Scenario</h1>
    {#if data.error}
        <p role="alert">{data.error}</p>
    {:else if view}
        <ScenarioReadout
            {view}
            absent={data.scenario?.absent ?? []} />
    {/if}
</main>

<style>
    .scenario {
        padding: var(--space-5);
        font-family: ui-monospace, monospace;
    }
</style>
