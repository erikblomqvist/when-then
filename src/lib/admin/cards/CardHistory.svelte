<!--
    A card's history panel: every change to the card and its translations, newest first, with
    who made it and a field-by-field diff. Read-only. The card page mounts it below the editor
    and passes `cardHistory()` and `auditNames()` from its load.
-->
<script lang="ts">
    import AuditEntry from '#lib/admin/audit/AuditEntry.svelte'
    import type { AuditNames } from '#lib/audit/display.js'
    import type { AuditEntry as Entry } from '#lib/server/audit.js'

    let { entries, names }: { entries: Entry[]; names: AuditNames } = $props()
</script>

<section
    aria-labelledby="history-heading"
    class="flex max-w-3xl flex-col gap-3">
    <h2
        id="history-heading"
        class="text-lg font-semibold tracking-tight">
        History
    </h2>
    {#if entries.length === 0}
        <p class="text-sm text-muted-foreground">No changes yet.</p>
    {:else}
        <ol class="flex flex-col gap-3">
            {#each entries as entry (entry.id)}
                <li>
                    <AuditEntry
                        {entry}
                        {names} />
                </li>
            {/each}
        </ol>
    {/if}
</section>
