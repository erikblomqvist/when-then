<!--
    What one audit entry changed: its field-by-field diff and any details an app-written entry
    carries (an AI call's model and cost). Part of `AuditEntry`, and of a card history save that
    lists several entries in one box.
-->
<script lang="ts">
    import { detailItems, fieldChanges, type AuditNames } from '#lib/audit/display.js'
    import type { AuditEntry } from '#lib/server/audit.js'

    type Props = {
        entry: AuditEntry
        names: AuditNames
        /**
         * 'table' puts field, before and after side by side (the global log); 'stacked' lists
         * each change as its field over the old and new value, to fit a sidebar.
         */
        layout?: 'table' | 'stacked'
    }

    let { entry, names, layout = 'table' }: Props = $props()

    const changes = $derived(fieldChanges(entry, names))
    const details = $derived(detailItems(entry.details))
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

{#if changes.length > 0 && layout === 'stacked'}
    <ul
        aria-label="Changes"
        class="flex flex-col gap-2">
        {#each changes as change (change.field)}
            <li class="flex flex-col gap-0.5 border-t pt-2">
                <span class="text-xs font-medium">{change.label}</span>
                <span class="break-words">{@render value(change.before, 'before')}</span>
                <span class="break-words">
                    <span
                        aria-hidden="true"
                        class="text-muted-foreground">
                        →
                    </span>
                    {@render value(change.after, 'after')}
                </span>
            </li>
        {/each}
    </ul>
{:else if changes.length > 0}
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
