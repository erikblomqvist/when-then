<script lang="ts">
    import CategoryForm from '#lib/admin/categories/CategoryForm.svelte'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()
</script>

<svelte:head>
    <title>New category · When Then? admin</title>
</svelte:head>

<h1 class="mb-6 text-2xl font-semibold tracking-tight">New category</h1>

<CategoryForm
    values={form?.values ?? data.values}
    errors={form?.errors}
    error={form?.error} />
