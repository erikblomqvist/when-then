<!--
    One audit entry: what happened to what, who did it and when, a field-by-field diff, and any
    details an app-written entry carries (an AI call's model and cost). Used by the global audit
    log; the diff and details are `AuditChanges`, which the card history dialog shares. Actions,
    entities, fields and details it doesn't know still render, labelled from their names (see
    `#lib/audit/display.js`).
-->
<script lang="ts">
    import {
        actionLabel,
        entityHref,
        entityLabel,
        formatTime,
        type AuditNames,
    } from '#lib/audit/display.js'
    import type { AuditEntry } from '#lib/server/audit.js'
    import AuditChanges from './AuditChanges.svelte'

    type Props = {
        entry: AuditEntry
        names: AuditNames
        /** Heading level for the entry's title, to fit the page's outline. */
        level?: 2 | 3
        /** Name or link the thing the entry is about (the global log; a card's own history doesn't). */
        showSubject?: boolean
        /**
         * 'table' puts field, before and after side by side (the global log); 'stacked' lists
         * each change as its field over the old and new value, to fit a sidebar.
         */
        layout?: 'table' | 'stacked'
    }

    let { entry, names, level = 3, showSubject = false, layout = 'table' }: Props = $props()

    const actor = $derived(
        entry.actorId ? (names.people[entry.actorId] ?? 'Someone no longer here') : 'System',
    )
    const href = $derived(entityHref(entry.entity, entry.entityId))
    const subject = $derived(
        names.people[entry.entityId] ?? names.categories[entry.entityId] ?? entry.entityId,
    )
</script>

<article class="flex flex-col gap-2 rounded-lg border p-3 text-sm">
    <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <svelte:element
            this={`h${level}`}
            class="font-medium">
            {actionLabel(entry.action)}
            <span class="font-normal text-muted-foreground">
                {entityLabel(entry.entity, entry.locale)}
            </span>
        </svelte:element>
        <p class="text-xs text-muted-foreground">
            {actor} ·
            <time datetime={entry.at}>{formatTime(entry.at)}</time>
        </p>
        {#if showSubject}
            <p class="ml-auto text-xs">
                {#if href}
                    <a
                        class="underline-offset-2 hover:underline"
                        {href}>
                        Open card
                    </a>
                {:else}
                    <span class="text-muted-foreground">{subject}</span>
                {/if}
            </p>
        {/if}
    </header>

    <AuditChanges
        {entry}
        {names}
        {layout} />
</article>
