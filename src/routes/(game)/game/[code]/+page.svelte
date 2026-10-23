<script lang="ts">
    import MinusIcon from '@lucide/svelte/icons/minus'
    import PlusIcon from '@lucide/svelte/icons/plus'
    import XIcon from '@lucide/svelte/icons/x'
    import { tick } from 'svelte'
    import { enhance, type SubmitFunction } from '$app/forms'
    import { invalidateAll } from '$app/navigation'
    import {
        Button,
        CodeInput,
        IconButton,
        Input,
        Notepad,
        PlayerIconPicker,
        PlayerRow,
        QrCode,
        Surface,
        Tabs,
        Text,
    } from '#lib'
    import { cardLocales } from '#lib/cards/card.js'
    import { cardLanguageLabel } from '#lib/game/card-language-labels.js'
    import {
        isNameTaken,
        maxPlayers,
        playerNameMaxLength,
        type PlayerIcon,
    } from '#lib/game/player.js'
    import { playerIconLabels } from '#lib/game/player-icon-labels.js'
    import { refusalMessage } from '#lib/game/refusals.js'
    import { maxTargetScore, minTargetScore } from '#lib/game/settings.js'
    import { m } from '#lib/paraglide/messages.js'
    import { watchGame } from '#lib/supabase-browser.js'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    const lobby = $derived(data.lobby)
    const you = $derived(lobby.players.find((player) => player.isYou))
    const others = $derived(lobby.players.filter((player) => !player.isYou))
    let copied = $state(false)

    // The player list updates live: refetch the lobby on every nudge newer than what's shown.
    // The effect tracks the id alone, so a refetch (a new `lobby` object) doesn't resubscribe.
    const gameId = $derived(data.lobby.gameId)
    $effect(() =>
        watchGame(
            gameId,
            () => data.lobby.version,
            () => void invalidateAll(),
        ),
    )

    async function copyLink() {
        try {
            await navigator.clipboard.writeText(data.joinUrl)
        } catch {
            // No clipboard (refused, or not a secure context): the code and QR code still work.
            return
        }
        copied = true
        setTimeout(() => (copied = false), 2000)
    }

    // Changing your name or icon: the form starts from what you have now.
    let editing = $state(false)
    let name = $state('')
    let icon = $state<PlayerIcon>()
    function startEditing() {
        name = you?.name ?? ''
        icon = you?.icon
        editing = true
    }

    // Flagged as you type, against everyone else; the database has the last word.
    const nameTaken = $derived(
        editing &&
            isNameTaken(
                name,
                others.map((player) => player.name),
            ),
    )
    const error = $derived(
        form?.refusal &&
            !(form.refusal === 'name_taken' && nameTaken) &&
            refusalMessage(form.refusal),
    )
    // The change and settings forms send back which form was refused, and their refusals show
    // in that form; the rest show below the list.
    const changeRefused = $derived(form?.values !== undefined)
    const settingsRefused = $derived(form?.settings === true)

    // The host's settings, saved on every change. They follow the lobby, so a refetch shows
    // what was saved. A stepper tap not saved yet wins over a refetch (the last save's, or a
    // nudge) landing before its own save, which would otherwise undo it.
    let unsavedScore = $state<number | null>(null)
    let targetScore = $derived(unsavedScore ?? lobby.targetScore)
    let exactYear = $derived(lobby.exactYear)
    let cardLanguage = $derived(lobby.cardLanguage)
    let settingsForm = $state<HTMLFormElement>()
    // The tabs aren't form fields: wait for their hidden inputs to update, then send.
    async function saveSettings() {
        await tick()
        settingsForm?.requestSubmit()
    }
    // The stepper: one up or down, kept in range, saved once the taps pause.
    let stepTimer: ReturnType<typeof setTimeout> | undefined
    function stepScore(by: number) {
        const current = Number.isFinite(targetScore) ? Number(targetScore) : lobby.targetScore
        unsavedScore = Math.min(maxTargetScore, Math.max(minTargetScore, current + by))
        clearTimeout(stepTimer)
        stepTimer = setTimeout(() => void saveSettings(), 400)
    }
    const savingSettings: SubmitFunction = ({ formData }) => {
        const sent = Number(formData.get('targetScore'))
        return async ({ result, update }) => {
            await update({ reset: false })
            // Saved: the lobby has it now, unless the host tapped on meanwhile.
            if (unsavedScore === sent) unsavedScore = null
            // A refused setting goes back to what's saved.
            if (result.type === 'failure') {
                unsavedScore = null
                targetScore = lobby.targetScore
                exactYear = lobby.exactYear
                cardLanguage = lobby.cardLanguage
            }
        }
    }

    let busy = $state(false)
    const submitting: SubmitFunction = ({ action }) => {
        busy = true
        return async ({ result, update }) => {
            await update({ reset: false })
            if (result.type === 'success' && action.search === '?/change') editing = false
            busy = false
        }
    }
</script>

<svelte:head>
    <title>{m.lobby_title()} {lobby.code} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="lobby-page">
    <div class="lobby">
        <Text role="heading-1">{m.lobby_title()}</Text>

        <Surface
            kind="panel"
            class="share">
            <CodeInput
                readonly
                label={m.game_code()}
                value={lobby.code} />
            <Text
                role="caption"
                as="p">{m.share_hint()}</Text>
            <QrCode
                value={data.joinUrl}
                label={m.join_qr_code()} />
            <Button
                variant="ghost"
                onclick={copyLink}>{copied ? m.link_copied() : m.copy_link()}</Button>
            <span
                class="sr-only"
                role="status">{copied ? m.link_copied() : ''}</span>
        </Surface>

        <Notepad
            title={m.players()}
            meta={m.players_count({ count: lobby.players.length, max: maxPlayers })}>
            {#each lobby.players as player, i (player.seatId)}
                <PlayerRow
                    number={i + 1}
                    name={player.name}
                    icon={player.icon}
                    role={player.isHost ? m.host() : player.isYou ? m.you() : undefined}>
                    {#snippet action()}
                        {#if you?.isHost && !player.isHost}
                            <form
                                method="post"
                                action="?/remove"
                                use:enhance={submitting}>
                                <input
                                    type="hidden"
                                    name="seat"
                                    value={player.seatId} />
                                <IconButton
                                    type="submit"
                                    label={m.remove_player({ name: player.name })}
                                    disabled={busy}>
                                    <XIcon />
                                </IconButton>
                            </form>
                        {/if}
                    {/snippet}
                </PlayerRow>
            {/each}
        </Notepad>

        <Surface
            kind="sheet"
            class={['settings', !you?.isHost && 'settings--compact']}>
            {#if you?.isHost}
                <Text role="heading-2">{m.settings()}</Text>
                <form
                    class="settings-form"
                    method="post"
                    action="?/settings"
                    bind:this={settingsForm}
                    use:enhance={savingSettings}
                    novalidate
                    onchange={() => settingsForm?.requestSubmit()}>
                    <div class="field">
                        <label
                            class="ui-caption"
                            for="target-score">{m.target_score()}</label>
                        <div class="stepper">
                            <IconButton
                                label={m.target_score_down()}
                                aria-controls="target-score"
                                disabled={targetScore <= minTargetScore}
                                onclick={() => stepScore(-1)}>
                                <MinusIcon />
                            </IconButton>
                            <Input
                                id="target-score"
                                class="score"
                                type="number"
                                name="targetScore"
                                inputmode="numeric"
                                min={minTargetScore}
                                max={maxTargetScore}
                                step="1"
                                required
                                aria-describedby="target-score-hint"
                                bind:value={targetScore} />
                            <IconButton
                                label={m.target_score_up()}
                                aria-controls="target-score"
                                disabled={targetScore >= maxTargetScore}
                                onclick={() => stepScore(1)}>
                                <PlusIcon />
                            </IconButton>
                        </div>
                        <span
                            id="target-score-hint"
                            class="ui-caption"
                            >{m.target_score_hint({
                                min: minTargetScore,
                                max: maxTargetScore,
                            })}</span>
                    </div>
                    <div class="field">
                        <span class="ui-caption">{m.exact_year_rule()}</span>
                        <Tabs
                            label={m.exact_year_rule()}
                            tabs={[
                                { id: 'off', label: m.setting_off() },
                                { id: 'on', label: m.setting_on() },
                            ]}
                            selected={exactYear ? 'on' : 'off'}
                            onchange={(id) => {
                                exactYear = id === 'on'
                                void saveSettings()
                            }} />
                        <input
                            type="hidden"
                            name="exactYear"
                            value={exactYear ? 'on' : 'off'} />
                    </div>
                    <div class="field">
                        <span class="ui-caption">{m.card_language()}</span>
                        <Tabs
                            label={m.card_language()}
                            tabs={cardLocales.map((locale) => ({
                                id: locale,
                                label: cardLanguageLabel(locale),
                            }))}
                            selected={cardLanguage}
                            onchange={(id) => {
                                cardLanguage = id
                                void saveSettings()
                            }} />
                        <input
                            type="hidden"
                            name="cardLanguage"
                            value={cardLanguage} />
                    </div>
                    {#if error && settingsRefused}
                        <p
                            class="error"
                            role="alert">
                            {error}
                        </p>
                    {/if}
                </form>
            {:else}
                <!-- A player only reads the settings: a small heading, the three values side by
                     side, and a quiet note on who sets them. -->
                <Text
                    role="heading-2"
                    class="settings-title">{m.settings()}</Text>
                <dl class="settings-list">
                    <div>
                        <dt class="ui-caption">{m.target_score()}</dt>
                        <dd>{lobby.targetScore}</dd>
                    </div>
                    <div>
                        <dt class="ui-caption">{m.exact_year_rule()}</dt>
                        <dd>{lobby.exactYear ? m.setting_on() : m.setting_off()}</dd>
                    </div>
                    <div>
                        <dt class="ui-caption">{m.card_language()}</dt>
                        <dd>{cardLanguageLabel(lobby.cardLanguage)}</dd>
                    </div>
                </dl>
                <p class="settings-note">{m.settings_host_only()}</p>
            {/if}
        </Surface>

        {#if error && !(editing && changeRefused) && !settingsRefused}
            <p
                class="error on-table"
                role="alert">
                {error}
            </p>
        {/if}

        {#if editing}
            <Surface
                kind="sheet"
                class="edit">
                <form
                    class="edit-form"
                    method="post"
                    action="?/change"
                    use:enhance={submitting}>
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
                            aria-live="polite"
                            >{nameTaken ? refusalMessage('name_taken') : ''}</span>
                    </div>
                    <PlayerIconPicker
                        name="icon"
                        legend={m.pick_icon()}
                        labels={playerIconLabels()}
                        taken={others.map((player) => player.icon)}
                        bind:value={icon} />
                    {#if error && changeRefused}
                        <p
                            class="error"
                            role="alert">
                            {error}
                        </p>
                    {/if}
                    <div class="actions">
                        <Button
                            type="submit"
                            variant="ink"
                            disabled={busy || nameTaken}>{m.save_player()}</Button>
                        <Button
                            variant="ghost"
                            onclick={() => (editing = false)}>{m.cancel()}</Button>
                    </div>
                </form>
            </Surface>
        {:else}
            <div class="actions">
                <Button
                    variant="ghost"
                    onclick={startEditing}>{m.change_player()}</Button>
                {#if !you?.isHost}
                    <form
                        method="post"
                        action="?/leave"
                        use:enhance={submitting}>
                        <Button
                            type="submit"
                            variant="ghost"
                            disabled={busy}>{m.leave_game()}</Button>
                    </form>
                {/if}
            </div>
        {/if}
    </div>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.lobby-page) {
        min-height: 100vh;
        padding: var(--space-7);
        box-sizing: border-box;
    }
    .lobby {
        display: grid;
        gap: var(--space-9);
        width: min(100%, 420px);
        margin: 0 auto;
        text-align: center;
    }
    .lobby :global(.ui-notepad),
    .lobby :global(.edit),
    .lobby :global(.settings) {
        text-align: start;
    }
    .edit-form,
    .settings-form {
        display: grid;
        gap: var(--space-8);
    }
    .settings-form :global(.ui-tabs) {
        justify-self: start;
    }
    .stepper {
        display: flex;
        align-items: center;
        gap: var(--space-3);
    }
    /* The − and + buttons step it, so no browser spin buttons as well. */
    .settings-form :global(.score::-webkit-inner-spin-button),
    .settings-form :global(.score::-webkit-outer-spin-button) {
        -webkit-appearance: none;
        margin: 0;
    }
    .settings-form :global(.score) {
        appearance: textfield;
        -moz-appearance: textfield;
        width: 6ch;
        min-width: 96px;
        text-align: center;
    }
    /* A player's read-only settings: tighter than the host's form. */
    .lobby :global(.settings--compact) {
        gap: var(--space-5);
        padding: var(--space-7) var(--space-8);
    }
    .lobby :global(.settings-title) {
        font-size: var(--font-size-21);
    }
    .settings-note {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-13);
        color: var(--text-on-paper-subtle);
    }
    .settings-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--space-5);
        margin: 0;
    }
    /* The value on top, its label under it (the markup keeps dt first, as a list needs). */
    .settings-list div {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
    }
    .settings-list dd {
        order: -1;
    }
    .settings-list dt {
        overflow-wrap: anywhere;
    }
    .settings-list dd {
        margin: 0;
        font-family: var(--type-field-family);
        font-size: var(--font-size-21);
        font-weight: var(--type-field-weight);
        font-variation-settings: var(--type-field-variation);
        font-variant-numeric: tabular-nums lining-nums;
    }
    .field {
        display: grid;
        gap: var(--space-3);
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-5);
        justify-content: center;
    }
    .error {
        margin: 0;
        font-family: var(--font-family-sans);
        font-size: var(--font-size-14);
        font-weight: var(--font-weight-bold);
        color: var(--text-error-on-paper);
    }
    .error.on-table {
        color: var(--text-error-on-table);
    }
    .error:empty {
        display: none;
    }
    .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
    }
</style>
