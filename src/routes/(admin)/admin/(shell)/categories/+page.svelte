<script lang="ts">
    import { tick } from 'svelte'
    import { enhance } from '$app/forms'
    import { ArrowDown, ArrowUp, GripVertical } from '@lucide/svelte'
    import CategoryBadge from '#lib/admin/categories/CategoryBadge.svelte'
    import { moveItem } from '#lib/categories/category-form.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import * as Table from '#lib/components/ui/table/index.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    // The order shown: the saved one, or the one just dropped while it saves.
    let order = $derived(data.categories.map((category) => category.id))
    const byId = $derived(new Map(data.categories.map((category) => [category.id, category])))
    const rows = $derived(order.flatMap((id) => byId.get(id) ?? []))

    // The category draw numbers the active categories 1..n in this order.
    const drawNumbers = $derived(
        new Map(
            rows
                .filter((category) => !category.archived)
                .map((category, index) => [category.id, index + 1]),
        ),
    )

    let reorderForm: HTMLFormElement | undefined = $state()
    let dragged: number | null = $state(null)
    let over: number | null = $state(null)

    async function move(from: number, to: number) {
        const moved = moveItem(order, from, to)
        if (moved.every((id, index) => id === order[index])) return
        order = moved
        await tick()
        reorderForm?.requestSubmit()
    }

    function drop(event: DragEvent, index: number) {
        event.preventDefault()
        if (dragged !== null) void move(dragged, index)
        dragged = null
        over = null
    }
</script>

<svelte:head>
    <title>Categories · When Then? admin</title>
</svelte:head>

<div class="flex items-start justify-between gap-4">
    <div>
        <h1 class="text-2xl font-semibold tracking-tight">Categories</h1>
        <p class="mt-2 max-w-prose text-muted-foreground">
            Every card has one category. The category draw numbers the active categories in this
            order: drag a row to change it. Archived categories leave the draw, and their cards stay
            with them. Only a category without cards can be deleted.
        </p>
    </div>
    <Button href="/admin/categories/new">New category</Button>
</div>

{#if form && 'message' in form}
    <p
        role="status"
        class="mt-4 rounded-md border bg-muted px-3 py-2 text-sm">
        {form.message}
    </p>
{:else if form && 'error' in form && form.error}
    <p
        role="alert"
        class="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
        {form.error}
    </p>
{/if}

<form
    bind:this={reorderForm}
    method="POST"
    action="?/reorder"
    use:enhance
    hidden>
    {#each order as id (id)}
        <input
            type="hidden"
            name="id"
            value={id} />
    {/each}
</form>

<section
    aria-label="Categories"
    class="mt-6">
    <Table.Root>
        <Table.Header>
            <Table.Row>
                <Table.Head><span class="sr-only">Order</span></Table.Head>
                <Table.Head>Draw</Table.Head>
                <Table.Head>English name</Table.Head>
                <Table.Head>Swedish</Table.Head>
                <Table.Head>Norwegian</Table.Head>
                <Table.Head class="text-right">Cards</Table.Head>
                <Table.Head>Status</Table.Head>
                <Table.Head><span class="sr-only">Actions</span></Table.Head>
            </Table.Row>
        </Table.Header>
        <Table.Body>
            {#each rows as category, index (category.id)}
                <Table.Row
                    draggable="true"
                    ondragstart={(event: DragEvent) => {
                        dragged = index
                        event.dataTransfer?.setData('text/plain', category.id)
                        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
                    }}
                    ondragover={(event: DragEvent) => {
                        event.preventDefault()
                        over = index
                    }}
                    ondragleave={() => {
                        if (over === index) over = null
                    }}
                    ondrop={(event: DragEvent) => drop(event, index)}
                    ondragend={() => {
                        dragged = null
                        over = null
                    }}
                    class={[
                        category.archived && 'text-muted-foreground',
                        dragged === index && 'opacity-50',
                        over === index && dragged !== index && 'bg-muted',
                    ]}>
                    <Table.Cell class="w-0">
                        <div class="flex items-center">
                            <button
                                type="button"
                                aria-label="Drag {category.name}"
                                title="Drag to reorder"
                                class="cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing">
                                <GripVertical class="size-4" />
                            </button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Move {category.name} up"
                                disabled={index === 0}
                                onclick={() => move(index, index - 1)}>
                                <ArrowUp />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label="Move {category.name} down"
                                disabled={index === rows.length - 1}
                                onclick={() => move(index, index + 1)}>
                                <ArrowDown />
                            </Button>
                        </div>
                    </Table.Cell>
                    <Table.Cell
                        data-testid="draw-number"
                        class="tabular-nums">{drawNumbers.get(category.id) ?? '–'}</Table.Cell>
                    <Table.Cell>
                        <a
                            href="/admin/categories/{category.id}"
                            class="flex items-center gap-2 font-medium hover:underline">
                            <CategoryBadge
                                name={category.name}
                                icon={category.icon}
                                colour={category.colour} />
                            {category.name}
                        </a>
                    </Table.Cell>
                    <Table.Cell>{category.names.sv ?? ''}</Table.Cell>
                    <Table.Cell>{category.names.nb ?? ''}</Table.Cell>
                    <Table.Cell
                        data-testid="card-count"
                        class="text-right tabular-nums">{category.cardCount}</Table.Cell>
                    <Table.Cell>{category.archived ? 'Archived' : 'Active'}</Table.Cell>
                    <Table.Cell>
                        <div class="flex justify-end gap-2">
                            <form
                                method="POST"
                                action={category.archived ? '?/unarchive' : '?/archive'}
                                use:enhance>
                                <input
                                    type="hidden"
                                    name="id"
                                    value={category.id} />
                                <input
                                    type="hidden"
                                    name="name"
                                    value={category.name} />
                                <Button
                                    type="submit"
                                    variant="outline"
                                    size="sm">
                                    {category.archived ? 'Unarchive' : 'Archive'}
                                </Button>
                            </form>
                            <form
                                method="POST"
                                action="?/delete"
                                use:enhance={({ cancel }) => {
                                    if (
                                        !confirm(`Delete ${category.name}? This cannot be undone.`)
                                    ) {
                                        cancel()
                                    }
                                }}>
                                <input
                                    type="hidden"
                                    name="id"
                                    value={category.id} />
                                <input
                                    type="hidden"
                                    name="name"
                                    value={category.name} />
                                <Button
                                    type="submit"
                                    variant="ghost"
                                    size="sm"
                                    disabled={category.cardCount > 0}
                                    title={category.cardCount > 0
                                        ? 'It has cards: archive it instead.'
                                        : undefined}>
                                    Delete
                                </Button>
                            </form>
                        </div>
                    </Table.Cell>
                </Table.Row>
            {/each}
        </Table.Body>
    </Table.Root>
</section>
