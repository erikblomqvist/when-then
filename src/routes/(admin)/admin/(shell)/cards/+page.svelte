<script lang="ts">
    import { goto } from '$app/navigation'
    import { page } from '$app/state'
    import { Button, buttonVariants } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import * as Table from '#lib/components/ui/table/index.js'
    import AddFromPhoto from '#lib/admin/cards/AddFromPhoto.svelte'
    import ExportCards from '#lib/admin/cards/ExportCards.svelte'
    import InlineTranslation from '#lib/admin/cards/InlineTranslation.svelte'
    import TranslationBadge from '#lib/admin/cards/TranslationBadge.svelte'
    import { cardLocales, cardStatusLabel, type CardStatus } from '#lib/cards/card.js'
    import {
        cardEraLabel,
        cardListHref,
        isFiltered,
        parseCardListView,
        parseFilter,
        reviewParam,
        reviewQueueHref,
        reviewSwitchFilter,
        translationFilterLabel,
        translationFilters,
        type CardEra,
        type CardReview,
        type CardSort,
    } from '#lib/cards/card-list.js'
    import { localeName, translationLocales } from '#lib/cards/translation.js'
    import { cardCountries, countryName } from '#lib/cards/country.js'
    import { formatCardDate } from '#lib/cards/date-parts.js'
    import { filterParams } from '#lib/cards/card-list.js'
    import BulkActionBar from '#lib/admin/cards/BulkActionBar.svelte'
    import { CardListSelection } from '#lib/admin/cards/card-list-selection.svelte.js'
    import { untrack } from 'svelte'
    import ArrowDownIcon from '@lucide/svelte/icons/arrow-down'
    import ArrowUpDownIcon from '@lucide/svelte/icons/arrow-up-down'
    import ArrowUpIcon from '@lucide/svelte/icons/arrow-up'
    import CheckIcon from '@lucide/svelte/icons/check'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import XIcon from '@lucide/svelte/icons/x'
    import type { PageProps } from './$types'

    let { data, form: result }: PageProps = $props()

    const updated = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    // Archived cards have a tab of their own, so the status filter picks within the Cards tab.
    const statuses = (Object.keys(cardStatusLabel) as CardStatus[]).filter(
        (status) => status !== 'archived',
    )
    const eras = Object.keys(cardEraLabel) as CardEra[]
    const yesNo = (value: boolean | undefined) => (value === undefined ? '' : value ? 'yes' : 'no')

    let form: HTMLFormElement | undefined = $state()

    const filter = $derived(data.view.filter)
    const filtered = $derived(isFiltered(filter))
    // Review mode: one locale's translations next to a reference language, kept on every link.
    const review = $derived(data.view.review)

    // Drafts just added from a photo (#60) come back as `?new=<id>`, highlighted in the list.
    const addedCards = $derived(new Set(page.url.searchParams.getAll('new')))

    // Without JavaScript the GET form navigates as is; with it, go to the canonical URL (no
    // empty fields), keeping focus in the search box.
    function apply(event: SubmitEvent) {
        event.preventDefault()
        const fields = new URLSearchParams()
        for (const [name, value] of new FormData(event.currentTarget as HTMLFormElement)) {
            if (typeof value === 'string') fields.set(name, value)
        }
        const { filter, sort, review } = parseCardListView(fields)
        void goto(cardListHref({ filter, sort, review }), { reset: false })
    }

    const submit = () => form?.requestSubmit()

    // The filters a list can be narrowed by, keyed by their URL parameter. Only the ones in use
    // show in the toolbar; "Add filter" brings in another, which holds no value until chosen.
    type FilterOption = {
        name: string
        label: string
        value: string
        choices: { value: string; label: string }[]
    }
    const filterOptions: FilterOption[] = $derived([
        ...(filter.archived
            ? []
            : [
                  {
                      name: 'status',
                      label: 'Status',
                      value: filter.status ?? '',
                      choices: statuses.map((status) => ({
                          value: status,
                          label: cardStatusLabel[status],
                      })),
                  },
              ]),
        {
            name: 'category',
            label: 'Category',
            value: filter.categoryId ?? '',
            choices: data.categories.map((category) => ({
                value: category.id,
                label: `${category.name}${category.archived ? ' (archived)' : ''}`,
            })),
        },
        {
            name: 'verified',
            label: 'Verified',
            value: yesNo(filter.verified),
            choices: [
                { value: 'yes', label: 'Verified' },
                { value: 'no', label: 'Not verified' },
            ],
        },
        {
            name: 'source',
            label: 'Source',
            value: yesNo(filter.hasSource),
            choices: [
                { value: 'yes', label: 'Has a source' },
                { value: 'no', label: 'No source' },
            ],
        },
        {
            name: 'era',
            label: 'Date',
            value: filter.era ?? '',
            choices: eras.map((era) => ({ value: era, label: cardEraLabel[era] })),
        },
        {
            name: 'country',
            label: 'Country-specific',
            value: filter.country ?? '',
            choices: [
                ...cardCountries.map((code) => ({ value: code, label: countryName(code) })),
                { value: 'none', label: 'Not country-specific' },
            ],
        },
        ...translationLocales.map((locale) => ({
            name: locale,
            label: localeName[locale],
            value: filter.translations?.[locale] ?? '',
            choices: translationFilters.map((state) => ({
                value: state,
                label: translationFilterLabel[state],
            })),
        })),
    ])

    /** Filters added in the toolbar, in the order added, with or without a value yet. */
    let added: string[] = $state([])
    /** The filter just added, whose select takes focus once it shows. */
    let justAdded: string | undefined = $state()
    // Filters from the URL first, in their usual order; then the added ones, newest last.
    const shownFilters = $derived(
        filterOptions
            .filter((option) => option.value || added.includes(option.name))
            .toSorted((a, b) => added.indexOf(a.name) - added.indexOf(b.name)),
    )
    const hiddenFilters = $derived(filterOptions.filter((option) => !shownFilters.includes(option)))

    function add(name: string) {
        added = [...added, name]
        justAdded = name
    }

    const forget = (name: string) => (added = added.filter((other) => other !== name))

    /** The list without one filter, keeping the rest and the sort. */
    function withoutFilter(name: string) {
        const params = filterParams(filter)
        params.delete(name)
        return cardListHref({ filter: parseFilter(params), sort: data.view.sort, review })
    }

    // Sorting by a column header: the first click picks the column's usual direction (oldest
    // date first, most recently updated first), the next reverses it.
    const sortColumns = {
        date: { ascending: 'date', descending: '-date', first: 'date' },
        updated: { ascending: 'updated', descending: '-updated', first: '-updated' },
    } satisfies Record<string, { ascending: CardSort; descending: CardSort; first: CardSort }>
    type SortColumn = keyof typeof sortColumns

    function sortState(column: SortColumn): 'ascending' | 'descending' | undefined {
        const { ascending, descending } = sortColumns[column]
        return data.view.sort === ascending
            ? 'ascending'
            : data.view.sort === descending
              ? 'descending'
              : undefined
    }

    function sortHref(column: SortColumn) {
        const { ascending, descending, first } = sortColumns[column]
        const current = sortState(column)
        const sort =
            current === undefined ? first : current === 'ascending' ? descending : ascending
        return cardListHref({ filter, sort, review })
    }

    // Row selection for the bulk actions; kept across pages, cleared when the filter changes.
    const selected = new CardListSelection(() => ({
        filter: data.view.filter,
        total: data.total,
        pageIds: data.cards.map((card) => card.id),
    }))
    const filterKey = $derived(filterParams(data.view.filter).toString())
    $effect(() => {
        void filterKey
        untrack(() => selected.clear())
    })
    const activeCategories = $derived(data.categories.filter((category) => !category.archived))
</script>

<svelte:head>
    <title>Cards · When Then? admin</title>
</svelte:head>

<div class="flex flex-wrap items-end justify-between gap-4">
    <div>
        <h1 class="text-2xl font-semibold tracking-tight">Cards</h1>
        <p
            class="text-sm text-muted-foreground"
            data-testid="card-count">
            {data.total}
            {data.total === 1 ? 'card' : 'cards'}{filtered ? ' match' : ''}
        </p>
    </div>
    <div class="flex flex-wrap items-end gap-4">
        <ExportCards
            {filter}
            total={data.total} />
        {#if data.role === 'admin'}
            <Button
                href="/admin/cards/import"
                variant="outline">Import</Button>
            <AddFromPhoto class={buttonVariants({ variant: 'outline' })}
                >Add from photo</AddFromPhoto>
        {/if}
        <Button href="/admin/cards/new">New card</Button>
    </div>
</div>

{#if addedCards.size > 0}
    <p
        role="status"
        class="mt-4 rounded-md border bg-muted px-3 py-2 text-sm">
        Added {addedCards.size}
        {addedCards.size === 1 ? 'draft' : 'drafts'} from your photo, highlighted below.
    </p>
{/if}

<nav
    aria-label="Card tabs"
    class="mt-6 flex gap-1 border-b text-sm">
    {#each [{ archived: undefined, label: 'Cards', count: data.tabCounts.active }, { archived: true as const, label: 'Archived', count: data.tabCounts.archived }] as tab (tab.label)}
        <a
            href={cardListHref({
                filter: { ...filter, status: undefined, archived: tab.archived },
                sort: data.view.sort,
                review,
            })}
            aria-current={filter.archived === tab.archived ? 'page' : undefined}
            class={[
                '-mb-px border-b-2 px-3 py-2',
                filter.archived === tab.archived
                    ? 'border-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
            ]}>
            {tab.label}
            <span class="text-muted-foreground">({tab.count})</span>
        </a>
    {/each}
</nav>

<!-- A segment of the review mode switch: a link keeping the sort, and the filter but for what
     switching the locale changes (`reviewSwitchFilter`). -->
{#snippet segment(label: string, to: CardReview | undefined, current: boolean)}
    <a
        href={cardListHref({
            filter: reviewSwitchFilter(filter, review?.locale, to?.locale),
            sort: data.view.sort,
            review: to,
        })}
        aria-current={current ? 'true' : undefined}
        class={[
            'rounded-[5px] px-2.5 py-1',
            current
                ? 'bg-background font-medium shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
        ]}>{label}</a>
{/snippet}

<div class="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
    <nav
        aria-label="Review queues"
        class="flex flex-wrap gap-4">
        {#each translationLocales as locale (locale)}
            <span class="whitespace-nowrap">
                <a
                    class="underline-offset-4 hover:underline"
                    href={reviewQueueHref(locale)}>
                    {localeName[locale]} review queue
                </a>
                <span class="text-muted-foreground">({data.reviewQueues[locale]})</span>
            </span>
        {/each}
    </nav>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
            role="group"
            aria-label="Review translations"
            class="flex items-center gap-2">
            <span class="text-muted-foreground">Review</span>
            <span class="flex rounded-md bg-muted p-0.5">
                {@render segment('Off', undefined, !review)}
                {#each translationLocales as locale (locale)}
                    {@render segment(
                        localeName[locale],
                        {
                            locale,
                            reference:
                                review?.reference === locale ? 'en' : (review?.reference ?? 'en'),
                        },
                        review?.locale === locale,
                    )}
                {/each}
            </span>
        </div>
        {#if review}
            <div
                role="group"
                aria-label="Next to"
                class="flex items-center gap-2">
                <span class="text-muted-foreground">next to</span>
                <span class="flex rounded-md bg-muted p-0.5">
                    {#each cardLocales.filter((locale) => locale !== review.locale) as locale (locale)}
                        {@render segment(
                            localeName[locale],
                            { locale: review.locale, reference: locale },
                            review.reference === locale,
                        )}
                    {/each}
                </span>
            </div>
        {/if}
    </div>
</div>

<form
    bind:this={form}
    method="GET"
    action="/admin/cards"
    role="search"
    aria-label="Find cards"
    class="mt-6 flex flex-col gap-3"
    onsubmit={apply}>
    {#if filter.archived}
        <input
            type="hidden"
            name="tab"
            value="archived" />
    {/if}
    {#if review}
        <input
            type="hidden"
            name="review"
            value={reviewParam(review)} />
    {/if}
    <div class="flex flex-wrap items-center gap-2">
        <Label
            for="q"
            class="sr-only">Search</Label>
        <Input
            id="q"
            name="q"
            type="search"
            placeholder="Search text in any language"
            class="w-80 max-w-full"
            value={filter.search ?? ''} />
        <Button
            type="submit"
            variant="outline">Search</Button>
    </div>
    <div class="flex flex-wrap items-center gap-2">
        {#each shownFilters as option (option.name)}
            <div
                class="flex items-center rounded-md border border-border bg-background shadow-xs dark:border-input dark:bg-input/30"
                data-testid="filter-{option.name}">
                <label
                    for="filter-{option.name}"
                    class="pr-1 pl-2.5 text-sm text-muted-foreground">
                    {option.label}
                </label>
                <NativeSelect.Root
                    id="filter-{option.name}"
                    name={option.name}
                    value={option.value}
                    class="[&_select]:border-0 [&_select]:shadow-none [&_select]:dark:bg-transparent"
                    onchange={submit}
                    {@attach (select) => {
                        if (option.name !== justAdded) return
                        justAdded = undefined
                        select.focus()
                        try {
                            ;(select as HTMLSelectElement).showPicker()
                        } catch {
                            // Not supported, or no user activation: focus is enough.
                        }
                    }}>
                    {#if !option.value}
                        <NativeSelect.Option
                            value=""
                            disabled>Choose…</NativeSelect.Option>
                    {/if}
                    {#each option.choices as choice (choice.value)}
                        <NativeSelect.Option value={choice.value}
                            >{choice.label}</NativeSelect.Option>
                    {/each}
                </NativeSelect.Root>
                {#if option.value}
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        class="rounded-l-none"
                        aria-label="Remove {option.label} filter"
                        href={withoutFilter(option.name)}
                        onclick={() => forget(option.name)}>
                        <XIcon />
                    </Button>
                {:else}
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        class="rounded-l-none"
                        aria-label="Remove {option.label} filter"
                        onclick={() => forget(option.name)}>
                        <XIcon />
                    </Button>
                {/if}
            </div>
        {/each}
        <DropdownMenu.Root>
            <DropdownMenu.Trigger disabled={hiddenFilters.length === 0}>
                {#snippet child({ props })}
                    <Button
                        {...props}
                        variant="ghost"
                        size="sm">
                        <PlusIcon />
                        Add filter
                    </Button>
                {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
                class="w-48"
                onCloseAutoFocus={(event) => {
                    if (justAdded) event.preventDefault()
                }}>
                {#each hiddenFilters as option (option.name)}
                    <DropdownMenu.Item onSelect={() => add(option.name)}>
                        {option.label}
                    </DropdownMenu.Item>
                {/each}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
        <!-- At the far end, as a quiet link, so it doesn't read as a sibling of "Add filter". -->
        {#if filtered || added.length > 0}
            <a
                class="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                href={cardListHref({
                    filter: { archived: filter.archived },
                    sort: data.view.sort,
                    review,
                })}
                onclick={() => (added = [])}>
                Clear filters
            </a>
        {/if}
    </div>
    <input
        type="hidden"
        name="sort"
        value={data.view.sort} />
</form>

<BulkActionBar
    {selected}
    categories={activeCategories}
    report={result?.bulk}
    error={result?.bulkError}
    canDelete={data.role === 'admin'}
    archivedTab={filter.archived}>
    {#snippet actions({ busy, action })}
        {#if review}
            <input
                type="hidden"
                name="locale"
                value={review.locale} />
            <Button
                type="submit"
                variant="outline"
                formaction={action('review')}
                disabled={busy}>
                <CheckIcon />
                Mark {localeName[review.locale]} reviewed
            </Button>
        {/if}
        <Button
            type="submit"
            variant="outline"
            formaction={action('translate')}
            disabled={busy}>
            Machine-translate missing
        </Button>
    {/snippet}
</BulkActionBar>

{#snippet sortableHead(column: SortColumn, label: string)}
    {@const state = sortState(column)}
    <Table.Head aria-sort={state ?? 'none'}>
        <a
            class="-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
            href={sortHref(column)}>
            {label}
            {#if state === 'ascending'}
                <ArrowUpIcon class="size-3.5" />
            {:else if state === 'descending'}
                <ArrowDownIcon class="size-3.5" />
            {:else}
                <ArrowUpDownIcon class="size-3.5 text-muted-foreground" />
            {/if}
        </a>
    </Table.Head>
{/snippet}

<Table.Root class="mt-6">
    <Table.Header>
        <Table.Row>
            <Table.Head class="w-8">
                <input
                    type="checkbox"
                    class="size-4 align-middle accent-primary"
                    aria-label="Select all cards on this page"
                    disabled={data.cards.length === 0}
                    checked={selected.pageSelected}
                    {@attach (input) => {
                        input.indeterminate = selected.pagePartlySelected
                    }}
                    onchange={() => selected.togglePage()} />
            </Table.Head>
            {#if review}
                <Table.Head
                    >{localeName[review.reference]} and {localeName[review.locale]}</Table.Head>
                {@render sortableHead('date', 'Date')}
                <Table.Head>Category</Table.Head>
            {:else}
                <Table.Head>Card</Table.Head>
                {@render sortableHead('date', 'Date')}
                <Table.Head>Category</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head>Translations</Table.Head>
                <Table.Head>Verified</Table.Head>
                {@render sortableHead('updated', 'Updated')}
            {/if}
        </Table.Row>
    </Table.Header>
    <Table.Body>
        {#each data.cards as card (card.id)}
            <Table.Row
                data-state={selected.has(card.id) ? 'selected' : undefined}
                data-added={addedCards.has(card.id) ? '' : undefined}
                class="data-added:bg-amber-50 dark:data-added:bg-amber-950/40">
                <Table.Cell class={review && 'align-top'}>
                    <input
                        type="checkbox"
                        class="size-4 align-middle accent-primary"
                        aria-label="Select {card.text ?? 'card without English text'}"
                        checked={selected.has(card.id)}
                        onchange={() => selected.toggle(card.id)} />
                </Table.Cell>
                {#if review}
                    {@const reference = card.texts[review.reference]}
                    {@const translation = card.texts[review.locale]}
                    {@const state = card.translations[review.locale] ?? 'missing'}
                    <!-- One above the other: either text can be long. -->
                    <Table.Cell class="max-w-2xl align-top whitespace-normal">
                        <div class="flex flex-col gap-1.5">
                            <div
                                class="flex gap-2"
                                data-testid="reference">
                                <abbr
                                    class="w-5 shrink-0 pt-0.5 text-xs text-muted-foreground uppercase no-underline"
                                    title={localeName[review.reference]}>{review.reference}</abbr>
                                <a
                                    class={[
                                        'hover:underline',
                                        reference
                                            ? 'text-muted-foreground'
                                            : 'italic text-muted-foreground',
                                    ]}
                                    href="/admin/cards/{card.id}">
                                    {reference ?? `No ${localeName[review.reference]} text`}
                                </a>
                            </div>
                            <div
                                class="flex gap-2"
                                data-testid="translation">
                                <abbr
                                    class="w-5 shrink-0 pt-0.5 text-xs text-muted-foreground uppercase no-underline"
                                    title={localeName[review.locale]}>{review.locale}</abbr>
                                <div class="flex min-w-0 grow flex-col items-start gap-1.5">
                                    <InlineTranslation
                                        cardId={card.id}
                                        locale={review.locale}
                                        text={translation}
                                        translationState={state}
                                        of={card.text ?? 'card without English text'} />
                                </div>
                            </div>
                        </div>
                    </Table.Cell>
                    <Table.Cell class="align-top">{formatCardDate(card.date)}</Table.Cell>
                    <Table.Cell class="align-top">{card.category.name}</Table.Cell>
                {:else}
                    <Table.Cell class="max-w-md whitespace-normal">
                        <a
                            class="font-medium hover:underline"
                            href="/admin/cards/{card.id}">
                            {card.text ?? 'No English text'}
                        </a>
                        {#if card.countrySpecific}
                            <span
                                class="ml-1.5 inline-block rounded border px-1.5 text-xs whitespace-nowrap text-muted-foreground"
                                data-testid="country-specific"
                                >{countryName(card.countrySpecific)}-specific</span>
                        {/if}
                    </Table.Cell>
                    <Table.Cell>{formatCardDate(card.date)}</Table.Cell>
                    <Table.Cell>{card.category.name}</Table.Cell>
                    <Table.Cell>
                        <span class="inline-flex items-center gap-1.5 text-sm">
                            <span
                                class={[
                                    'size-1.5 rounded-full',
                                    card.status === 'published'
                                        ? 'bg-emerald-500'
                                        : 'bg-muted-foreground/50',
                                ]}
                                aria-hidden="true"></span>
                            <span
                                class={card.status === 'published' ? '' : 'text-muted-foreground'}>
                                {cardStatusLabel[card.status]}
                            </span>
                        </span>
                    </Table.Cell>
                    <Table.Cell>
                        <div class="flex flex-col items-start gap-1">
                            {#each translationLocales as locale (locale)}
                                <span
                                    class="flex items-center gap-1"
                                    data-testid="translation-{locale}">
                                    <abbr
                                        class="w-5 text-xs text-muted-foreground uppercase no-underline"
                                        title={localeName[locale]}>
                                        {locale}
                                    </abbr>
                                    <!-- Only what still needs work gets a badge. -->
                                    {#if card.translations[locale] === 'reviewed'}
                                        <CheckIcon
                                            class="size-3.5 text-muted-foreground"
                                            aria-hidden="true" />
                                        <span class="sr-only">Reviewed</span>
                                    {:else}
                                        <TranslationBadge
                                            state={card.translations[locale] ?? 'missing'} />
                                    {/if}
                                </span>
                            {/each}
                        </div>
                    </Table.Cell>
                    <Table.Cell>
                        {#if card.verified}
                            Verified
                        {:else}
                            <span class="text-muted-foreground">No</span>
                        {/if}
                    </Table.Cell>
                    <Table.Cell class="text-muted-foreground">
                        {updated.format(new Date(card.updatedAt))}
                    </Table.Cell>
                {/if}
            </Table.Row>
        {:else}
            <Table.Row>
                <Table.Cell
                    colspan={review ? 4 : 8}
                    class="py-8 text-center text-muted-foreground">
                    {#if data.total > 0}
                        No cards on this page.
                        <a
                            class="underline"
                            href={cardListHref({ ...data.view, page: 1 })}>
                            Go to the first page
                        </a>
                    {:else if filtered}
                        No cards match these filters.
                    {:else if filter.archived}
                        No archived cards.
                    {:else}
                        No cards yet.
                    {/if}
                </Table.Cell>
            </Table.Row>
        {/each}
    </Table.Body>
</Table.Root>

{#if data.pageCount > 1}
    <nav
        aria-label="Pages"
        class="mt-4 flex items-center justify-end gap-2 text-sm">
        <span class="text-muted-foreground">Page {data.view.page} of {data.pageCount}</span>
        {#if data.view.page > 1}
            <Button
                variant="outline"
                size="sm"
                href={cardListHref({ ...data.view, page: data.view.page - 1 })}>
                Previous
            </Button>
        {/if}
        {#if data.view.page < data.pageCount}
            <Button
                variant="outline"
                size="sm"
                href={cardListHref({ ...data.view, page: data.view.page + 1 })}>
                Next
            </Button>
        {/if}
    </nav>
{/if}
