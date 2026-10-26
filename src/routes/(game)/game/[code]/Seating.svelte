<script lang="ts">
    import { tick } from 'svelte'
    import { enhance, type SubmitFunction } from '$app/forms'
    import { Button, Surface, Text } from '#lib'
    import { refusalMessage } from '#lib/game/refusals.js'
    import type { Seating } from '#lib/game/seating.js'
    import { seatingWords } from '#lib/game/seating-words.js'
    import { m } from '#lib/paraglide/messages.js'
    import SeatingEditor from '#lib/ui/SeatingEditor.svelte'
    import SeatingTable from '#lib/ui/SeatingTable.svelte'
    import type { ActionData, PageData } from './$types'

    /**
     * The game in seating, as this seat sees it. The host arranges everyone and confirms the
     * seating; every other phone shows the table from its own seat, following the host live.
     */
    let {
        game,
        form,
    }: {
        game: Extract<PageData['game'], { started: true }>
        form: ActionData
    } = $props()

    const view = $derived(game.view)
    const isHost = $derived(view.players.some((player) => player.id === view.seat && player.host))
    const seated = $derived(view.players.filter((player) => !player.removed))
    const words = $derived(seatingWords())
    const error = $derived(form?.refusal && refusalMessage(form.refusal))

    // The host's moves, saved one at a time. A move made while one is saving waits for the
    // refetch after it, so it goes out from the version it lands on. Undefined is nothing unsaved.
    let unsaved = $state<Seating>()
    const seating = $derived(unsaved ?? view.seating)
    let seatForm = $state<HTMLFormElement>()
    let saving = false
    async function moveTo(next: Seating) {
        unsaved = next
        if (saving) return
        saving = true
        // The hidden fields update first.
        await tick()
        seatForm?.requestSubmit()
    }
    const savingSeating: SubmitFunction = ({ formData }) => {
        const sent = formData.get('seating')
        return async ({ result, update }) => {
            await update({ reset: false })
            saving = false
            // Refused: back to what's saved, with the refusal showing.
            if (result.type === 'failure' || JSON.stringify(unsaved) === sent) unsaved = undefined
            else if (unsaved) void moveTo(unsaved)
        }
    }

    // Confirm is off until the last move has saved, so it confirms the seating the host sees.
    let confirming = $state(false)
    const confirmingSeating: SubmitFunction = () => {
        confirming = true
        return async ({ update }) => {
            await update({ reset: false })
            confirming = false
        }
    }
</script>

<svelte:head>
    <title>{m.seating_title()} {game.code} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="seating-page">
    <div class="seating">
        <Text role="heading-1">{m.seating_title()}</Text>
        {#if isHost}
            <p class="hint">{m.seating_host_hint()}</p>
            <SeatingEditor
                players={seated}
                bind:seating={() => seating, moveTo}
                anchor={view.seat}
                {words} />
            <form
                method="post"
                action="?/seating"
                bind:this={seatForm}
                use:enhance={savingSeating}>
                <input
                    type="hidden"
                    name="seating"
                    value={JSON.stringify(seating)} />
                <input
                    type="hidden"
                    name="version"
                    value={game.version} />
            </form>
            <form
                method="post"
                action="?/confirm"
                use:enhance={confirmingSeating}>
                <input
                    type="hidden"
                    name="version"
                    value={game.version} />
                <Button
                    type="submit"
                    size="lg"
                    disabled={confirming || unsaved !== undefined}>{m.seating_confirm()}</Button>
            </form>
        {:else}
            <p class="hint">{m.seating_player_hint()}</p>
            <SeatingTable
                players={seated}
                seating={view.seating}
                me={view.seat}
                {words}>{words.turnsGoLeft}</SeatingTable>
        {/if}
        {#if error}
            <p
                class="error"
                role="alert">
                {error}
            </p>
        {/if}
    </div>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.seating-page) {
        min-height: 100vh;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    .seating {
        display: grid;
        gap: var(--space-7);
        justify-items: center;
        width: min(100%, 420px);
        margin: 0 auto;
        text-align: center;
    }
    .hint {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-15);
        color: var(--text-on-table-secondary);
    }
    .error {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-error-on-table);
    }
</style>
