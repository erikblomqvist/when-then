<script lang="ts">
    import { enhance, type SubmitFunction } from '$app/forms'
    import { Button, Text } from '#lib'
    import { m } from '#lib/paraglide/messages.js'

    /**
     * The host's Remove from game for `name`'s player in `seat`, in their host menu. It asks
     * first, saying what removing means, and only then sends the form, from the `version` the
     * host saw.
     */
    let { seat, name, version }: { seat: string; name: string; version: number } = $props()
    let confirming = $state(false)

    const removing: SubmitFunction =
        () =>
        ({ update }) =>
            update({ reset: false })
</script>

{#if confirming}
    <Text>{m.remove_from_game_confirm({ name })}</Text>
    <form
        method="post"
        action="?/removeFromGame"
        use:enhance={removing}>
        <input
            type="hidden"
            name="seat"
            value={seat} />
        <input
            type="hidden"
            name="version"
            value={version} />
        <Button
            type="submit"
            variant="ink"
            block>{m.remove_player({ name })}</Button>
    </form>
    <Button
        variant="ghost"
        block
        onclick={() => (confirming = false)}>{m.cancel()}</Button>
{:else}
    <Button
        variant="ghost"
        block
        onclick={() => (confirming = true)}>{m.remove_from_game()}</Button>
{/if}
