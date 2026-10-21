<!--
    The card editor: one form, saved explicitly (no autosave), with an unsaved-changes guard.
    Used by /admin/cards/new and /admin/cards/[id]; both post to their own `?/save` action.

    Extension points:
    - Locale tabs (sv, nb): add their fields inside the <form>, next to the English section,
      with matching names in `CardFormValues` / `parseCardForm`; they share this save and guard.
    - Sidebar: the `sidebar` snippet renders in the <aside>, outside the <form>, so status
      actions (Publish, Archive, Delete draft) can be forms of their own; it gets `dirty` so
      they can hold off while there are unsaved changes. History goes there too.
-->
<script lang="ts">
    import type { Snippet } from 'svelte'
    import { beforeNavigate } from '$app/navigation'
    import { enhance } from '$app/forms'
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { Textarea } from '#lib/components/ui/textarea/index.js'
    import { cardStatusLabel, type Card } from '#lib/cards/card.js'
    import {
        cardTextMaxLength,
        sourceQuoteMaxLength,
        type CardFormErrors,
        type CardFormValues,
    } from '#lib/cards/card-form.js'
    import { decadeLabel, decadeOf } from '#lib/cards/date-parts.js'
    import type { Category } from '#lib/server/categories.js'

    type Props = {
        /** The values the form starts from (the saved card, or empty). */
        values: CardFormValues
        categories: Category[]
        /** The saved card, or undefined for a new one. */
        card?: Card
        /** From the action result: errors per field, or `saved` after a successful save. */
        errors?: CardFormErrors
        saved?: boolean
        sidebar?: Snippet<[{ dirty: boolean }]>
    }

    let { values: initial, categories, card, errors = {}, saved = false, sidebar }: Props = $props()

    // svelte-ignore state_referenced_locally -- the form owns its values once it is shown
    let values = $state({ ...initial })
    // svelte-ignore state_referenced_locally
    let baseline = $state(JSON.stringify(initial))
    let saving = $state(false)
    const dirty = $derived(JSON.stringify(values) !== baseline)

    const months = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ]

    // Entering a year fills the decade (and locks it); without a year the decade is typed.
    const yearNumber = $derived(/^\d+$/.test(values.year.trim()) ? Number(values.year) : 0)
    const decadeFromYear = $derived(
        yearNumber > 0
            ? String(decadeLabel(decadeOf(values.era === 'BC' ? -yearNumber : yearNumber)))
            : null,
    )

    beforeNavigate((navigation) => {
        if (!dirty || saving) return
        // Closing the tab or leaving the site: the browser asks with its own dialog.
        if (navigation.type === 'leave') navigation.cancel()
        else if (!confirm('You have unsaved changes. Leave without saving them?')) {
            navigation.cancel()
        }
    })

    const describedBy = (name: keyof CardFormValues) => (errors[name] ? `${name}-error` : undefined)
</script>

{#snippet error(name: keyof CardFormValues)}
    {#if errors[name]}
        <p
            id="{name}-error"
            class="text-sm text-destructive">
            {errors[name]}
        </p>
    {/if}
{/snippet}

<div class="grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
    <form
        method="POST"
        action="?/save"
        class="flex flex-col gap-6"
        use:enhance={() => {
            saving = true
            const submitted = JSON.stringify(values)
            return async ({ result, update }) => {
                if (result.type === 'success' || result.type === 'redirect') baseline = submitted
                await update({ reset: false })
                saving = false
            }
        }}>
        <section
            aria-labelledby="english-heading"
            class="flex flex-col gap-2">
            <h2
                id="english-heading"
                class="sr-only">
                English
            </h2>
            <Label for="text_en">English text</Label>
            <Textarea
                id="text_en"
                name="text_en"
                rows={3}
                maxlength={cardTextMaxLength}
                bind:value={values.text_en}
                aria-invalid={errors.text_en ? 'true' : undefined}
                aria-describedby={describedBy('text_en')} />
            {@render error('text_en')}
        </section>

        <fieldset class="flex flex-col gap-3">
            <legend class="mb-2 text-sm font-medium">Date</legend>
            <div class="flex flex-wrap items-start gap-4">
                <div class="flex flex-col gap-2">
                    <Label for="era">Era</Label>
                    <NativeSelect.Root
                        id="era"
                        name="era"
                        bind:value={values.era}>
                        <NativeSelect.Option value="AD">AD</NativeSelect.Option>
                        <NativeSelect.Option value="BC">BC</NativeSelect.Option>
                    </NativeSelect.Root>
                </div>
                <div class="flex w-28 flex-col gap-2">
                    <Label for="decade">Decade</Label>
                    <Input
                        id="decade"
                        name="decade"
                        inputmode="numeric"
                        placeholder="1490"
                        value={decadeFromYear ?? values.decade}
                        oninput={(event) => (values.decade = event.currentTarget.value)}
                        disabled={decadeFromYear !== null}
                        aria-invalid={errors.decade ? 'true' : undefined}
                        aria-describedby={describedBy('decade')} />
                </div>
                <div class="flex w-28 flex-col gap-2">
                    <Label for="year">Year</Label>
                    <Input
                        id="year"
                        name="year"
                        inputmode="numeric"
                        bind:value={values.year}
                        aria-invalid={errors.year ? 'true' : undefined}
                        aria-describedby={describedBy('year')} />
                </div>
                <div class="flex flex-col gap-2">
                    <Label for="month">Month</Label>
                    <NativeSelect.Root
                        id="month"
                        name="month"
                        bind:value={values.month}
                        aria-invalid={errors.month ? 'true' : undefined}
                        aria-describedby={describedBy('month')}>
                        <NativeSelect.Option value="">Unknown</NativeSelect.Option>
                        {#each months as month, index (month)}
                            <NativeSelect.Option value={String(index + 1)}>
                                {month}
                            </NativeSelect.Option>
                        {/each}
                    </NativeSelect.Root>
                </div>
                <div class="flex w-20 flex-col gap-2">
                    <Label for="day">Day</Label>
                    <Input
                        id="day"
                        name="day"
                        inputmode="numeric"
                        bind:value={values.day}
                        aria-invalid={errors.day ? 'true' : undefined}
                        aria-describedby={describedBy('day')} />
                </div>
            </div>
            <p class="text-sm text-muted-foreground">
                Fill in what is known. A year fills the decade; month and day are optional.
            </p>
            {@render error('decade')}
            {@render error('year')}
            {@render error('month')}
            {@render error('day')}
        </fieldset>

        <div class="flex flex-col gap-2">
            <Label for="category_id">Category</Label>
            <NativeSelect.Root
                id="category_id"
                name="category_id"
                bind:value={values.category_id}
                aria-invalid={errors.category_id ? 'true' : undefined}
                aria-describedby={describedBy('category_id')}>
                <NativeSelect.Option
                    value=""
                    disabled>
                    Choose a category
                </NativeSelect.Option>
                {#each categories as category (category.id)}
                    <NativeSelect.Option value={category.id}>
                        {category.name}{category.archived ? ' (archived)' : ''}
                    </NativeSelect.Option>
                {/each}
            </NativeSelect.Root>
            {@render error('category_id')}
        </div>

        <fieldset class="flex flex-col gap-3">
            <legend class="mb-2 text-sm font-medium">Source (optional)</legend>
            <div class="flex flex-col gap-2">
                <Label for="source_url">Source URL</Label>
                <Input
                    id="source_url"
                    name="source_url"
                    type="url"
                    placeholder="https://"
                    bind:value={values.source_url}
                    aria-invalid={errors.source_url ? 'true' : undefined}
                    aria-describedby={describedBy('source_url')} />
                {@render error('source_url')}
            </div>
            <div class="flex flex-col gap-2">
                <Label for="source_quote">Source quote</Label>
                <Textarea
                    id="source_quote"
                    name="source_quote"
                    rows={2}
                    maxlength={sourceQuoteMaxLength}
                    bind:value={values.source_quote}
                    aria-invalid={errors.source_quote ? 'true' : undefined}
                    aria-describedby={describedBy('source_quote')} />
                {@render error('source_quote')}
            </div>
        </fieldset>

        <div class="flex items-center gap-4">
            <Button
                type="submit"
                disabled={saving}>
                Save
            </Button>
            <p
                role="status"
                class="text-sm text-muted-foreground">
                {#if dirty}Unsaved changes{:else if saved}Saved.{/if}
            </p>
        </div>
    </form>

    <aside
        aria-label="Card"
        class="flex flex-col gap-4 text-sm">
        <div class="flex items-center justify-between gap-2">
            <span class="font-medium">Status</span>
            {#if card}
                <Badge
                    variant="secondary"
                    data-testid="card-status">
                    {cardStatusLabel[card.status]}
                </Badge>
            {:else}
                <span class="text-muted-foreground">Not saved yet</span>
            {/if}
        </div>
        {@render sidebar?.({ dirty })}
    </aside>
</div>
