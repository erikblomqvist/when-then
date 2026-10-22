<!--
    @component
    Downloads cards from the card list: every card, or the cards matching the current filter,
    as CSV or JSON. A plain GET form to the export endpoint (`data-sveltekit-reload`, or the
    client router would look for a page there), so it works without JavaScript;
    the browser saves the response as a file and stays on the list.
-->
<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { filterParams, isFiltered, type CardFilter } from '#lib/cards/card-list.js'
    import { exportFormatLabel, exportFormats, exportPath } from '#lib/cards/card-export.js'

    type Props = {
        /** The list's current filter. */
        filter: CardFilter
        /** How many cards match it. */
        total: number
    }

    let { filter, total }: Props = $props()

    const filtered = $derived(isFiltered(filter))
    const fields = $derived([...filterParams(filter)])
</script>

<form
    method="GET"
    action={exportPath}
    aria-label="Export cards"
    data-sveltekit-reload
    class="flex flex-wrap items-end gap-2">
    {#each fields as [name, value] (name)}
        <input
            type="hidden"
            {name}
            {value} />
    {/each}
    {#if filtered}
        <div class="flex flex-col gap-2">
            <Label for="export-scope">Export</Label>
            <NativeSelect.Root
                id="export-scope"
                name="scope">
                <NativeSelect.Option value="">
                    The {total} matching {total === 1 ? 'card' : 'cards'}
                </NativeSelect.Option>
                <NativeSelect.Option value="all">All cards</NativeSelect.Option>
            </NativeSelect.Root>
        </div>
    {/if}
    <div class="flex flex-col gap-2">
        <Label for="export-format">{filtered ? 'Format' : 'Export all cards as'}</Label>
        <NativeSelect.Root
            id="export-format"
            name="format">
            {#each exportFormats as format (format)}
                <NativeSelect.Option value={format}
                    >{exportFormatLabel[format]}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <Button
        type="submit"
        variant="outline">
        Export
    </Button>
</form>
