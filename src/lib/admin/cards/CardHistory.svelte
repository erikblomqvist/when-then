<!--
    A card's history panel: every change to the card and its translations, newest first, with
    who made it and a field-by-field diff. Read-only. The card page mounts it in the editor's
    sidebar, below the status actions (#14), so it lays each change out stacked to fit there,
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
    class="flex flex-col gap-3 border-t pt-4">
    <h2
        id="history-heading"
        class="font-medium">
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
                        {names}
                        layout="stacked" />
                </li>
            {/each}
        </ol>
    {/if}
</section>
