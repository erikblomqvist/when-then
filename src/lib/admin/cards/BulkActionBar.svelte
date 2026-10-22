<!--
    The card list's bulk actions on the selected rows (`CardListSelection`): shown while
    something is selected, with "select all matching", Publish, Archive and Move to category.
    It is one form that posts the selection as hidden fields (`selectionFields`); each button
    posts to its own action with `formaction`. More bulk actions go in the `actions` snippet:
    buttons with `formaction` pointing at an action or endpoint that reads the selection with
    `readCardSelection` / `selectedCardIds` (#lib/server/card-bulk-actions.js).

    After an action the selection clears and `report` (the action's `bulk` result) is shown.
-->
<script lang="ts">
    import type { Snippet } from 'svelte'
    import { enhance } from '$app/forms'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { selectionFields } from '#lib/cards/card-selection.js'
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
        /** More bulk actions: buttons inside the form, with their own `formaction`. */
        actions?: Snippet<[{ busy: boolean }]>
    }

    let { selected, categories, report, error, actions }: Props = $props()

    let busy = $state(false)
    const fields = $derived(selected.selection ? selectionFields(selected.selection) : [])
    const plural = (n: number) => (n === 1 ? '1 card' : `${n} cards`)

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
        </form>
    </section>
{/if}
