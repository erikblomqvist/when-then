<script lang="ts">
    import CategoryForm from '#lib/admin/categories/CategoryForm.svelte'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()
</script>

<svelte:head>
    <title>Edit category · When Then? admin</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-semibold tracking-tight">Edit category</h1>

{#key data.category.id}
    <CategoryForm
        values={form?.values ?? data.values}
        errors={form?.errors}
        error={form?.error} />
{/key}
