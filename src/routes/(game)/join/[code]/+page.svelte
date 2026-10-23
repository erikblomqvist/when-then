<script lang="ts">
    import { enhance } from '$app/forms'
    import { invalidateAll } from '$app/navigation'
    import { Button, Input, PlayerIconPicker, Surface, Text } from '#lib'
    import { isNameTaken, playerNameMaxLength, type PlayerIcon } from '#lib/game/player.js'
    import { playerIconLabels } from '#lib/game/player-icon-labels.js'
    import { refusalMessage } from '#lib/game/refusals.js'
    import { m } from '#lib/paraglide/messages.js'
    import { ensureSession, watchGame } from '#lib/supabase-browser.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    const step = $derived(data.step)

    let connectionFailed = $state(false)
    let busy = $state(false)
    // The form's values survive a refusal; a fresh page starts empty.
    // svelte-ignore state_referenced_locally
    let name = $state(form?.values.name ?? '')
    // svelte-ignore state_referenced_locally
    let icon = $state(form?.values.icon as PlayerIcon | undefined)

    // Flagged as you type; the database has the last word when two players race for a name.
    const nameTaken = $derived(step !== null && isNameTaken(name, step.takenNames))

    const error = $derived(
        connectionFailed || form?.signedOut
            ? m.connection_failed()
            : // A lost race for the name shows once, as the live warning.
              form?.refusal &&
                  !(form.refusal === 'name_taken' && nameTaken) &&
                  refusalMessage(form.refusal),
    )

    // Players joining meanwhile take names and icons: refetch on every newer nudge. The effect
    // tracks the id alone, so a refetch (a new `step` object) doesn't resubscribe.
    const gameId = $derived(step?.gameId)
    $effect(() => {
        if (!gameId) return
        return watchGame(
            gameId,
            () => data.step?.version ?? 0,
            () => void invalidateAll(),
        )
    })
</script>

<svelte:head>
    <title>{m.join_game()} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="join-game">
    <Surface
        kind="sheet"
        class="sheet">
        {#if step}
            <Text role="heading-2">{m.join_title({ code: step.code })}</Text>
            {#if step.removed}
                <p
                    class="error"
                    role="alert">
                    {refusalMessage('removed')}
                    {m.removed_join_again()}
                </p>
            {/if}
            <Text
                role="caption"
                as="p">{m.player_form_intro()}</Text>
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
                <div class="field">
                    <label class="field">
                        <span class="ui-caption">{m.your_name()}</span>
                        <Input
                            name="name"
                            required
                            maxlength={playerNameMaxLength}
                            autocomplete="off"
                            data-1p-ignore
                            aria-invalid={nameTaken}
                            aria-describedby="name-taken"
                            bind:value={name} />
                    </label>
                    <span
                        id="name-taken"
                        class="error"
                        aria-live="polite">{nameTaken ? refusalMessage('name_taken') : ''}</span>
                </div>
                <PlayerIconPicker
                    name="icon"
                    legend={m.pick_icon()}
                    labels={playerIconLabels()}
                    taken={step.takenIcons}
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
                    disabled={busy || nameTaken}>{m.join_game()}</Button>
            </form>
        {:else if data.refusal}
            <div class="refused">
                <Text role="heading-2">{m.join_game()}</Text>
                <p
                    class="error"
                    role="alert">
                    {refusalMessage(data.refusal)}
                </p>
                <Button
                    variant="ghost"
                    href="/">{m.back_home()}</Button>
            </div>
        {/if}
    </Surface>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.join-game) {
        min-height: 100vh;
        display: grid;
        align-content: center;
        justify-items: center;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    :global(.join-game .sheet) {
        width: min(100%, 420px);
    }
    .refused {
        display: grid;
        gap: var(--space-7);
        justify-items: start;
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
    .error:empty {
        display: none;
    }
</style>
