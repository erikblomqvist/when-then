<script lang="ts">
    import CardEditor from '#lib/admin/cards/CardEditor.svelte'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()
</script>

<svelte:head>
    <title>New card · When Then? admin</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-semibold tracking-tight">New card</h1>

<CardEditor
    values={form?.values ?? data.values}
    categories={data.categories}
    errors={form?.errors}
    publishError={form?.publishError}
    canCreateCategory={data.role === 'admin'} />
