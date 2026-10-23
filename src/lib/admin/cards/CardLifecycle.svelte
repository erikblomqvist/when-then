<!--
    The forms behind the card editor's status and verification rows, rendered through
    CardEditor's `sidebar` snippet. The rows themselves are in the editor's menu (from
    `CardLifecycleActions.menuActions`); this renders the forms they submit (one per step,
    posting to an action from `cardLifecycleActions` in #lib/server/card-editor.js), why
    Unarchive waits for the publish rule, and a refusal from the last step. (Rows waiting for a
    save point at the editor's "Unsaved changes" note.)
-->
<script lang="ts">
    import { enhance } from '$app/forms'
    import {
        lifecycleForm,
        lifecycleWhyId,
        type CardLifecycleActions,
    } from './card-lifecycle.svelte.js'

    type Props = {
        lifecycle: CardLifecycleActions
        /** A refusal from the last action, to show. */
        error?: string
    }

    let { lifecycle, error }: Props = $props()
</script>

{#each lifecycle.steps as step (step)}
    <form
        id={lifecycleForm(step)}
        method="POST"
        action="?/{step}"
        hidden
        use:enhance={lifecycle.submit()}>
    </form>
{/each}

{#if lifecycle.ruleBlocks || error}
    <div class="flex flex-col gap-2">
        {#if lifecycle.ruleBlocks}
            <div
                id={lifecycleWhyId}
                class="text-muted-foreground">
                <p>Before it can be published:</p>
                <ul class="list-disc pl-5">
                    {#each lifecycle.blockers as blocker (blocker)}
                        <li>{blocker}</li>
                    {/each}
                </ul>
            </div>
        {/if}
        {#if error}
            <p
                role="alert"
                class="text-destructive">
                {error}
            </p>
        {/if}
    </div>
{/if}
