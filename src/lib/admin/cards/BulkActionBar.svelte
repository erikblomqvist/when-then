<!--
    The card list's bulk actions on the selected rows (`CardListSelection`): shown while
    something is selected, with "select all matching", Publish and Archive (not on the
    Archived tab, `archivedTab`, where neither applies), Move to category and, for admins
    (`canDelete`), Delete, which asks first.
    It is one form that posts the selection as hidden fields (`selectionFields`); each button
    posts to its own action with `formaction`. More bulk actions go in the `actions` snippet:
    buttons with `formaction` pointing at a form action that reads the selection with
    `readCardSelection` / `selectedCardIds` (#lib/server/card-bulk-actions.js).

    Export selected is a second, plain form (a file download must not go through `enhance`):
    it posts the selected ids, or the filter for "all matching", to the export endpoint (#47)
    with `data-sveltekit-reload`, and keeps the selection.

    After an action the selection clears and `report` (the action's `bulk` result) is shown.
-->
<script lang="ts">
    import type { Snippet } from 'svelte'
    import { enhance } from '$app/forms'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { selectionFields } from '#lib/cards/card-selection.js'
    import {
        exportFormatLabel,
        exportFormats,
        exportParams,
        exportPath,
    } from '#lib/cards/card-export.js'
    import type { BulkReport } from '#lib/server/card-bulk-actions.js'
    import type { CardListSelection } from './card-list-selection.svelte.js'

    type Props = {
        selected: CardListSelection
        /** Categories cards can move to (not archived). */
        categories: { id: string; name: string }[]
        /** The last bulk action's result, to show. */
        report?: BulkReport
        /** A refusal of the last bulk action, to show. */
        error?: string
        /** Offer Delete (admins): it deletes the selected cards, whatever their status. */
        canDelete?: boolean
        /** The list is on the Archived tab: no Publish or Archive. */
        archivedTab?: boolean
        /** More bulk actions: buttons inside the form, with their own `formaction`. */
        actions?: Snippet<[{ busy: boolean }]>
    }

    let {
        selected,
        categories,
        report,
        error,
        canDelete = false,
        archivedTab = false,
        actions,
    }: Props = $props()

    let busy = $state(false)
    const fields = $derived(selected.selection ? selectionFields(selected.selection) : [])
    // The export endpoint's own fields (`id` per card, or the filter keys); format comes from
    // the form's select.
    const exportFields = $derived.by(() => {
        const selection = selected.selection
        if (!selection) return []
        const params = exportParams({
            format: 'csv',
            selection: selection.kind === 'cards' ? { ids: selection.ids } : selection,
        })
        params.delete('format')
        return [...params]
    })
    const plural = (n: number) => (n === 1 ? '1 card' : `${n} cards`)

    // Delete can't be undone: the button asks before its form posts.
    const confirmDelete = (event: MouseEvent) => {
        const which = selected.allMatching
            ? `all ${selected.count} matching cards`
            : plural(selected.count)
        if (!confirm(`Delete ${which} for good? This cannot be undone.`)) {
            event.preventDefault()
        }
    }

    const submit = () => {
        busy = true
        return async ({ update }: { update: () => Promise<void> }) => {
            await update()
            busy = false
            selected.clear()
        }
    }
</script>

{#if report}
    <div
        role="status"
        class="mt-6 rounded-md border bg-muted/40 p-4 text-sm">
        <p class="font-medium">{report.message}</p>
        {#if report.skipped.length > 0}
            <p class="mt-2">Skipped {plural(report.skipped.length)}:</p>
            <ul class="mt-1 list-disc pl-5">
                {#each report.skipped as card (card.id)}
                    <li>
                        <a
                            class="underline"
                            href="/admin/cards/{card.id}">{card.text ?? 'No English text'}</a
                        >: {card.reason}
                    </li>
                {/each}
            </ul>
        {/if}
    </div>
{/if}
{#if error}
    <p
        role="alert"
        class="mt-6 text-sm text-destructive">
        {error}
    </p>
{/if}

{#if selected.count > 0}
    <section
        aria-label="Bulk actions"
        class="mt-6 rounded-md border p-3">
        <div class="flex flex-wrap items-end gap-3">
            <form
                method="POST"
                class="flex flex-wrap items-end gap-3"
                use:enhance={submit}>
                {#each fields as [name, value], index (index)}
                    <input
                        type="hidden"
                        {name}
                        {value} />
                {/each}
                <div class="flex flex-col gap-1 text-sm">
                    <span class="font-medium">
                        {selected.allMatching
                            ? `All ${selected.count} matching cards selected`
                            : `${selected.count} selected`}
                    </span>
                    <span class="flex gap-2">
                        {#if selected.canSelectAllMatching}
                            <button
                                type="button"
                                class="underline"
                                onclick={() => selected.selectAllMatching()}>
                                Select all {selected.totalMatching} matching cards
                            </button>
                        {/if}
                        <button
                            type="button"
                            class="text-muted-foreground underline"
                            onclick={() => selected.clear()}>
                            Clear selection
                        </button>
                    </span>
                </div>
                {#if !archivedTab}
                    <Button
                        type="submit"
                        formaction="?/publish"
                        disabled={busy}>
                        Publish
                    </Button>
                    <Button
                        type="submit"
                        variant="outline"
                        formaction="?/archive"
                        disabled={busy}>
                        Archive
                    </Button>
                {/if}
                <div class="flex items-end gap-2">
                    <div class="flex flex-col gap-2">
                        <Label for="move-to">Move to</Label>
                        <NativeSelect.Root
                            id="move-to"
                            name="move_to">
                            {#each categories as category (category.id)}
                                <NativeSelect.Option value={category.id}>
                                    {category.name}
                                </NativeSelect.Option>
                            {/each}
                        </NativeSelect.Root>
                    </div>
                    <Button
                        type="submit"
                        variant="outline"
                        formaction="?/move"
                        disabled={busy}>
                        Move
                    </Button>
                </div>
                {@render actions?.({ busy })}
                {#if canDelete}
                    <Button
                        type="submit"
                        variant="destructive"
                        formaction="?/delete"
                        disabled={busy}
                        onclick={confirmDelete}>
                        Delete
                    </Button>
                {/if}
            </form>
            <form
                method="POST"
                action={exportPath}
                data-sveltekit-reload
                class="flex items-end gap-2">
                {#each exportFields as [name, value], index (index)}
                    <input
                        type="hidden"
                        {name}
                        {value} />
                {/each}
                <div class="flex flex-col gap-2">
                    <Label for="export-selected-format">Export as</Label>
                    <NativeSelect.Root
                        id="export-selected-format"
                        name="format">
                        {#each exportFormats as format (format)}
                            <NativeSelect.Option value={format}>
                                {exportFormatLabel[format]}
                            </NativeSelect.Option>
                        {/each}
                    </NativeSelect.Root>
                </div>
                <Button
                    type="submit"
                    variant="outline">
                    Export selected
                </Button>
            </form>
        </div>
    </section>
{/if}
