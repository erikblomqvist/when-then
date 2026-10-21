<script lang="ts">
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Table from '#lib/components/ui/table/index.js'
    import { cardStatusLabel } from '#lib/cards/card.js'
    import { formatCardDate } from '#lib/cards/date-parts.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()

    const updated = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<svelte:head>
    <title>Cards · When Then? admin</title>
</svelte:head>

<div class="flex items-center justify-between gap-4">
    <div>
        <h1 class="text-2xl font-semibold tracking-tight">Cards</h1>
        <p class="text-sm text-muted-foreground">
            {data.total}
            {data.total === 1 ? 'card' : 'cards'}
        </p>
    </div>
    <Button href="/admin/cards/new">New card</Button>
</div>

<Table.Root class="mt-6">
    <Table.Header>
        <Table.Row>
            <Table.Head>Card</Table.Head>
            <Table.Head>Date</Table.Head>
            <Table.Head>Category</Table.Head>
            <Table.Head>Status</Table.Head>
            <Table.Head>Updated</Table.Head>
        </Table.Row>
    </Table.Header>
    <Table.Body>
        {#each data.cards as card (card.id)}
            <Table.Row>
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
                <Table.Cell class="text-muted-foreground">
                    {updated.format(new Date(card.updatedAt))}
                </Table.Cell>
            </Table.Row>
        {:else}
            <Table.Row>
                <Table.Cell
                    colspan={5}
                    class="py-8 text-center text-muted-foreground">
                    No cards yet.
                </Table.Cell>
            </Table.Row>
        {/each}
    </Table.Body>
</Table.Root>

{#if data.pageCount > 1}
    <nav
        aria-label="Pages"
        class="mt-4 flex items-center justify-end gap-2 text-sm">
        <span class="text-muted-foreground">Page {data.page} of {data.pageCount}</span>
        {#if data.page > 1}
            <Button
                variant="outline"
                size="sm"
                href="?page={data.page - 1}">
                Previous
            </Button>
        {/if}
        {#if data.page < data.pageCount}
            <Button
                variant="outline"
                size="sm"
                href="?page={data.page + 1}">
                Next
            </Button>
        {/if}
    </nav>
{/if}
