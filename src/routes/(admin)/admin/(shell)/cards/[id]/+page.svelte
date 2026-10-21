<script lang="ts">
    import CardEditor from '#lib/admin/cards/CardEditor.svelte'
    import CardHistory from '#lib/admin/cards/CardHistory.svelte'
    import CardLifecycle from '#lib/admin/cards/CardLifecycle.svelte'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()
</script>

<svelte:head>
    <title>Edit card · When Then? admin</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-semibold tracking-tight">Edit card</h1>

<!-- Keyed by card: moving from one card to another starts a fresh form. -->
{#key data.card.id}
    <CardEditor
        values={form?.values ?? data.values}
        categories={data.categories}
        card={data.card}
        errors={form?.errors}
        saved={form?.saved ?? false}>
        {#snippet sidebar({ dirty })}
            <CardLifecycle
                card={data.card}
                blockers={data.publishBlockers}
                role={data.role}
                {dirty}
                verifiedByEmail={data.verifiedByEmail}
                error={form?.lifecycleError} />
        {/snippet}
    </CardEditor>
{/key}

<div class="mt-12">
    <CardHistory {...data.history} />
</div>
