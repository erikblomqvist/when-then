<script lang="ts">
    import AuditEntry from '#lib/admin/audit/AuditEntry.svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import { Label } from '#lib/components/ui/label/index.js'
    import * as NativeSelect from '#lib/components/ui/native-select/index.js'
    import { actionLabel, entityLabel } from '#lib/audit/display.js'
    import { auditLogHref } from '#lib/audit/query.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()

    const people = $derived(
        Object.entries(data.names.people).sort(([, a], [, b]) => a.localeCompare(b)),
    )
    const filtered = $derived(Object.keys(data.filters).length > 0)
</script>

<svelte:head>
    <title>Audit log · When Then? admin</title>
</svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">Audit log</h1>
<p class="text-sm text-muted-foreground">
    Every change to cards, categories and people, newest first. Read-only.
</p>

<form
    method="GET"
    class="mt-6 flex flex-wrap items-end gap-4"
    data-sveltekit-keepfocus>
    <div class="flex flex-col gap-2">
        <Label for="actor">Person</Label>
        <NativeSelect.Root
            id="actor"
            name="actor"
            value={data.filters.actor ?? ''}>
            <NativeSelect.Option value="">Anyone</NativeSelect.Option>
            {#each people as [id, email] (id)}
                <NativeSelect.Option value={id}>{email}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="entity">Entity</Label>
        <NativeSelect.Root
            id="entity"
            name="entity"
            value={data.filters.entity ?? ''}>
            <NativeSelect.Option value="">Anything</NativeSelect.Option>
            {#each data.kinds.entities as entity (entity)}
                <NativeSelect.Option value={entity}>{entityLabel(entity)}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <div class="flex flex-col gap-2">
        <Label for="action">Action</Label>
        <NativeSelect.Root
            id="action"
            name="action"
            value={data.filters.action ?? ''}>
            <NativeSelect.Option value="">Any action</NativeSelect.Option>
            {#each data.kinds.actions as action (action)}
                <NativeSelect.Option value={action}>{actionLabel(action)}</NativeSelect.Option>
            {/each}
        </NativeSelect.Root>
    </div>
    <Button type="submit">Filter</Button>
    {#if filtered}
        <Button
            href="/admin/audit"
            variant="ghost">
            Clear filters
        </Button>
    {/if}
</form>

{#if data.entries.length === 0}
    <p class="mt-8 text-sm text-muted-foreground">
        {filtered ? 'No entries match these filters.' : 'Nothing has been logged yet.'}
    </p>
{:else}
    <ol class="mt-6 flex max-w-4xl flex-col gap-3">
        {#each data.entries as entry (entry.id)}
            <li>
                <AuditEntry
                    {entry}
                    names={data.names}
                    level={2}
                    showSubject />
            </li>
        {/each}
    </ol>
{/if}

{#if data.newer !== null || data.older !== null}
    <nav
        aria-label="Pages"
        class="mt-4 flex max-w-4xl items-center justify-end gap-2 text-sm">
        {#if data.newer !== null}
            <Button
                variant="outline"
                size="sm"
                href={auditLogHref(data.filters, { after: data.newer })}>
                Newer
            </Button>
        {/if}
        {#if data.older !== null}
            <Button
                variant="outline"
                size="sm"
                href={auditLogHref(data.filters, { before: data.older })}>
                Older
            </Button>
        {/if}
    </nav>
{/if}
