<!--
    A list of actions, one full-width row each, in a rounded box with a line between rows (see
    `ContextMenuAction` in ./context-menu.ts for what a row takes). The whole row is clickable;
    its icon and label sit at the start, with an optional caption line under the label, and any
    keyboard shortcut keycaps at the end (icon and keycaps on the label's line). Its tone colours
    the label and icon: neutral, constructive (green), caution (ochre) or destructive (red),
    while a caption stays grey. A disabled row drops its tone for a light grey, struck through.
    The caption describes the row (`aria-describedby`) rather than naming it.

    A row with `confirm` (every destructive one) asks first, in a dialog with its own question,
    consequence and action word; the row's click (form submit, `onclick` or link) only goes
    ahead once confirmed. `onaction` runs once a row acts, e.g. to close a pop-up the menu is in
    (`ContextMenuPopup`).

        <ContextMenu label="Card actions" actions={[...]} />
-->
<script lang="ts">
    import { Button } from '#lib/components/ui/button/index.js'
    import Keys from './Keys.svelte'
    import type {
        ContextMenuAction,
        ContextMenuConfirmation,
        ContextMenuTone,
    } from './context-menu.js'
    import { ariaKeyshortcuts } from './shortcut.js'

    type Props = {
        label: string
        actions: ContextMenuAction[]
        /** After a row acts (once confirmed, if it asks); its own click still does its thing. */
        onaction?: (action: ContextMenuAction) => void
    }

    let { label, actions, onaction }: Props = $props()

    const uid = $props.id()
    const labelId = (index: number) => `${uid}-label-${index}`
    const captionId = (index: number) => `${uid}-caption-${index}`
    const describedBy = (action: ContextMenuAction, index: number) =>
        [action.caption ? captionId(index) : null, action.describedBy].filter(Boolean).join(' ') ||
        undefined

    // A row that asks first: its click waits for the dialog, then the row is clicked again
    // with `confirmed` set, so a form submits, `onclick` runs or a link opens as usual.
    let dialog: HTMLDialogElement | undefined = $state()
    let asking:
        | { confirmation: ContextMenuConfirmation; tone: ContextMenuTone; row: HTMLElement }
        | undefined = $state()
    let confirmed = false

    function clicked(event: MouseEvent, action: ContextMenuAction) {
        if (action.confirm && !confirmed) {
            event.preventDefault()
            asking = {
                confirmation: action.confirm,
                tone: action.tone ?? 'neutral',
                row: event.currentTarget as HTMLElement,
            }
            dialog?.showModal()
            return
        }
        action.onclick?.()
        onaction?.(action)
    }

    function confirm() {
        const row = asking?.row
        dialog?.close()
        if (!row) return
        confirmed = true
        row.click()
        confirmed = false
    }

    // The tone colours the label and icon, and hovering washes the row with a faint, muted
    // tint of it (a neutral row turns grey).
    const tones: Record<ContextMenuTone, string> = {
        neutral: 'hover:bg-muted',
        constructive:
            'text-tone-constructive hover:bg-[color-mix(in_oklab,var(--tone-constructive)_7%,var(--background))]',
        caution:
            'text-tone-caution hover:bg-[color-mix(in_oklab,var(--tone-caution)_7%,var(--background))]',
        destructive:
            'text-tone-destructive hover:bg-[color-mix(in_oklab,var(--tone-destructive)_7%,var(--background))]',
    }
</script>

{#snippet content(action: ContextMenuAction, index: number)}
    <!-- The icon and keycaps sit on the label's line, above any caption. -->
    {#if action.icon}
        <span class="flex h-5 shrink-0 items-center">
            <action.icon
                class="size-4"
                aria-hidden="true" />
        </span>
    {/if}
    <span class="flex min-w-0 flex-1 flex-col">
        <span
            id={labelId(index)}
            class={['break-words', action.disabled && 'line-through']}>{action.label}</span>
        {#if action.caption}
            <span
                id={captionId(index)}
                class="text-xs font-normal break-words text-muted-foreground">
                {action.caption}
            </span>
        {/if}
    </span>
    {#if action.keys}
        <span class={['flex h-5 shrink-0 items-center', action.disabled && 'opacity-50']}>
            <Keys
                keys={action.keys}
                look="raised" />
        </span>
    {/if}
{/snippet}

{#if actions.length > 0}
    <ul
        aria-label={label}
        class="flex flex-col divide-y overflow-hidden rounded-lg border text-sm">
        {#each actions as action, index (action.id ?? action.label)}
            {@const classes = [
                'flex min-h-10 w-full items-start gap-2 bg-background px-3 py-2.5 text-left font-medium outline-none transition-colors',
                'focus-visible:relative focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
                // Disabled: no tone, no hover, a light grey (struck through, see the label).
                action.disabled
                    ? 'pointer-events-none text-muted-foreground/60'
                    : tones[action.tone ?? 'neutral'],
            ]}
            <li class="flex">
                {#if action.href && !action.disabled}
                    <a
                        id={action.id}
                        href={action.href}
                        class={classes}
                        aria-labelledby={labelId(index)}
                        aria-describedby={describedBy(action, index)}
                        aria-keyshortcuts={action.keys ? ariaKeyshortcuts(action.keys) : undefined}
                        onclick={(event) => clicked(event, action)}>
                        {@render content(action, index)}
                    </a>
                {:else}
                    <button
                        id={action.id}
                        type={action.form ? 'submit' : 'button'}
                        form={action.form}
                        formaction={action.formaction}
                        disabled={action.disabled}
                        class={classes}
                        aria-labelledby={labelId(index)}
                        aria-describedby={describedBy(action, index)}
                        aria-keyshortcuts={action.keys ? ariaKeyshortcuts(action.keys) : undefined}
                        onclick={(event) => clicked(event, action)}>
                        {@render content(action, index)}
                    </button>
                {/if}
            </li>
        {/each}
    </ul>
{/if}

<dialog
    bind:this={dialog}
    aria-labelledby="{uid}-confirm-title"
    aria-describedby="{uid}-confirm-message"
    class="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border bg-background p-6 text-sm text-foreground shadow-lg backdrop:bg-black/50"
    onclose={() => (asking = undefined)}>
    {#if asking}
        <h2
            id="{uid}-confirm-title"
            class="text-lg font-semibold tracking-tight">
            {asking.confirmation.title}
        </h2>
        <p
            id="{uid}-confirm-message"
            class="mt-2 text-muted-foreground">
            {asking.confirmation.message}
        </p>
        <div class="mt-6 flex flex-wrap justify-end gap-2">
            <Button
                variant="outline"
                autofocus
                onclick={() => dialog?.close()}>
                {asking.confirmation.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
                variant={asking.tone === 'destructive' ? 'destructive' : 'default'}
                onclick={confirm}>
                {asking.confirmation.confirmLabel}
            </Button>
        </div>
    {/if}
</dialog>
