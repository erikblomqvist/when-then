<!--
    "Add from photo" (#60), made for a phone. Take photos (or choose them) of anything with
    historical facts in it; they wait as thumbnails until "Read", then the AI reads each into
    candidate cards. Tick the ones to keep, edit them in place, look up the exact date of a card
    from `exactDateFrom` (1800) on, or any date of an undated one ("Find date": Wikidata, then the
    web), create a suggested category where none fits, and save the
    ticked ones as drafts. More photos can be added under the list; their cards join it. What
    the AI inferred rather than read (a date not in the photo, the difficulty, the translations)
    is marked, and likely repeats of existing cards start unticked.

    On a phone the page only takes photos with the camera; the "Add from photo" link opens the
    camera itself and hands the photo over (`#lib/admin/cards/photo-handoff.ts`).
-->
<script lang="ts">
    import { onMount, untrack } from 'svelte'
    import CameraIcon from '@lucide/svelte/icons/camera'
    import ImagesIcon from '@lucide/svelte/icons/images'
    import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle'
    import SearchIcon from '@lucide/svelte/icons/search'
    import XIcon from '@lucide/svelte/icons/x'
    import { enhance } from '$app/forms'
    import type { SubmitFunction } from '$app/forms'
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button, buttonVariants } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { Textarea } from '#lib/components/ui/textarea/index.js'
    import NewCategoryDialog from '#lib/admin/categories/NewCategoryDialog.svelte'
    import { takeHandedPhotos, usesCamera } from '#lib/admin/cards/photo-handoff.js'
    import { shrinkPhotos } from '#lib/admin/cards/shrink-photo.js'
    import { cardLocales, type CardLocale } from '#lib/cards/card.js'
    import { cardCountries, countryName } from '#lib/cards/country.js'
    import { decadeLabel, decadeOf, formatCardDate, monthNames } from '#lib/cards/date-parts.js'
    import {
        dateNeeded,
        exactDateWanted,
        isAiTranslation,
        photoDraftErrors,
        photoLimit,
        photoTextStatus,
        type PhotoCandidate,
        type PhotoDraft,
        type SuggestedCategory,
    } from '#lib/cards/photo-import.js'
    import { localeName } from '#lib/cards/translation.js'
    import { englishNameKey, type CategoryFormValues } from '#lib/categories/category-form.js'
    import type { DateSuggestion } from '#lib/server/ai-suggest-date.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    /** A candidate as the admin edits it. */
    type Row = {
        /** Unique across readings, to key the list and its fields by. */
        id: number
        candidate: PhotoCandidate
        /** The reading it came from: its audit row, and its key for "Find date". */
        requestId: number | null
        requestKey: string
        ticked: boolean
        texts: Record<CardLocale, string>
        year: string
        month: string
        day: string
        /** Kept when the AI knew only the decade and no year is typed. */
        decade: number | null
        difficulty: string
        /** '' or a country code: the AI's guess until the admin changes it. */
        countrySpecific: string
        categoryId: string
        /** "Find date": the sourced date it found, while looking, and why it found none. */
        found: DateSuggestion | null
        /** It looked, and found nothing the card hadn't got already. */
        noMore: boolean
        finding: boolean
        findProblem: string | null
    }

    let nextId = 0
    const toRow = (
        candidate: PhotoCandidate,
        reading: { requestId: number | null; requestKey: string },
    ): Row => ({
        id: nextId++,
        candidate,
        requestId: reading.requestId,
        requestKey: reading.requestKey,
        ticked: candidate.duplicateOf === null,
        texts: { ...candidate.texts },
        year: candidate.date.year === null ? '' : String(candidate.date.year),
        month: candidate.date.month === null ? '' : String(candidate.date.month),
        day: candidate.date.day === null ? '' : String(candidate.date.day),
        decade: candidate.date.year === null ? candidate.date.decade : null,
        difficulty: candidate.difficulty === null ? '' : String(candidate.difficulty),
        countrySpecific: candidate.countrySpecific ?? '',
        categoryId: candidate.categoryId ?? '',
        found: null,
        noMore: false,
        finding: false,
        findProblem: null,
    })

    let rows: Row[] = $state([])
    let photosRead = $state(0)

    // A new reading joins the list; reloads (after creating a category) keep the edits.
    let shownReading: unknown = null
    $effect.pre(() => {
        const reading = form?.stage === 'review' ? form : null
        untrack(() => {
            if (!reading || reading === shownReading) return
            shownReading = reading
            rows = [
                ...rows,
                ...reading.readings.flatMap((one) =>
                    one.candidates.map((candidate) => toRow(candidate, one)),
                ),
            ]
            photosRead += reading.readings.length
        })
    })

    const reviewing = $derived(rows.length > 0)

    const whole = (value: string) => (/^-?\d+$/.test(value.trim()) ? Number(value) : null)

    /** The found date, while the year typed is still the one it found. */
    const foundDate = (row: Row) =>
        row.found && whole(row.year) === row.found.year ? row.found : null

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
        const found = foundDate(row)
        return {
            categoryId: row.categoryId,
            date: {
                decade: year !== null && year !== 0 ? decadeOf(year) : row.decade,
                year,
                month,
                day: month === null ? null : whole(row.day),
            },
            sourceUrl: found?.sourceUrl ?? null,
            sourceQuote: (found ? found.sourceQuote : row.candidate.sourceQuote) || null,
            difficulty: whole(row.difficulty),
            countrySpecific: row.countrySpecific || null,
            translations,
            requestId: row.requestId,
        }
    }

    const ticked = $derived(rows.filter((row) => row.ticked))
    const tickedDrafts = $derived(ticked.map(draftOf))
    const blocked = $derived(
        tickedDrafts.map(photoDraftErrors).findIndex((errors) => errors.length > 0),
    )

    // Photos wait as thumbnails until "Read"; then they are shrunk to fit one upload and sent
    // together.
    type Waiting = { id: number; file: File; url: string }
    let waiting: Waiting[] = $state([])
    let nextPhoto = 0
    let camera = $state(false)
    let reading = $state(0)

    function addPhotos(files: File[]) {
        const room = photoLimit - waiting.length
        waiting = [
            ...waiting,
            ...files.slice(0, room).map((file) => ({
                id: nextPhoto++,
                file,
                url: URL.createObjectURL(file),
            })),
        ]
    }

    function removePhoto(photo: Waiting) {
        URL.revokeObjectURL(photo.url)
        waiting = waiting.filter((one) => one !== photo)
    }

    onMount(() => {
        camera = usesCamera()
        addPhotos(takeHandedPhotos())
        return () => waiting.forEach((photo) => URL.revokeObjectURL(photo.url))
    })

    function choose(event: Event & { currentTarget: HTMLInputElement }) {
        const files = [...(event.currentTarget.files ?? [])]
        event.currentTarget.value = ''
        addPhotos(files)
    }

    const readPhotos: SubmitFunction = async ({ formData, cancel }) => {
        const sent = waiting
        if (sent.length === 0) return cancel()
        reading = sent.length
        formData.delete('photo')
        for (const photo of await shrinkPhotos(sent.map(({ file }) => file))) {
            formData.append('photo', photo)
        }
        return async ({ result, update }) => {
            await update()
            if (result.type === 'success') sent.forEach(removePhoto)
            reading = 0
        }
    }

    // Saving: the button waits (with a spinner) until the drafts are created and the page moves
    // on to the card list, or a refusal comes back.
    let saving = $state(false)
    const saveDrafts: SubmitFunction = () => {
        saving = true
        return async ({ result, update }) => {
            await update()
            if (result.type !== 'redirect') saving = false
        }
    }

    // "Find date": the editor's sourced lookup, for a card without an exact date. The date it
    // finds (the year, and the month and day when its source states them) goes straight in, with
    // its source; Undo puts the AI's own date back. A date that adds nothing to the card's (the
    // same year, no month or day it hasn't got) leaves the card alone and says so.
    async function findDate(row: Row) {
        row.finding = true
        row.noMore = false
        row.findProblem = null
        try {
            const response = await fetch('/admin/cards/photo/suggest-date', {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json' },
                body: JSON.stringify({
                    english: row.texts.en,
                    categoryId: row.categoryId,
                    requestKey: row.requestKey,
                }),
            })
            const answer = (await response.json().catch(() => ({}))) as {
                suggestion?: DateSuggestion
                message?: string
            }
            if (response.ok && answer.suggestion) {
                const { year, month, day } = answer.suggestion
                const adds =
                    whole(row.year) !== year ||
                    (month !== null && whole(row.month) !== month) ||
                    (day !== null && whole(row.day) !== day)
                if (!adds) {
                    row.noMore = true
                    return
                }
                if (month !== null) {
                    row.month = String(month)
                    row.day = day === null ? '' : String(day)
                } else if (whole(row.year) !== year) {
                    row.month = ''
                    row.day = ''
                }
                row.found = answer.suggestion
                row.year = String(year)
                row.decade = null
            } else row.findProblem = answer.message ?? 'No date found. Try again.'
        } catch {
            row.findProblem = 'The lookup failed. Check your connection and try again.'
        } finally {
            row.finding = false
        }
    }

    function undoFound(row: Row) {
        const { date } = row.candidate
        row.found = null
        row.year = date.year === null ? '' : String(date.year)
        row.month = date.month === null ? '' : String(date.month)
        row.day = date.day === null ? '' : String(date.day)
        row.decade = date.year === null ? date.decade : null
    }

    /** Worth looking up (unless found already: its source gave no more). */
    const exactDateMissing = (row: Row) =>
        !foundDate(row) &&
        !row.noMore &&
        !!row.texts.en.trim() &&
        exactDateWanted(draftOf(row).date)
    const missing = $derived(ticked.filter((row) => exactDateMissing(row) && !row.finding))

    /** Looks up the exact date of every ticked card without one, three at a time. */
    async function findMissingDates() {
        const queue = [...missing]
        const next = async (): Promise<void> => {
            const row = queue.shift()
            if (!row) return
            await findDate(row)
            return next()
        }
        await Promise.all([next(), next(), next()])
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

    const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`
    const cardsWord = (count: number) => plural(count, 'card')
    const textId = (row: Row, locale: CardLocale) => `text-${row.id}-${locale}`
    const fieldId = (row: Row, name: string) => `${name}-${row.id}`
    const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '')

    const shownDate = (row: Row) => {
        const draft = draftOf(row)
        return draft.date.decade === null ? null : formatCardDate(draft.date)
    }
</script>

<svelte:head>
    <title>Add from photo · When Then? admin</title>
</svelte:head>

<!-- The photos waiting to be read, with a way to add more and to read them. Above the list
     until there is one, then under it. -->
{#snippet photoPicker()}
    <form
        method="POST"
        action="?/read"
        enctype="multipart/form-data"
        aria-label="Read photos"
        class="flex flex-col gap-3"
        use:enhance={readPhotos}>
        {#if waiting.length > 0}
            <ul
                class="grid grid-cols-3 gap-2 sm:grid-cols-5"
                aria-label="Photos to read">
                {#each waiting as photo, index (photo.id)}
                    <li class="relative aspect-square overflow-hidden rounded-md border bg-muted">
                        <img
                            src={photo.url}
                            alt="Photo {index + 1}"
                            class="size-full object-cover" />
                        {#if !reading}
                            <button
                                type="button"
                                class="absolute top-1 right-1 grid size-8 cursor-pointer place-items-center rounded-full bg-background/90 shadow"
                                aria-label="Remove photo {index + 1}"
                                onclick={() => removePhoto(photo)}>
                                <XIcon
                                    class="size-4"
                                    aria-hidden="true" />
                            </button>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
        <div class="flex flex-wrap gap-3">
            <!-- A label, not a button: a file input can't sit inside a button. On a touch screen
                 it opens the camera, otherwise it picks files (several at once). -->
            <label
                class={[
                    buttonVariants({
                        size: 'lg',
                        variant: waiting.length > 0 || reviewing ? 'outline' : 'default',
                    }),
                    'min-h-12 flex-1 cursor-pointer sm:flex-none',
                    (reading || waiting.length >= photoLimit) && 'pointer-events-none opacity-50',
                ]}>
                {#if camera}
                    <CameraIcon aria-hidden="true" />
                {:else}
                    <ImagesIcon aria-hidden="true" />
                {/if}
                {#if waiting.length > 0 || reviewing}
                    Add more photos
                {:else}
                    {camera ? 'Take photo' : 'Choose photos'}
                {/if}
                <input
                    type="file"
                    accept="image/*"
                    capture={camera ? 'environment' : undefined}
                    multiple={!camera}
                    class="sr-only"
                    disabled={reading > 0 || waiting.length >= photoLimit}
                    onchange={choose} />
            </label>
            {#if waiting.length > 0}
                <Button
                    type="submit"
                    size="lg"
                    class="min-h-12 flex-1 sm:flex-none"
                    disabled={reading > 0}
                    aria-busy={reading > 0}>
                    {#if reading}
                        <LoaderCircleIcon
                            class="animate-spin"
                            aria-hidden="true" />
                        Reading {plural(reading, 'photo')}…
                    {:else}
                        Read {plural(waiting.length, 'photo')}
                    {/if}
                </Button>
            {/if}
        </div>
        {#if reading}
            <p
                role="status"
                class="text-sm text-muted-foreground">
                This can take half a minute.
            </p>
        {:else if waiting.length >= photoLimit}
            <p class="text-sm text-muted-foreground">
                {photoLimit} photos is the most at a time. Read these, then add more.
            </p>
        {/if}
    </form>
{/snippet}

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
{#if form?.stage === 'review' && form.problems.length > 0}
    <ul
        role="alert"
        class="mt-4 flex flex-col gap-1 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        {#each form.problems as problem (problem)}
            <li>{problem}</li>
        {/each}
    </ul>
{/if}

{#if !reviewing}
    <div class="mt-4 flex flex-col gap-3">
        <p class="max-w-prose text-muted-foreground">
            Take photos of anything with historical facts in them: cards from another game, your
            notes, a book page, a museum sign, a screenshot. The AI turns each fact into a draft
            card for you to check. Nothing is saved until you save, and the photos aren't kept.
        </p>
        {@render photoPicker()}
    </div>
{:else}
    <div class="mt-4 flex flex-wrap items-center gap-3">
        <p
            class="text-sm"
            data-testid="photo-summary">
            Found {cardsWord(rows.length)}{photosRead > 1 ? ` in ${photosRead} photos` : ''}. Tick
            the ones to keep and check what's marked <em>AI-suggested</em>.
        </p>
        {#if missing.length > 0}
            <Button
                type="button"
                variant="outline"
                class="min-h-11"
                onclick={findMissingDates}>
                <SearchIcon aria-hidden="true" />
                Find {plural(missing.length, 'exact date')}
            </Button>
        {/if}
    </div>

    <ul
        class="mt-4 flex flex-col gap-3"
        aria-label="Cards found in the photos">
        {#each rows as row (row.id)}
            {@const date = shownDate(row)}
            {@const candidate = row.candidate}
            {@const found = foundDate(row)}
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
                            {#if row.finding}
                                <Badge variant="outline">Finding the date…</Badge>
                            {:else if found}
                                <Badge variant="secondary">Date found online</Badge>
                            {:else if !row.year && !row.decade}
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
                            {#if row.countrySpecific}
                                <Badge variant="secondary">
                                    {countryName(
                                        row.countrySpecific,
                                    )}-specific{row.countrySpecific === candidate.countrySpecific
                                        ? ' · AI-suggested'
                                        : ''}
                                </Badge>
                            {/if}
                            {#if candidate.duplicateOf}
                                <Badge variant="destructive">Possible duplicate</Badge>
                            {/if}
                        </span>
                    </span>
                </label>

                {#if found}
                    <p class="mt-2 text-sm text-muted-foreground">
                        {formatCardDate({
                            decade: null,
                            year: found.year,
                            month: found.month,
                            day: found.day,
                        })} from
                        <a
                            href={found.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="underline underline-offset-4">{hostOf(found.sourceUrl)}</a
                        >{#if found.sourceQuote}: “{found.sourceQuote}”{/if}
                        <button
                            type="button"
                            class="cursor-pointer underline underline-offset-4"
                            onclick={() => undoFound(row)}>Undo</button>
                    </p>
                {:else if row.noMore && !row.finding}
                    <p class="mt-2 text-sm text-muted-foreground">
                        No exact day found online; the date stays {date}.
                        <button
                            type="button"
                            class="cursor-pointer underline underline-offset-4"
                            onclick={() => findDate(row)}>Try again</button>
                    </p>
                {:else if exactDateMissing(row) || row.finding}
                    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            class="min-h-11"
                            disabled={row.finding}
                            aria-busy={row.finding}
                            onclick={() => findDate(row)}>
                            {#if row.finding}
                                <LoaderCircleIcon
                                    class="animate-spin"
                                    aria-hidden="true" />
                                Looking it up…
                            {:else}
                                <SearchIcon aria-hidden="true" />
                                Find date
                            {/if}
                        </Button>
                        {#if row.findProblem}
                            <span
                                role="alert"
                                class="text-destructive">{row.findProblem}</span>
                        {/if}
                    </div>
                {/if}

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
                                {#if found}
                                    <span class="font-normal text-muted-foreground">
                                        · found online
                                    </span>
                                {:else if !candidate.dateFromPhoto && (candidate.date.year !== null || candidate.date.decade !== null)}
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
                            <div class="flex flex-col gap-1.5">
                                <Label for={fieldId(row, 'country')}>
                                    Country-specific
                                    {#if row.countrySpecific === (candidate.countrySpecific ?? '')}
                                        <span class="font-normal text-muted-foreground">
                                            · AI-suggested
                                        </span>
                                    {/if}
                                </Label>
                                <NativeSelect.Root
                                    id={fieldId(row, 'country')}
                                    bind:value={row.countrySpecific}>
                                    <NativeSelect.Option value="">No</NativeSelect.Option>
                                    {#each [...new Set( [...cardCountries, ...(candidate.countrySpecific ? [candidate.countrySpecific] : [])] )] as code (code)}
                                        <NativeSelect.Option value={code}>
                                            {countryName(code)}
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

    <!-- Room for the save bar fixed at the bottom. -->
    <div class="mt-6 pb-28">
        {@render photoPicker()}
    </div>

    <form
        method="POST"
        action="?/save"
        aria-label="Save cards"
        use:enhance={saveDrafts}
        class="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t bg-background p-4 shadow-lg sm:flex-row sm:items-center">
        <input
            type="hidden"
            name="cards"
            value={JSON.stringify(tickedDrafts)} />
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
            disabled={saving || ticked.length === 0 || blocked !== -1}
            aria-busy={saving}>
            {#if saving}
                <LoaderCircleIcon
                    class="animate-spin"
                    aria-hidden="true" />
                Saving {cardsWord(ticked.length)}…
            {:else}
                Save {cardsWord(ticked.length)} as drafts
            {/if}
        </Button>
    </form>
{/if}

{#if creating}
    <NewCategoryDialog
        bind:open={creatingOpen}
        values={categoryValues(creating)}
        oncreated={created} />
{/if}
