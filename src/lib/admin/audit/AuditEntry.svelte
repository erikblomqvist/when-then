<!--
    One audit entry: what happened to what, who did it and when, a field-by-field diff, and any
    details an app-written entry carries (an AI call's model and cost). Used by the card
    history panel and the global audit log. Actions, entities, fields and details it doesn't
    know still render, labelled from their names (see `#lib/audit/display.js`).
-->
<script lang="ts">
    import {
        actionLabel,
        detailItems,
        entityHref,
        entityLabel,
        fieldChanges,
        formatTime,
        type AuditNames,
    } from '#lib/audit/display.js'
    import type { AuditEntry } from '#lib/server/audit.js'

    type Props = {
        entry: AuditEntry
        names: AuditNames
        /** Heading level for the entry's title, to fit the page's outline. */
        level?: 2 | 3
        /** Name or link the thing the entry is about (the global log; a card's own history doesn't). */
        showSubject?: boolean
    }

    let { entry, names, level = 3, showSubject = false }: Props = $props()

    const changes = $derived(fieldChanges(entry, names))
    const details = $derived(detailItems(entry.details))
    const actor = $derived(
        entry.actorId ? (names.people[entry.actorId] ?? 'Someone no longer here') : 'System',
    )
    const href = $derived(entityHref(entry.entity, entry.entityId))
    const subject = $derived(
        names.people[entry.entityId] ?? names.categories[entry.entityId] ?? entry.entityId,
    )
</script>

{#snippet value(text: string | null, side: 'before' | 'after')}
    {#if text === null}
        <span class="text-muted-foreground italic">empty</span>
    {:else if side === 'before'}
        <del class="text-muted-foreground">{text}</del>
    {:else}
        <ins class="no-underline">{text}</ins>
    {/if}
{/snippet}

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

    {#if changes.length > 0}
        <table class="w-full table-fixed border-collapse text-left">
            <caption class="sr-only">Changes</caption>
            <thead class="text-xs text-muted-foreground">
                <tr>
                    <th
                        scope="col"
                        class="w-28 py-1 pr-2 font-normal">
                        Field
                    </th>
                    <th
                        scope="col"
                        class="py-1 pr-2 font-normal">
                        Before
                    </th>
                    <th
                        scope="col"
                        class="py-1 font-normal">
                        After
                    </th>
                </tr>
            </thead>
            <tbody>
                {#each changes as change (change.field)}
                    <tr class="border-t align-top">
                        <th
                            scope="row"
                            class="py-1 pr-2 font-medium">
                            {change.label}
                        </th>
                        <td class="py-1 pr-2 break-words">
                            {@render value(change.before, 'before')}
                        </td>
                        <td class="py-1 break-words">
                            {@render value(change.after, 'after')}
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}

    {#if details.length > 0}
        <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {#each details as item, index (index)}
                <dt class="text-muted-foreground">{item.label}</dt>
                <dd class="break-words">{item.value}</dd>
            {/each}
        </dl>
    {/if}
</article>
