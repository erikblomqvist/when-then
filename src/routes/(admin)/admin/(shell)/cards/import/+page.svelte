<script lang="ts">
    import { Badge } from '#lib/components/ui/badge/index.js'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Input } from '#lib/components/ui/input/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as Table from '#lib/components/ui/table/index.js'
    import { cardImportColumns } from '#lib/cards/card-csv.js'
    import { importColumnLabel, importRowLimit, type ImportRow } from '#lib/cards/card-import.js'
    import { formatCardDate } from '#lib/cards/date-parts.js'
    import type { PageProps } from './$types'

    let { form }: PageProps = $props()

    const cards = (count: number) => `${count} ${count === 1 ? 'card' : 'cards'}`
    const rowsWord = (count: number) => `${count} ${count === 1 ? 'row' : 'rows'}`

    const resultMessage = (created: number, skipped: number, leftOut: number) =>
        `Imported ${cards(created)} as drafts.` +
        (skipped > 0 ? ` Skipped ${rowsWord(skipped)} with errors.` : '') +
        (leftOut > 0 ? ` Left out ${rowsWord(leftOut)} that looked like duplicates.` : '')

    const preview = $derived(form?.stage === 'preview' ? form : null)
    const imported = $derived(form?.stage === 'imported' ? form : null)
    const ready = $derived(preview?.rows.filter((row) => row.card).length ?? 0)
    const withErrors = $derived((preview?.rows.length ?? 0) - ready)
    // Suspected duplicates: left out unless the admin unticks "Leave out".
    const suspected = $derived(Object.keys(preview?.duplicates ?? {}).length)
    // Ticked again for each new preview.
    let skipDuplicates = $derived(preview !== null)
    const importing = $derived(ready - (skipDuplicates ? suspected : 0))
</script>

<svelte:head>
    <title>Import cards · When Then? admin</title>
</svelte:head>

{#snippet errorList(row: ImportRow)}
    <ul class="flex flex-col gap-1 text-destructive">
        {#each row.errors as error, index (index)}
            <li>{importColumnLabel[error.column]}: {error.message}</li>
        {/each}
    </ul>
{/snippet}

<div class="flex flex-wrap items-end justify-between gap-4">
    <h1 class="text-2xl font-semibold tracking-tight">Import cards</h1>
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

{#if imported}
    <p
        role="status"
        class="mt-4 rounded-md border bg-muted px-3 py-2 text-sm">
        {resultMessage(imported.created.length, imported.skipped.length, imported.leftOut.length)}
    </p>

    {#if imported.created.length > 0}
        <section
            aria-labelledby="created-heading"
            class="mt-6">
            <h2
                id="created-heading"
                class="text-lg font-semibold">
                New drafts
            </h2>
            <ul class="mt-2 flex flex-col gap-1 text-sm">
                {#each imported.created as card (card.id)}
                    <li>
                        <a
                            href="/admin/cards/{card.id}"
                            class="underline underline-offset-4">{card.text}</a>
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if imported.skipped.length > 0}
        <section
            aria-labelledby="skipped-heading"
            class="mt-6">
            <h2
                id="skipped-heading"
                class="text-lg font-semibold">
                Skipped rows
            </h2>
            <ul class="mt-2 flex flex-col gap-3 text-sm">
                {#each imported.skipped as row (row.row)}
                    <li>
                        <p class="font-medium">Row {row.row}: {row.text || 'No English text'}</p>
                        {@render errorList(row)}
                    </li>
                {/each}
            </ul>
        </section>
    {/if}

    {#if imported.leftOut.length > 0}
        <section
            aria-labelledby="left-out-heading"
            class="mt-6">
            <h2
                id="left-out-heading"
                class="text-lg font-semibold">
                Left out as suspected duplicates
            </h2>
            <ul class="mt-2 flex flex-col gap-1 text-sm">
                {#each imported.leftOut as row (row.row)}
                    <li>Row {row.row}: {row.text}</li>
                {/each}
            </ul>
        </section>
    {/if}

    <p class="mt-6">
        <Button
            href="/admin/cards/import"
            variant="outline">Import another file</Button>
    </p>
{:else if preview}
    <p
        class="mt-4 text-sm"
        data-testid="import-summary">
        {preview.fileName}: {rowsWord(preview.rows.length)}, {ready} ready to import{suspected > 0
            ? ` (${suspected} of them suspected duplicates)`
            : ''}{withErrors > 0 ? `, ${withErrors} with errors (skipped)` : ''}. Nothing is saved
        until you import.
    </p>

    <form
        method="POST"
        action="?/import"
        aria-label="Confirm import"
        class="mt-4 flex flex-wrap items-center gap-4">
        <input
            type="hidden"
            name="csv"
            value={preview.csv} />
        <input
            type="hidden"
            name="file_name"
            value={preview.fileName} />
        {#if suspected > 0}
            <label class="flex items-center gap-2 text-sm">
                <input
                    type="checkbox"
                    name="skip_duplicates"
                    class="size-4 accent-primary"
                    bind:checked={skipDuplicates} />
                Leave out {rowsWord(suspected)} that look like duplicates
            </label>
        {/if}
        <Button
            type="submit"
            disabled={importing === 0}>Import {cards(importing)} as drafts</Button>
        <a
            href="/admin/cards/import"
            class="text-sm underline underline-offset-4">Choose another file</a>
    </form>

    <Table.Root class="mt-6">
        <Table.Caption class="sr-only">Rows in {preview.fileName}</Table.Caption>
        <Table.Header>
            <Table.Row>
                <Table.Head>Row</Table.Head>
                <Table.Head>English text</Table.Head>
                <Table.Head>Category</Table.Head>
                <Table.Head>Date</Table.Head>
                <Table.Head>Result</Table.Head>
            </Table.Row>
        </Table.Header>
        <Table.Body>
            {#each preview.rows as row (row.row)}
                <Table.Row data-testid="import-row-{row.row}">
                    <Table.Cell>{row.row}</Table.Cell>
                    <Table.Cell class="max-w-md whitespace-normal">{row.text}</Table.Cell>
                    <Table.Cell>{row.category}</Table.Cell>
                    <Table.Cell>{row.card ? formatCardDate(row.card.date) : ''}</Table.Cell>
                    <Table.Cell class="whitespace-normal">
                        {@const duplicate = preview.duplicates[row.row]}
                        {#if row.card && duplicate}
                            <div class="flex flex-col items-start gap-1">
                                <Badge variant="destructive">Suspected duplicate</Badge>
                                {#each duplicate.cards as card (card.id)}
                                    <span>
                                        Same text as
                                        <a
                                            href="/admin/cards/{card.id}"
                                            target="_blank"
                                            class="underline underline-offset-4">{card.text}</a>
                                    </span>
                                {/each}
                                {#if duplicate.earlierRow !== null}
                                    <span>Same text as row {duplicate.earlierRow}</span>
                                {/if}
                            </div>
                        {:else if row.card}
                            <Badge variant="secondary">Ready</Badge>
                        {:else}
                            {@render errorList(row)}
                        {/if}
                    </Table.Cell>
                </Table.Row>
            {/each}
        </Table.Body>
    </Table.Root>
{:else}
    <p class="mt-2 max-w-prose text-muted-foreground">
        Upload a CSV file to create draft cards. You see every row and its errors before anything is
        saved; rows with errors are skipped. Import only creates new cards, it never changes
        existing ones.
    </p>
    <p class="mt-2 max-w-prose text-sm text-muted-foreground">
        Columns: {cardImportColumns.join(', ')}. Only text_en and category are required. Dates are
        signed numbers (BC negative, a decade by its earliest year, so the 490s BC is -499);
        category is the English category name; tags are separated by semicolons. Swedish and
        Norwegian text is stored as reviewed. Up to {importRowLimit} rows per file. A card list export
        has the same columns.
    </p>

    <form
        method="POST"
        action="?/preview"
        enctype="multipart/form-data"
        aria-label="Upload cards"
        class="mt-6 flex flex-wrap items-end gap-4">
        <div class="flex flex-col gap-1.5">
            <Label for="file">CSV file</Label>
            <Input
                id="file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required />
        </div>
        <Button type="submit">Preview</Button>
    </form>
{/if}
