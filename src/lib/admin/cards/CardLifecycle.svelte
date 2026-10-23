<!--
    The card editor sidebar's status actions and date verification, rendered through
    CardEditor's `sidebar` snippet. Each button is its own small form posting to an action from
    `cardLifecycleActions` (#lib/server/card-editor.js). Status actions wait while the editor
    has unsaved changes, so what gets published is what was saved. A draft is published from
    the editor instead, which saves it first.
-->
<script lang="ts">
    import { enhance } from '$app/forms'
    import { Button } from '#lib/components/ui/button/index.js'
    import type { Card } from '#lib/cards/card.js'
    import type { AppRole } from '#lib/server/roles.js'

    type Props = {
        card: Card
        /** Why the saved card can't be published yet (`publishBlockers`); empty when it can. */
        blockers: string[]
        role: AppRole
        /** The editor has unsaved changes. */
        dirty: boolean
        verifiedByEmail: string | null
        /** A refusal from the last action, to show. */
        error?: string
    }

    let { card, blockers, role, dirty, verifiedByEmail, error }: Props = $props()

    let busy = $state(false)
    const submit = (confirmation?: string) => {
        return ({ cancel }: { cancel: () => void }) => {
            if (confirmation && !confirm(confirmation)) return cancel()
            busy = true
            return async ({ update }: { update: () => Promise<void> }) => {
                await update()
                busy = false
            }
        }
    }

    // Unarchiving a once-published card publishes it again, so the publish rule applies.
    const ruleBlocks = $derived(
        card.status === 'archived' && card.archivedFrom === 'published' && blockers.length > 0,
    )
    const verifiedOn = $derived(
        card.verifiedAt
            ? new Date(card.verifiedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
              })
            : null,
    )
</script>

{#snippet action(
    name: string,
    label: string,
    options: {
        disabled?: boolean
        confirm?: string
        variant?: 'default' | 'outline' | 'destructive'
    } = {},
)}
    <form
        method="POST"
        action="?/{name}"
        use:enhance={submit(options.confirm)}>
        <Button
            type="submit"
            variant={options.variant ?? 'default'}
            disabled={busy || options.disabled}
            aria-describedby={options.disabled ? 'lifecycle-why' : undefined}>
            {label}
        </Button>
    </form>
{/snippet}

<section
    aria-labelledby="lifecycle-heading"
    class="flex flex-col gap-2">
    <h2
        id="lifecycle-heading"
        class="sr-only">
        Status actions
    </h2>
    <!-- A draft's Publish is the editor's: it saves what is in the form too. -->
    {#if card.status === 'archived'}
        {@render action(
            'unarchive',
            card.archivedFrom === 'draft' ? 'Unarchive as draft' : 'Unarchive',
            { disabled: dirty || ruleBlocks },
        )}
    {:else}
        {@render action('archive', 'Archive', { disabled: dirty, variant: 'outline' })}
    {/if}

    {#if card.status !== 'draft' && (dirty || ruleBlocks)}
        <div
            id="lifecycle-why"
            class="text-muted-foreground">
            {#if dirty}
                <p>Save your changes first.</p>
            {:else}
                <p>Before it can be published:</p>
                <ul class="list-disc pl-5">
                    {#each blockers as blocker (blocker)}
                        <li>{blocker}</li>
                    {/each}
                </ul>
            {/if}
        </div>
    {/if}

    {#if card.status === 'draft' && role === 'admin'}
        {@render action('deleteDraft', 'Delete draft', {
            variant: 'destructive',
            confirm: 'Delete this draft for good? This cannot be undone.',
        })}
    {/if}

    {#if error}
        <p
            role="alert"
            class="text-destructive">
            {error}
        </p>
    {/if}
</section>

<section
    aria-labelledby="verification-heading"
    class="flex flex-col gap-2 border-t pt-4">
    <h2
        id="verification-heading"
        class="font-medium">
        Date verification
    </h2>
    {#if card.verifiedAt}
        <p>
            Verified by {verifiedByEmail ?? 'someone no longer here'} on {verifiedOn}.
        </p>
        {@render action('unverify', 'Clear verification', { variant: 'outline' })}
    {:else}
        <p class="text-muted-foreground">Not verified against a source yet.</p>
        {@render action('verify', 'Mark date verified', { variant: 'outline' })}
    {/if}
</section>
