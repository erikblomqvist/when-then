<script lang="ts">
    import { Button, CodeInput, Notepad, PlayerRow, QrCode, Surface, Text } from '#lib'
    import { maxPlayers } from '#lib/game/player.js'
    import { m } from '#lib/paraglide/messages.js'
    import type { PageProps } from './$types'

    let { data }: PageProps = $props()

    const lobby = $derived(data.lobby)
    let copied = $state(false)

    async function copyLink() {
        await navigator.clipboard.writeText(data.joinUrl)
        copied = true
        setTimeout(() => (copied = false), 2000)
    }
</script>

<svelte:head>
    <title>{m.lobby_title()} {lobby.code} · {m.app_name()}</title>
</svelte:head>

<Surface
    kind="table"
    grain
    class="page">
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
            {#each lobby.players as player, i (player.name)}
                <PlayerRow
                    number={i + 1}
                    name={player.name}
                    icon={player.icon}
                    role={player.isHost ? m.host() : player.isYou ? m.you() : undefined} />
            {/each}
        </Notepad>
    </div>
</Surface>

<style>
    :global(body) {
        margin: 0;
    }
    :global(.page) {
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
    .lobby :global(.ui-notepad) {
        text-align: start;
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
