<!--
    "Add from photo" (#60), made for a phone. Take a photo (or choose one) of anything with
    historical facts in it; the AI reads it into candidate cards. Tick the ones to keep, edit
    them in place, create a suggested category where none fits, and save the ticked ones as
    drafts. What the AI inferred rather than read (a date not in the photo, the difficulty, the
    translations) is marked, and likely repeats of existing cards start unticked.
-->
<script lang="ts">
    import { untrack } from 'svelte'
    import { enhance } from '$app/forms'
    import type { SubmitFunction } from '$app/forms'
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button, buttonVariants } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { Textarea } from '#lib/components/ui/textarea/index.js'
    import NewCategoryDialog from '#lib/admin/categories/NewCategoryDialog.svelte'
    import { shrinkPhoto } from '#lib/admin/cards/shrink-photo.js'
    import { cardLocales, type CardLocale } from '#lib/cards/card.js'
    import { decadeLabel, decadeOf, formatCardDate, monthNames } from '#lib/cards/date-parts.js'
    import {
        dateNeeded,
        isAiTranslation,
        photoDraftErrors,
        photoTextStatus,
        type PhotoCandidate,
        type PhotoDraft,
        type SuggestedCategory,
    } from '#lib/cards/photo-import.js'
    import { localeName } from '#lib/cards/translation.js'
    import { englishNameKey, type CategoryFormValues } from '#lib/categories/category-form.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    /** A candidate as the admin edits it. */
    type Row = {
        candidate: PhotoCandidate
        ticked: boolean
        texts: Record<CardLocale, string>
        year: string
        month: string
        day: string
        /** Kept when the AI knew only the decade and no year is typed. */
        decade: number | null
        difficulty: string
        categoryId: string
    }

    const toRow = (candidate: PhotoCandidate): Row => ({
        candidate,
        ticked: candidate.duplicateOf === null,
        texts: { ...candidate.texts },
        year: candidate.date.year === null ? '' : String(candidate.date.year),
        month: candidate.date.month === null ? '' : String(candidate.date.month),
        day: candidate.date.day === null ? '' : String(candidate.date.day),
        decade: candidate.date.year === null ? candidate.date.decade : null,
        difficulty: candidate.difficulty === null ? '' : String(candidate.difficulty),
        categoryId: candidate.categoryId ?? '',
    })

    let rows: Row[] = $state([])
    let requestId: number | null = $state(null)

    // A new reading replaces the list; reloads (after creating a category) keep the edits.
    let shownReading: unknown = null
    $effect.pre(() => {
        const reading = form?.stage === 'review' ? form : null
        untrack(() => {
            if (!reading || reading === shownReading) return
            shownReading = reading
            rows = reading.candidates.map(toRow)
            requestId = reading.requestId
        })
    })

    const reviewing = $derived(rows.length > 0)

    const whole = (value: string) => (/^-?\d+$/.test(value.trim()) ? Number(value) : null)

    function draftOf(row: Row): PhotoDraft {
        const year = whole(row.year)
        const month = year === null ? null : whole(row.month)
        const translations = {} as PhotoDraft['translations']
        for (const locale of cardLocales) {
            const text = row.texts[locale].trim()
            if (text) {
                translations[locale] = {
                    text,
                    status: photoTextStatus(row.candidate, locale, text),
                }
            }
        }
        return {
            categoryId: row.categoryId,
            date: {
                decade: year !== null && year !== 0 ? decadeOf(year) : row.decade,
                year,
                month,
                day: month === null ? null : whole(row.day),
            },
            sourceQuote: row.candidate.sourceQuote || null,
            difficulty: whole(row.difficulty),
            translations,
        }
    }

    const ticked = $derived(rows.filter((row) => row.ticked))
    const tickedDrafts = $derived(ticked.map(draftOf))
    const blocked = $derived(
        tickedDrafts.map(photoDraftErrors).findIndex((errors) => errors.length > 0),
    )

    // Photo: shrink it, then submit the form with the smaller file.
    let photoForm: HTMLFormElement | undefined = $state()
    let reading = $state(false)
    let chosen: File | null = null

    async function choose(event: Event & { currentTarget: HTMLInputElement }) {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (!file) return
        chosen = file
        photoForm?.requestSubmit()
    }

    const readPhoto: SubmitFunction = async ({ formData, cancel }) => {
        if (!chosen) return cancel()
        reading = true
        formData.set('photo', await shrinkPhoto(chosen))
        chosen = null
        return async ({ update }) => {
            await update()
            reading = false
        }
    }

    // A category the AI suggested: create it (prefilled), then every row waiting for it gets it.
    let creating: SuggestedCategory | null = $state(null)
    let creatingOpen = $state(false)

    const categoryValues = (suggested: SuggestedCategory): CategoryFormValues => ({
        icon: suggested.icon,
        colour: suggested.colour,
        name_en: suggested.names.en,
        name_sv: suggested.names.sv,
        name_nb: suggested.names.nb,
    })

    function startCreating(suggested: SuggestedCategory) {
        creating = suggested
        creatingOpen = true
    }

    function created(id: string) {
        const key = creating ? englishNameKey(creating.names.en) : null
        for (const row of rows) {
            const suggested = row.candidate.newCategory
            if (!row.categoryId && suggested && englishNameKey(suggested.names.en) === key) {
                row.categoryId = id
            }
        }
        creating = null
    }

    const categoryName = (id: string) =>
        data.categories.find((category) => category.id === id)?.name

    const cardsWord = (count: number) => `${count} ${count === 1 ? 'card' : 'cards'}`
    const textId = (row: Row, locale: CardLocale) => `text-${row.candidate.key}-${locale}`
    const fieldId = (row: Row, name: string) => `${name}-${row.candidate.key}`

    const shownDate = (row: Row) => {
        const draft = draftOf(row)
        return draft.date.decade === null ? null : formatCardDate(draft.date)
    }
</script>

<svelte:head>
    <title>Add from photo · When Then? admin</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4">
    <h1 class="text-2xl font-semibold tracking-tight">Add from photo</h1>
    <a
        href="/admin/cards"
        class="text-sm underline underline-offset-4">Back to cards</a>
</div>

{#if form && 'error' in form && form.error}
    <p
        role="alert"
        class="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        {form.error}
    </p>
{/if}

<form
    bind:this={photoForm}
    method="POST"
    action="?/read"
    enctype="multipart/form-data"
    aria-label="Read a photo"
    class={['mt-4 flex flex-col gap-3', reviewing && 'border-b pb-4']}
    use:enhance={readPhoto}>
    {#if !reviewing}
        <p class="max-w-prose text-muted-foreground">
            Take a photo of anything with historical facts in it: a card from another game, your
            notes, a book page, a museum sign, a screenshot. The AI turns each fact into a draft
            card for you to check. Nothing is saved until you save, and the photo isn't kept.
        </p>
    {/if}
    <div class="flex flex-wrap gap-3">
        <!-- Labels, not buttons: a file input can't sit inside a button. On a phone the first
             opens the camera, the second the photo library. -->
        <label
            class={[
                buttonVariants({ size: 'lg' }),
                'min-h-12 flex-1 cursor-pointer sm:flex-none',
                reading && 'pointer-events-none opacity-50',
            ]}>
            {reviewing ? 'Take another photo' : 'Take photo'}
            <input
                type="file"
                name="photo"
                accept="image/*"
                capture="environment"
                class="sr-only"
                disabled={reading}
                onchange={choose} />
        </label>
        <label
            class={[
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'min-h-12 flex-1 cursor-pointer sm:flex-none',
                reading && 'pointer-events-none opacity-50',
            ]}>
            Choose image
            <input
                type="file"
                name="photo"
                accept="image/*"
                class="sr-only"
                disabled={reading}
                onchange={choose} />
        </label>
    </div>
    {#if reading}
        <p
            role="status"
            class="text-sm text-muted-foreground">
            Reading the photo… this can take half a minute.
        </p>
    {/if}
</form>

{#if reviewing}
    <p
        class="mt-4 text-sm"
        data-testid="photo-summary">
        Found {cardsWord(rows.length)}. Tick the ones to keep and check what's marked
        <em>AI-suggested</em>.
    </p>

    <ul
        class="mt-4 flex flex-col gap-3 pb-28"
        aria-label="Cards found in the photo">
        {#each rows as row (row.candidate.key)}
            {@const date = shownDate(row)}
            {@const candidate = row.candidate}
            <li
                class={['rounded-lg border p-3', row.ticked ? 'bg-background' : 'bg-muted/40']}
                data-testid="candidate">
                <label class="flex items-start gap-3">
                    <input
                        type="checkbox"
                        class="mt-0.5 size-6 shrink-0 accent-primary"
                        bind:checked={row.ticked} />
                    <span class="flex min-w-0 flex-col gap-1.5">
                        <span class="font-medium">
                            {row.texts[candidate.sourceLocale ?? 'en'] || row.texts.en}
                        </span>
                        <span class="flex flex-wrap gap-1.5 text-xs">
                            {#if date}
                                <Badge variant="outline">{date}</Badge>
                            {/if}
                            {#if !row.year && !row.decade}
                                <Badge variant="destructive">Date needed</Badge>
                            {:else if !candidate.dateFromPhoto}
                                <Badge variant="secondary">AI-suggested date</Badge>
                            {:else if dateNeeded(draftOf(row).date)}
                                <Badge variant="destructive">Date needed</Badge>
                            {/if}
                            {#if row.categoryId}
                                <Badge variant="outline">{categoryName(row.categoryId)}</Badge>
                            {:else}
                                <Badge variant="destructive">No category</Badge>
                            {/if}
                            {#if candidate.duplicateOf}
                                <Badge variant="destructive">Possible duplicate</Badge>
                            {/if}
                        </span>
                    </span>
                </label>

                {#if candidate.duplicateOf}
                    <p class="mt-2 text-sm text-muted-foreground">
                        Possible duplicate of:
                        <a
                            href="/admin/cards/{candidate.duplicateOf.id}"
                            target="_blank"
                            class="underline underline-offset-4">{candidate.duplicateOf.text}</a>
                    </p>
                {/if}

                {#if !row.categoryId && candidate.newCategory}
                    {@const suggested = candidate.newCategory}
                    <div
                        class="mt-3 flex flex-col gap-2 rounded-md border border-dashed p-3 text-sm"
                        role="group"
                        aria-label="Category for {row.texts.en}">
                        <p>
                            No matching category — suggested: <strong>{suggested.names.en}</strong>
                        </p>
                        <div class="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                class="min-h-11"
                                onclick={() => startCreating(suggested)}>
                                Create “{suggested.names.en}”
                            </Button>
                            <NativeSelect.Root
                                aria-label="Pick an existing category"
                                class="min-h-11"
                                bind:value={row.categoryId}>
                                <NativeSelect.Option value=""
                                    >Or pick existing…</NativeSelect.Option>
                                {#each data.categories as category (category.id)}
                                    <NativeSelect.Option value={category.id}>
                                        {category.name}
                                    </NativeSelect.Option>
                                {/each}
                            </NativeSelect.Root>
                        </div>
                    </div>
                {/if}

                <details class="mt-3">
                    <summary class="min-h-11 cursor-pointer py-2 text-sm font-medium">Edit</summary>
                    <div class="mt-2 flex flex-col gap-4">
                        {#each cardLocales as locale (locale)}
                            {@const aiText = isAiTranslation(candidate, locale, row.texts[locale])}
                            <div class="flex flex-col gap-1.5">
                                <Label for={textId(row, locale)}>
                                    {localeName[locale]} text
                                    {#if aiText}
                                        <span class="font-normal text-muted-foreground">
                                            · AI translation
                                        </span>
                                    {/if}
                                </Label>
                                <Textarea
                                    id={textId(row, locale)}
                                    rows={2}
                                    bind:value={row.texts[locale]} />
                            </div>
                        {/each}

                        <fieldset class="flex flex-col gap-1.5">
                            <legend class="mb-1.5 text-sm font-medium">
                                Date
                                {#if !candidate.dateFromPhoto && (candidate.date.year !== null || candidate.date.decade !== null)}
                                    <span class="font-normal text-muted-foreground">
                                        · AI-suggested, not from the photo
                                    </span>
                                {/if}
                            </legend>
                            <div class="grid grid-cols-3 gap-2">
                                <div class="flex flex-col gap-1">
                                    <Label
                                        for={fieldId(row, 'year')}
                                        class="text-xs">Year</Label>
                                    <Input
                                        id={fieldId(row, 'year')}
                                        inputmode="numeric"
                                        placeholder="-44 for BC"
                                        bind:value={row.year} />
                                </div>
                                <div class="flex flex-col gap-1">
                                    <Label
                                        for={fieldId(row, 'month')}
                                        class="text-xs">Month</Label>
                                    <NativeSelect.Root
                                        id={fieldId(row, 'month')}
                                        bind:value={row.month}>
                                        <NativeSelect.Option value="">Unknown</NativeSelect.Option>
                                        {#each monthNames as name, index (name)}
                                            <NativeSelect.Option value={String(index + 1)}>
                                                {name}
                                            </NativeSelect.Option>
                                        {/each}
                                    </NativeSelect.Root>
                                </div>
                                <div class="flex flex-col gap-1">
                                    <Label
                                        for={fieldId(row, 'day')}
                                        class="text-xs">Day</Label>
                                    <Input
                                        id={fieldId(row, 'day')}
                                        inputmode="numeric"
                                        bind:value={row.day} />
                                </div>
                            </div>
                            {#if !row.year && row.decade !== null}
                                <p class="text-xs text-muted-foreground">
                                    Only the decade is known: the {decadeLabel(
                                        row.decade,
                                    )}s{row.decade < 0 ? ' BC' : ''}.
                                    <button
                                        type="button"
                                        class="underline underline-offset-4"
                                        onclick={() => (row.decade = null)}>Clear</button>
                                </p>
                            {/if}
                        </fieldset>

                        <div class="grid gap-4 sm:grid-cols-2">
                            <div class="flex flex-col gap-1.5">
                                <Label for={fieldId(row, 'category')}>Category</Label>
                                <NativeSelect.Root
                                    id={fieldId(row, 'category')}
                                    bind:value={row.categoryId}>
                                    <NativeSelect.Option value=""
                                        >Pick a category</NativeSelect.Option>
                                    {#each data.categories as category (category.id)}
                                        <NativeSelect.Option value={category.id}>
                                            {category.name}
                                        </NativeSelect.Option>
                                    {/each}
                                </NativeSelect.Root>
                            </div>
                            <div class="flex flex-col gap-1.5">
                                <Label for={fieldId(row, 'difficulty')}>
                                    Difficulty
                                    <span class="font-normal text-muted-foreground">
                                        · AI-suggested
                                    </span>
                                </Label>
                                <NativeSelect.Root
                                    id={fieldId(row, 'difficulty')}
                                    bind:value={row.difficulty}>
                                    <NativeSelect.Option value="">Not set</NativeSelect.Option>
                                    {#each [1, 2, 3, 4] as level (level)}
                                        <NativeSelect.Option value={String(level)}>
                                            {level}
                                        </NativeSelect.Option>
                                    {/each}
                                </NativeSelect.Root>
                            </div>
                        </div>

                        {#if candidate.sourceQuote}
                            <p class="text-sm text-muted-foreground">
                                From the photo: “{candidate.sourceQuote}”
                            </p>
                        {/if}
                    </div>
                </details>
            </li>
        {/each}
    </ul>

    <form
        method="POST"
        action="?/save"
        aria-label="Save cards"
        class="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t bg-background p-4 shadow-lg sm:flex-row sm:items-center">
        <input
            type="hidden"
            name="cards"
            value={JSON.stringify(tickedDrafts)} />
        <input
            type="hidden"
            name="request_id"
            value={requestId ?? ''} />
        {#if blocked !== -1}
            <p class="text-sm text-destructive">
                {ticked[blocked].texts.en || 'A ticked card'}: {photoDraftErrors(
                    tickedDrafts[blocked],
                ).join(' ')}
            </p>
        {/if}
        <Button
            type="submit"
            size="lg"
            class="min-h-12 sm:ml-auto"
            disabled={ticked.length === 0 || blocked !== -1}>
            Save {cardsWord(ticked.length)} as drafts
        </Button>
    </form>
{/if}

{#if creating}
    <NewCategoryDialog
        bind:open={creatingOpen}
        values={categoryValues(creating)}
        oncreated={created} />
{/if}
