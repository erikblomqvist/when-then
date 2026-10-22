<script lang="ts">
    import { goto } from '$app/navigation'
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import * as Table from '#lib/components/ui/table/index.js'
    import { cardStatusLabel, type CardStatus } from '#lib/cards/card.js'
    import {
        cardEraLabel,
        cardListHref,
        cardSortLabel,
        cardSorts,
        isFiltered,
        parseCardListView,
        type CardEra,
    } from '#lib/cards/card-list.js'
    import { formatCardDate } from '#lib/cards/date-parts.js'
    import { filterParams } from '#lib/cards/card-list.js'
    import BulkActionBar from '#lib/admin/cards/BulkActionBar.svelte'
    import { CardListSelection } from '#lib/admin/cards/card-list-selection.svelte.js'
    import { untrack } from 'svelte'
    import type { PageProps } from './$types'

    let { data, form: result }: PageProps = $props()

    const updated = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    const statuses = Object.keys(cardStatusLabel) as CardStatus[]
    const eras = Object.keys(cardEraLabel) as CardEra[]
    const yesNo = (value: boolean | undefined) => (value === undefined ? '' : value ? 'yes' : 'no')

    let form: HTMLFormElement | undefined = $state()

    const filter = $derived(data.view.filter)
    const filtered = $derived(isFiltered(filter))

    // Without JavaScript the GET form navigates as is; with it, go to the canonical URL (no
    // empty fields), keeping focus in the search box.
    function apply(event: SubmitEvent) {
        event.preventDefault()
        const fields = new URLSearchParams()
        for (const [name, value] of new FormData(event.currentTarget as HTMLFormElement)) {
            if (typeof value === 'string') fields.set(name, value)
        }
        const { filter, sort } = parseCardListView(fields)
        void goto(cardListHref({ filter, sort }), { reset: false })
    }

    const submit = () => form?.requestSubmit()

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

<div class="flex items-center justify-between gap-4">
    <div>
        <h1 class="text-2xl font-semibold tracking-tight">Cards</h1>
        <p
            class="text-sm text-muted-foreground"
            data-testid="card-count">
            {data.total}
            {data.total === 1 ? 'card' : 'cards'}{filtered ? ' match' : ''}
        </p>
    </div>
    <Button href="/admin/cards/new">New card</Button>
</div>

<form
    bind:this={form}
    method="GET"
    action="/admin/cards"
    role="search"
    aria-label="Find cards"
    class="mt-6 flex flex-wrap items-end gap-3"
    onsubmit={apply}>
    <div class="flex min-w-64 flex-1 flex-col gap-2">
        <Label for="q">Search</Label>
        <Input
            id="q"
            name="q"
            type="search"
            placeholder="Text in any language"
            value={filter.search ?? ''} />
    </div>
    <div class="flex flex-col gap-2">
        <Label for="status">Status</Label>
        <NativeSelect.Root
            id="status"
            name="status"
            value={filter.status ?? ''}
            onchange={submit}>
            <NativeSelect.Option value="">Any</NativeSelect.Option>
            {#each statuses as status (status)}
                <NativeSelect.Option value={status}>{cardStatusLabel[status]}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="category">Category</Label>
        <NativeSelect.Root
            id="category"
            name="category"
            value={filter.categoryId ?? ''}
            onchange={submit}>
            <NativeSelect.Option value="">Any</NativeSelect.Option>
            {#each data.categories as category (category.id)}
                <NativeSelect.Option value={category.id}>
                    {category.name}{category.archived ? ' (archived)' : ''}
                </NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="verified">Verified</Label>
        <NativeSelect.Root
            id="verified"
            name="verified"
            value={yesNo(filter.verified)}
            onchange={submit}>
            <NativeSelect.Option value="">Any</NativeSelect.Option>
            <NativeSelect.Option value="yes">Verified</NativeSelect.Option>
            <NativeSelect.Option value="no">Not verified</NativeSelect.Option>
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="source">Source</Label>
        <NativeSelect.Root
            id="source"
            name="source"
            value={yesNo(filter.hasSource)}
            onchange={submit}>
            <NativeSelect.Option value="">Any</NativeSelect.Option>
            <NativeSelect.Option value="yes">Has a source</NativeSelect.Option>
            <NativeSelect.Option value="no">No source</NativeSelect.Option>
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="era">Date</Label>
        <NativeSelect.Root
            id="era"
            name="era"
            value={filter.era ?? ''}
            onchange={submit}>
            <NativeSelect.Option value="">Any</NativeSelect.Option>
            {#each eras as era (era)}
                <NativeSelect.Option value={era}>{cardEraLabel[era]}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="sort">Sort by</Label>
        <NativeSelect.Root
            id="sort"
            name="sort"
            value={data.view.sort}
            onchange={submit}>
            {#each cardSorts as sort (sort)}
                <NativeSelect.Option value={sort}>{cardSortLabel[sort]}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <Button type="submit">Search</Button>
    {#if filtered}
        <Button
            variant="ghost"
            href={cardListHref({ sort: data.view.sort })}>
            Clear filters
        </Button>
    {/if}
</form>

<BulkActionBar
    {selected}
    categories={activeCategories}
    report={result?.bulk}
    error={result?.bulkError} />

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
            <Table.Head>Card</Table.Head>
            <Table.Head>Date</Table.Head>
            <Table.Head>Category</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Verified</Table.Head>
            <Table.Head>Updated</Table.Head>
        </Table.Row>
    </Table.Header>
    <Table.Body>
        {#each data.cards as card (card.id)}
            <Table.Row data-state={selected.has(card.id) ? 'selected' : undefined}>
                <Table.Cell>
                    <input
                        type="checkbox"
                        class="size-4 align-middle accent-primary"
                        aria-label="Select {card.text ?? 'card without English text'}"
                        checked={selected.has(card.id)}
                        onchange={() => selected.toggle(card.id)} />
                </Table.Cell>
                <Table.Cell class="max-w-md whitespace-normal">
                    <a
                        class="font-medium hover:underline"
                        href="/admin/cards/{card.id}">
                        {card.text ?? 'No English text'}
                    </a>
                </Table.Cell>
                <Table.Cell>{formatCardDate(card.date)}</Table.Cell>
                <Table.Cell>{card.category.name}</Table.Cell>
                <Table.Cell>
                    <Badge variant={card.status === 'published' ? 'default' : 'secondary'}>
                        {cardStatusLabel[card.status]}
                    </Badge>
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
            </Table.Row>
        {:else}
            <Table.Row>
                <Table.Cell
                    colspan={7}
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
