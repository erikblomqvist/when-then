<!--
    The card editor: one form, saved explicitly (no autosave), with an unsaved-changes guard.
    Used by /admin/cards/new and /admin/cards/[id]; both post to their own `?/save` action,
    which goes back to the card list.

    Extension points:
    - Locale tabs (sv, nb): `TranslationTabs`, inside the <form>, sharing this save and guard.
      `translationActions` renders in each tab with `{ locale, english, fill }` (see there).
    - Actions: a `ContextMenu` in the <aside>, outside the <form> (its rows post it with
      `form`): Save, the page's `afterSave` rows (everyday actions such as date verification),
      Publish for a new card or a draft (posting to the page's `?/saveAndPublish`, which saves
      and publishes and goes back to the card list), then the page's `afterPublish` rows
      (status actions such as Archive). `menuActions` gets `{ dirty, unsavedId }`, so rows can
      hold off while there are unsaved changes and point at the note under Status saying so.
    - Sidebar: the `sidebar` snippet renders in the <aside> after the menu, outside the <form>,
      so the forms the status actions submit can be forms of their own; it gets `dirty` too.
      History goes there.
    - Category: with `canCreateCategory`, the select's "New category…" opens
      `NewCategoryDialog` and picks the category it creates, keeping everything typed (#52).
    - Difficulty: optional, 1 (most people know it) to 4 (obscure), as "Add from photo" sets it.
    - Date: `dateActions` renders under the date fields with `{ english, apply }`; `apply` puts a
      suggested year (and its source) into the form, unsaved (AI date suggestion, #42).
-->
<script lang="ts">
    import type { Snippet } from 'svelte'
    import { beforeNavigate } from '$app/navigation'
    import { enhance } from '$app/forms'
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { Textarea } from '#lib/components/ui/textarea/index.js'
    import { cardStatusLabel, type Card } from '#lib/cards/card.js'
    import {
        cardDifficulties,
        cardFormErrors,
        parseCardFormValues,
        cardFormValues,
        settledCardFormValues,
        cardTextMaxLength,
        sourceQuoteMaxLength,
        withSuggestedDate,
        type CardFormErrors,
        type CardFormValues,
        type SuggestedDate,
    } from '#lib/cards/card-form.js'
    import { decadeLabel, decadeOf } from '#lib/cards/date-parts.js'
    import { publishChecklist, publishSuggestions } from '#lib/cards/publish-checklist.js'
    import { yearRequiredFrom } from '#lib/cards/publish-rule.js'
    import type { Category } from '#lib/server/categories.js'
    import PublishChecklist from './PublishChecklist.svelte'
    import TranslationTabs, { type TranslationActions } from './TranslationTabs.svelte'
    import NewCategoryDialog from '../categories/NewCategoryDialog.svelte'
    import SaveIcon from '@lucide/svelte/icons/save'
    import SendIcon from '@lucide/svelte/icons/send'
    import ContextMenu from '../ContextMenu.svelte'
    import type { ContextMenuAction } from '../context-menu.js'
    import { LiveErrors } from '../live-errors.svelte.js'
    import { formShortcut } from '../shortcut.js'

    type Props = {
        /** The values the form starts from (the saved card, or empty). */
        values: CardFormValues
        categories: Category[]
        /** The saved card, or undefined for a new one. */
        card?: Card
        /** From the action result: errors per field. */
        errors?: CardFormErrors
        /** Why the last Publish didn't publish. */
        publishError?: string
        sidebar?: Snippet<[{ dirty: boolean }]>
        /** More rows for the actions menu, after Save and Publish (status actions). */
        menuActions?: (state: { dirty: boolean; unsavedId: string }) => {
            afterSave?: ContextMenuAction[]
            afterPublish?: ContextMenuAction[]
        }
        /** Rendered in each locale tab, e.g. a machine translation button. */
        translationActions?: TranslationActions
        /** Rendered under the date fields, e.g. an AI date suggestion. */
        dateActions?: Snippet<[{ english: string; apply: (date: SuggestedDate) => void }]>
        /** Offer "New category" (admins), posting to the page's `?/createCategory`. */
        canCreateCategory?: boolean
    }

    let {
        values: initial,
        categories,
        card,
        errors = {},
        publishError,
        sidebar,
        menuActions,
        translationActions,
        dateActions,
        canCreateCategory = false,
    }: Props = $props()

    let creatingCategory = $state(false)

    // Cmd/Ctrl + S saves, Cmd/Ctrl + Enter publishes (when that is offered). Not while the
    // new-category dialog is open: its own form takes the shortcut.
    let formElement: HTMLFormElement | undefined = $state()
    const saveId = 'card-save'
    // The "Unsaved changes" note, for rows that wait for a save to say so.
    const unsavedId = 'card-unsaved'
    const publishId = 'card-publish'
    function onkeydown(event: KeyboardEvent) {
        const shortcut = formShortcut(event)
        if (!shortcut || creatingCategory) return
        event.preventDefault()
        const button = document.getElementById(shortcut === 'save' ? saveId : publishId)
        if (button instanceof HTMLButtonElement && !button.disabled) {
            formElement?.requestSubmit(button)
        }
    }

    // "New category…" is an option of the category select: picking it opens the dialog and
    // leaves the card's category as it was until one is created. The select is bound through
    // this setter, so it never holds "new-category" as its own value.
    const newCategory = 'new-category'
    let categorySelect: HTMLSelectElement | null = $state(null)
    function pickCategory(id: string) {
        if (id !== newCategory) {
            values.category_id = id
            return
        }
        if (categorySelect) categorySelect.value = values.category_id
        creatingCategory = true
    }

    // svelte-ignore state_referenced_locally -- the form owns its values once it is shown
    let values = $state({ ...initial })
    // svelte-ignore state_referenced_locally
    let baseline = $state(JSON.stringify(initial))
    let saving = $state(false)
    const dirty = $derived(JSON.stringify(values) !== baseline)

    // The ends of the difficulty scale, said in words (as the AI reading a photo is told).
    const difficultyHint: Record<number, string> = { 1: 'Most people know it', 4: 'Obscure' }

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
    const decadeFromYearOf = ({ year, era }: CardFormValues) => {
        const yearNumber = /^\d+$/.test(year.trim()) ? Number(year) : 0
        return yearNumber > 0
            ? String(decadeLabel(decadeOf(era === 'BC' ? -yearNumber : yearNumber)))
            : null
    }
    const decadeFromYear = $derived(decadeFromYearOf(values))

    // Errors follow what is typed (#52); the decade is checked as the form shows it.
    // The values as the form posts them: the decade as shown (from the year, when there is one).
    const posted = (current: CardFormValues) => ({
        ...current,
        decade: decadeFromYearOf(current) ?? current.decade,
    })
    const live = new LiveErrors(
        () => values,
        (current) => cardFormErrors(posted(current)),
        () => errors,
    )
    const shown = $derived(live.shown)

    // Publish (a new card or a draft) saves what is in the form and publishes it: held back
    // until the checklist under the menu (every requirement, ticked off as it is met) is done.
    const offerPublish = $derived(!card || card.status === 'draft')
    const publishChecks = $derived(publishChecklist(posted(values)))
    const publishOpen = $derived(publishChecks.some((check) => !check.done))
    const publishSuggested = $derived(publishSuggestions(posted(values), card))
    const checklistId = 'publish-checklist'

    // The actions menu: Save, the page's everyday rows, Publish when offered, then the page's
    // status rows.
    const pageActions = $derived(menuActions?.({ dirty, unsavedId }) ?? {})
    const menu: ContextMenuAction[] = $derived([
        {
            id: saveId,
            label: 'Save',
            icon: SaveIcon,
            form: 'card-editor',
            keys: ['mod', 's'],
            disabled: saving,
        },
        ...(pageActions.afterSave ?? []),
        ...(offerPublish
            ? [
                  {
                      id: publishId,
                      label: 'Publish',
                      icon: SendIcon,
                      tone: 'constructive',
                      form: 'card-editor',
                      formaction: '?/saveAndPublish',
                      keys: ['mod', 'enter'],
                      disabled: saving || publishOpen,
                      describedBy: publishOpen ? checklistId : undefined,
                  } satisfies ContextMenuAction,
              ]
            : []),
        ...(pageActions.afterPublish ?? []),
    ])

    // Changing a verified date asks whether to clear the verification (sent with the save).
    const dateFields = ['era', 'decade', 'year', 'month', 'day'] as const
    const dateChanged = () => {
        if (!card) return false
        const saved = cardFormValues(card)
        const now = { ...values, decade: decadeFromYear ?? values.decade }
        return dateFields.some((name) => now[name].trim() !== saved[name].trim())
    }

    const applyDate = (date: SuggestedDate) => (values = withSuggestedDate(values, date))

    beforeNavigate((navigation) => {
        if (!dirty || saving) return
        // Closing the tab or leaving the site: the browser asks with its own dialog.
        if (navigation.type === 'leave') navigation.cancel()
        else if (!confirm('You have unsaved changes. Leave without saving them?')) {
            navigation.cancel()
        }
    })

    const describedBy = (name: keyof CardFormValues) => (shown[name] ? `${name}-error` : undefined)
</script>

{#snippet error(name: keyof CardFormValues)}
    {#if shown[name]}
        <p
            id="{name}-error"
            class="text-sm text-destructive">
            {shown[name]}
        </p>
    {/if}
{/snippet}

<svelte:window {onkeydown} />

<div class="grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
    <form
        bind:this={formElement}
        id="card-editor"
        method="POST"
        action="?/save"
        class="flex flex-col gap-6"
        onfocusout={live.onfocusout}
        use:enhance={({ formData, cancel }) => {
            if (!live.attempt()) return cancel()
            if (
                card?.verifiedAt &&
                dateChanged() &&
                confirm(
                    'This card’s date was verified, and you changed it. Clear the verification? (Cancel keeps it.)',
                )
            ) {
                formData.set('clear_verification', 'true')
            }
            saving = true
            const submitted = $state.snapshot(values)
            return async ({ result, update }) => {
                if (result.type === 'success' || result.type === 'redirect') {
                    // Unless typed since, the form now shows what was saved; ticks are spent.
                    const settled = settledCardFormValues(submitted)
                    // Typed during the save: those edits keep their errors.
                    if (JSON.stringify(values) === JSON.stringify(submitted)) {
                        values = settled
                        live.settle()
                    }
                    baseline = JSON.stringify(settled)
                }
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
                aria-invalid={shown.text_en ? 'true' : undefined}
                aria-describedby={describedBy('text_en')} />
            {@render error('text_en')}
            <Label
                for="note_en"
                class="mt-2">English note (optional)</Label>
            <Textarea
                id="note_en"
                name="note_en"
                rows={2}
                bind:value={values.note_en} />
        </section>

        <TranslationTabs
            bind:values
            {card}
            errors={shown}
            actions={translationActions} />

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
                        aria-invalid={shown.decade ? 'true' : undefined}
                        aria-describedby={describedBy('decade')} />
                </div>
                <div class="flex w-28 flex-col gap-2">
                    <Label for="year">Year</Label>
                    <Input
                        id="year"
                        name="year"
                        inputmode="numeric"
                        bind:value={values.year}
                        aria-invalid={shown.year ? 'true' : undefined}
                        aria-describedby={describedBy('year')} />
                </div>
                <div class="flex flex-col gap-2">
                    <Label for="month">Month</Label>
                    <NativeSelect.Root
                        id="month"
                        name="month"
                        bind:value={values.month}
                        aria-invalid={shown.month ? 'true' : undefined}
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
                        aria-invalid={shown.day ? 'true' : undefined}
                        aria-describedby={describedBy('day')} />
                </div>
            </div>
            <p class="text-sm text-muted-foreground">
                Fill in what is known. A year fills the decade; from {yearRequiredFrom} on, a card needs
                one. Month and day are optional.
            </p>
            {@render error('decade')}
            {@render error('year')}
            {@render error('month')}
            {@render error('day')}
            {@render dateActions?.({ english: values.text_en, apply: applyDate })}
        </fieldset>

        <div class="flex flex-col gap-2">
            <Label for="category_id">Category</Label>
            <NativeSelect.Root
                id="category_id"
                name="category_id"
                bind:ref={categorySelect}
                bind:value={() => values.category_id, pickCategory}
                aria-invalid={shown.category_id ? 'true' : undefined}
                aria-describedby={describedBy('category_id')}>
                <NativeSelect.Option
                    value=""
                    disabled>
                    {categories.length > 0 ? 'Choose a category' : 'No categories yet'}
                </NativeSelect.Option>
                {#each categories as category (category.id)}
                    <NativeSelect.Option value={category.id}>
                        {category.name}{category.archived ? ' (archived)' : ''}
                    </NativeSelect.Option>
                {/each}
                {#if canCreateCategory}
                    <hr />
                    <NativeSelect.Option value={newCategory}>New category…</NativeSelect.Option>
                {/if}
            </NativeSelect.Root>
            {#if !canCreateCategory}
                <p class="text-sm text-muted-foreground">
                    No fitting category? Ask an admin to add one.
                </p>
            {/if}
            {@render error('category_id')}
        </div>

        <div class="flex flex-col gap-2">
            <Label for="difficulty">Difficulty (optional)</Label>
            <NativeSelect.Root
                id="difficulty"
                name="difficulty"
                bind:value={values.difficulty}
                aria-invalid={shown.difficulty ? 'true' : undefined}
                aria-describedby={describedBy('difficulty')}>
                <NativeSelect.Option value="">Not set</NativeSelect.Option>
                {#each cardDifficulties as level (level)}
                    <NativeSelect.Option value={String(level)}>
                        {level}{difficultyHint[level] ? ` · ${difficultyHint[level]}` : ''}
                    </NativeSelect.Option>
                {/each}
            </NativeSelect.Root>
            <p class="text-sm text-muted-foreground">
                How hard the card is to place: 1, most people know it, to 4, obscure.
            </p>
            {@render error('difficulty')}
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
                    aria-invalid={shown.source_url ? 'true' : undefined}
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
                    aria-invalid={shown.source_quote ? 'true' : undefined}
                    aria-describedby={describedBy('source_quote')} />
                {@render error('source_quote')}
            </div>
        </fieldset>
    </form>

    <aside
        aria-label="Card"
        class="flex flex-col gap-4 text-sm">
        <div class="mb-2 flex flex-col gap-1">
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
            <p
                id={unsavedId}
                role="status"
                class="text-muted-foreground empty:hidden">
                {#if dirty}Unsaved changes{/if}
            </p>
        </div>
        <div class="flex flex-col gap-2">
            <ContextMenu
                label="Card actions"
                actions={menu} />
            {#if offerPublish}
                <div class="mt-4">
                    <PublishChecklist
                        id={checklistId}
                        checks={publishChecks}
                        suggestions={publishSuggested} />
                </div>
                {#if publishError}
                    <p
                        role="alert"
                        class="text-destructive">
                        {publishError}
                    </p>
                {/if}
            {/if}
        </div>
        {@render sidebar?.({ dirty })}
    </aside>
</div>

{#if canCreateCategory}
    <NewCategoryDialog
        bind:open={creatingCategory}
        oncreated={(id) => (values.category_id = id)} />
{/if}
