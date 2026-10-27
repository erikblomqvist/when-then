<script lang="ts">
    import { enhance, type SubmitFunction } from '$app/forms'
    import { Button } from '#lib'
    import { m } from '#lib/paraglide/messages.js'

    /**
     * The host's End game early, in seating and in play. It asks first, saying what ending
     * means, and only then sends the form, from the `version` the host saw.
     */
    let { version }: { version: number } = $props()
    let confirming = $state(false)

    const ending: SubmitFunction =
        () =>
        ({ update }) =>
            update({ reset: false })
</script>

<div class="end-early">
    {#if confirming}
        <p class="confirm">{m.end_early_confirm()}</p>
        <form
            method="post"
            action="?/endEarly"
            use:enhance={ending}>
            <input
                type="hidden"
                name="version"
                value={version} />
            <Button
                type="submit"
                variant="ink"
                block>{m.end_early_submit()}</Button>
        </form>
        <Button
            variant="ghost"
            block
            onclick={() => (confirming = false)}>{m.cancel()}</Button>
    {:else}
        <Button
            variant="ghost"
            onclick={() => (confirming = true)}>{m.end_early()}</Button>
    {/if}
</div>

<style>
    .end-early {
        display: grid;
        gap: var(--space-3);
        justify-items: center;
        width: 100%;
    }
    form {
        justify-self: stretch;
    }
    .confirm {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        color: var(--text-on-table);
    }
</style>
