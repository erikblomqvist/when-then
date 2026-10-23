<script lang="ts">
    import AiDateSuggestion from '#lib/admin/cards/AiDateSuggestion.svelte'
    import AiTranslateButton from '#lib/admin/cards/AiTranslateButton.svelte'
    import CardEditor from '#lib/admin/cards/CardEditor.svelte'
    import CardHistory from '#lib/admin/cards/CardHistory.svelte'
    import CardLifecycle from '#lib/admin/cards/CardLifecycle.svelte'
    import { CardLifecycleActions } from '#lib/admin/cards/card-lifecycle.svelte.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    const lifecycle = new CardLifecycleActions(() => ({
        card: data.card,
        role: data.role,
        blockers: data.publishBlockers,
        verifiedByEmail: data.verifiedByEmail,
    }))
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
        publishError={form?.publishError}
        canCreateCategory={data.role === 'admin'}
        menuActions={(state) => lifecycle.menuActions(state)}>
        {#snippet translationActions({ locale, english, fill })}
            <AiTranslateButton
                cardId={data.card.id}
                {locale}
                {english}
                {fill} />
        {/snippet}
        {#snippet dateActions({ english, apply })}
            <AiDateSuggestion
                cardId={data.card.id}
                {english}
                {apply} />
        {/snippet}
        {#snippet sidebar()}
            <CardLifecycle
                {lifecycle}
                error={form?.lifecycleError} />
            <CardHistory {...data.history} />
        {/snippet}
    </CardEditor>
{/key}
