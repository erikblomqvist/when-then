<!--
    One save in a card's full history (the history dialog): what it did, who and when, then each
    entry it wrote (the card, a translation) with its diff and details (`AuditChanges`), so a save
    that touched the card and its texts reads as one box. An entry whose own action isn't the
    save's (a translation created by an AI translation) says so.
-->
<script lang="ts">
    import AuditChanges from '#lib/admin/audit/AuditChanges.svelte'
    import { actionLabel, entityLabel, formatTime, type AuditNames } from '#lib/audit/display.js'
    import { summarizeChange, type HistoryChange } from '#lib/audit/history-summary.js'
    import type { AuditEntry } from '#lib/server/audit.js'

    let { change, names }: { change: HistoryChange<AuditEntry>; names: AuditNames } = $props()

    const summary = $derived(summarizeChange(change, names))
    const actor = $derived(
        change.actorId ? (names.people[change.actorId] ?? 'Someone no longer here') : 'System',
    )

    /** What the entry is about ('Card text (Swedish)'), led by its action when not the save's. */
    function heading(entry: AuditEntry) {
        const action = actionLabel(entry.action)
        const about = entityLabel(entry.entity, entry.locale)
        return action === summary.action ? about : `${action} ${about}`
    }
</script>

<article class="flex flex-col gap-3 rounded-lg border p-3 text-sm">
    <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 class="font-medium">{summary.action}</h3>
        <p class="text-xs text-muted-foreground">
            {actor} ·
            <time datetime={change.at}>{formatTime(change.at)}</time>
        </p>
    </header>
    {#each change.entries as entry (entry.id)}
        <section class="flex flex-col gap-1">
            <h4 class="text-xs font-medium text-muted-foreground">{heading(entry)}</h4>
            <AuditChanges
                {entry}
                {names} />
        </section>
    {/each}
</article>
