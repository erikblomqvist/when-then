<!--
    A card's history panel, read-only, in the editor's sidebar below the status actions (#14):
    the last three saves at a glance, one line each (what changed, who, how long ago). Entries
    written by one save (a card and its English text) count as one. "Show all" opens a dialog
    with every save in full, one box each listing its entries' field-by-field diffs and AI
    details (`HistorySave`); picking a save in the sidebar opens the dialog at that save. The
    card page passes `cardHistory()` and `auditNames()` from its load.
-->
<script lang="ts">
    import { tick } from 'svelte'
    import { Button } from '#lib/components/ui/button/index.js'
    import { formatTime, type AuditNames } from '#lib/audit/display.js'
    import {
        groupChanges,
        relativeTime,
        summarizeChange,
        type HistoryChange,
    } from '#lib/audit/history-summary.js'
    import type { AuditEntry as Entry } from '#lib/server/audit.js'
    import HistorySave from './HistorySave.svelte'

    let { entries, names }: { entries: Entry[]; names: AuditNames } = $props()

    const shownChanges = 3

    const changes = $derived(groupChanges(entries))
    const recent = $derived(changes.slice(0, shownChanges))
    const actor = (actorId: string | null) =>
        actorId ? (names.people[actorId] ?? 'Someone no longer here') : 'System'

    let dialog: HTMLDialogElement | undefined = $state()
    // A save is known by its first (newest) entry.
    const saveKey = (change: HistoryChange) => change.entries[0].id
    const saveId = (key: number) => `history-save-${key}`

    /** The save the dialog was opened at, briefly highlighted there. */
    let flashed: number | undefined = $state()

    /** Opens the full history, at a save (else at the top), and flashes it among the others. */
    async function showAll(at?: number) {
        // Cleared first, so opening at the same save again replays the flash.
        flashed = undefined
        dialog?.showModal()
        await tick()
        // With one save there is nothing to tell it apart from.
        flashed = changes.length > 1 ? at : undefined
        const target = at === undefined ? null : document.getElementById(saveId(at))
        target?.scrollIntoView({ block: 'start' })
        target?.focus({ preventScroll: true })
    }
</script>

<section
    aria-labelledby="history-heading"
    class="flex flex-col gap-3 pt-4">
    <h2
        id="history-heading"
        class="font-medium">
        History
    </h2>
    {#if changes.length === 0}
        <p class="text-sm text-muted-foreground">No changes yet.</p>
    {:else}
        <ol
            aria-label="Recent changes"
            class="flex flex-col gap-2">
            {#each recent as change (saveKey(change))}
                {@const summary = summarizeChange(change, names)}
                <li>
                    <button
                        type="button"
                        class="flex w-full flex-col gap-0.5 rounded-lg border p-3 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        aria-haspopup="dialog"
                        onclick={() => showAll(saveKey(change))}>
                        <span class="break-words">
                            <span class="font-medium">{summary.action}</span>
                            {#if summary.fields.length > 0}
                                <span class="text-muted-foreground"
                                    >{summary.fields.join(', ')}</span>
                            {/if}
                        </span>
                        <!-- A long name is cut short; the time always shows. -->
                        <span class="flex min-w-0 gap-1 text-xs text-muted-foreground">
                            <span class="truncate">{actor(change.actorId)}</span>
                            <span aria-hidden="true">·</span>
                            <time
                                class="shrink-0"
                                datetime={change.at}
                                title={formatTime(change.at)}>{relativeTime(change.at)}</time>
                        </span>
                    </button>
                </li>
            {/each}
        </ol>
        {#if changes.length > shownChanges}
            <Button
                variant="link"
                class="h-auto self-start px-0"
                aria-haspopup="dialog"
                onclick={() => showAll()}>
                Show all {changes.length} changes
            </Button>
        {/if}
    {/if}
</section>

<dialog
    bind:this={dialog}
    aria-labelledby="full-history-heading"
    class="m-auto h-dvh max-h-dvh w-full max-w-full overflow-y-auto bg-background p-4 text-foreground backdrop:bg-black/50 sm:h-fit sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:rounded-lg sm:border sm:p-6 sm:shadow-lg"
    closedby="any">
    <header
        class="sticky -top-4 z-10 -mx-4 -mt-4 mb-4 flex items-center justify-between gap-4 border-b bg-background px-4 py-3 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6">
        <h2
            id="full-history-heading"
            class="text-lg font-semibold tracking-tight">
            History
        </h2>
        <Button
            variant="outline"
            onclick={() => dialog?.close()}>
            Close
        </Button>
    </header>
    <ol class="flex flex-col gap-3">
        {#each changes as change (saveKey(change))}
            <li
                id={saveId(saveKey(change))}
                tabindex="-1"
                class="scroll-mt-20 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                class:flash={flashed === saveKey(change)}
                onanimationend={() => (flashed = undefined)}>
                <HistorySave
                    {change}
                    {names} />
            </li>
        {/each}
    </ol>
</dialog>

<style>
    /* The save the dialog was opened at: tinted, then fading back to nothing. */
    .flash {
        animation: flash 2.4s ease-out;
    }

    @keyframes flash {
        0%,
        25% {
            background-color: color-mix(in oklch, var(--ring) 22%, transparent);
        }
        100% {
            background-color: transparent;
        }
    }
</style>
