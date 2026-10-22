<script lang="ts">
    import { enhance } from '$app/forms'
    import { Button, Input, PlayerIconPicker, Surface, Text } from '#lib'
    import { playerNameMaxLength, type PlayerIcon } from '#lib/game/player.js'
    import { playerIconLabels } from '#lib/game/player-icon-labels.js'
    import { refusalMessage } from '#lib/game/refusals.js'
    import { m } from '#lib/paraglide/messages.js'
    import { ensureSession } from '#lib/supabase-browser.js'
    import type { PageProps } from './$types'

    let { form }: PageProps = $props()

    let connectionFailed = $state(false)
    let busy = $state(false)
    // The form's values survive a refusal; a fresh page starts empty.
    // svelte-ignore state_referenced_locally
    let icon = $state(form?.values.icon as PlayerIcon | undefined)

    const error = $derived(
        connectionFailed || form?.signedOut
            ? m.connection_failed()
            : form?.refusal && refusalMessage(form.refusal),
    )
</script>

<svelte:head>
    <title>{m.new_game_title()} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="new-game">
    <Surface
        kind="sheet"
        class="sheet">
        <Text role="heading-2">{m.new_game_title()}</Text>
        <Text
            role="caption"
            as="p">{m.new_game_intro()}</Text>
        <form
            method="post"
            use:enhance={async ({ cancel }) => {
                busy = true
                connectionFailed = false
                try {
                    await ensureSession()
                } catch {
                    connectionFailed = true
                    busy = false
                    cancel()
                    return
                }
                return async ({ update }) => {
                    await update({ reset: false })
                    busy = false
                }
            }}>
            <label class="field">
                <span class="ui-caption">{m.your_name()}</span>
                <Input
                    name="name"
                    required
                    maxlength={playerNameMaxLength}
                    autocomplete="off"
                    data-1p-ignore
                    value={form?.values.name ?? ''} />
            </label>
            <PlayerIconPicker
                name="icon"
                legend={m.pick_icon()}
                labels={playerIconLabels()}
                bind:value={icon} />
            {#if error}
                <p
                    class="error"
                    role="alert">
                    {error}
                </p>
            {/if}
            <Button
                type="submit"
                variant="ink"
                size="lg"
                block
                disabled={busy}>{m.create_game()}</Button>
        </form>
    </Surface>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.new-game) {
        min-height: 100vh;
        display: grid;
        align-content: center;
        justify-items: center;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    :global(.sheet) {
        width: min(100%, 420px);
    }
    form {
        display: grid;
        gap: var(--space-8);
    }
    .field {
        display: grid;
        gap: var(--space-3);
    }
    .error {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-error-on-paper);
    }
</style>
