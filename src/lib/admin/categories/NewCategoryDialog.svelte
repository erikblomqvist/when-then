<!--
    "New category" from the card editor (#52): the category form in a modal dialog, posting to
    the card page's `?/createCategory`. Once saved, the page's data reloads (so the editor's
    category list has it) and `oncreated` gets the new id; the card being written is left as
    it is. Admins only, like the categories page. Render it outside the card editor's <form>:
    forms can't nest.
-->
<script lang="ts">
    import { tick } from 'svelte'
    import type { SubmitFunction } from '$app/forms'
    import { invalidateAll } from '$app/navigation'
    import {
        emptyCategoryFormValues,
        type CategoryFormErrors,
    } from '#lib/categories/category-form.js'
    import CategoryForm from './CategoryForm.svelte'

    type Props = {
        open: boolean
        oncreated: (id: string) => void
    }

    let { open = $bindable(), oncreated }: Props = $props()

    let dialog: HTMLDialogElement | undefined = $state()
    let errors: CategoryFormErrors = $state({})
    let error: string | undefined = $state()

    $effect(() => {
        if (dialog && !dialog.open) dialog.showModal()
    })

    function close() {
        open = false
        errors = {}
        error = undefined
    }

    type Failure = { category?: { errors?: CategoryFormErrors; error?: string } }

    const submit: SubmitFunction =
        () =>
        async ({ result }) => {
            if (result.type === 'success' && typeof result.data?.createdCategory === 'string') {
                await invalidateAll()
                await tick()
                oncreated(result.data.createdCategory)
                close()
            } else if (result.type === 'failure') {
                const failed = (result.data as Failure | undefined)?.category
                errors = failed?.errors ?? {}
                error = failed?.error
            } else {
                error = 'The category could not be saved. Try again.'
            }
        }
</script>

{#if open}
    <dialog
        bind:this={dialog}
        aria-labelledby="new-category-heading"
        class="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-lg border bg-background p-6 text-foreground shadow-lg backdrop:bg-black/50"
        onclose={close}>
        <h2
            id="new-category-heading"
            class="mb-6 text-lg font-semibold tracking-tight">
            New category
        </h2>
        <CategoryForm
            values={emptyCategoryFormValues}
            {errors}
            {error}
            action="?/createCategory"
            {submit}
            oncancel={() => dialog?.close()} />
    </dialog>
{/if}
