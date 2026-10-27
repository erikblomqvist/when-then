<script lang="ts">
    import { invalidateAll } from '$app/navigation'
    import { absentSeats, missingSince, nextAbsence } from '#lib/game/absence.js'
    import { watchGame } from '#lib/supabase-browser.js'
    import { holdWakeLock } from '#lib/wake-lock.js'
    import Lobby from './Lobby.svelte'
    import Playing from './Playing.svelte'
    import Seating from './Seating.svelte'
    import type { PageProps } from './$types'

    let { data, form }: PageProps = $props()

    // Every phone follows the game live: refetch on every nudge newer than what's shown, and
    // shows its seat as present. The effect tracks the ids alone, so a refetch (a new `game`
    // object) doesn't resubscribe. A seat's id is the same in the lobby and from Start.
    const gameId = $derived(data.game.gameId)
    const seat = $derived(
        data.game.started
            ? data.game.view.seat
            : data.game.lobby.players.find((player) => player.isYou)!.seatId,
    )
    let present = $state<Set<string>>(new Set())
    $effect(() =>
        watchGame(
            gameId,
            () => data.game.version,
            () => void invalidateAll(),
            { seat, onChange: (seats) => (present = seats) },
        ),
    )

    // Absent, from Start on: every other seated player missing from presence for the grace
    // period, counted from when this page last saw them (or from when it opened). It's only
    // shown, to the host; nothing in the game changes because of it.
    const others = $derived(
        data.game.started
            ? data.game.view.players.filter((player) => !player.removed && player.id !== seat)
            : [],
    )
    // Not state: it carries each seat's time over from one run of the effect to the next.
    let missing = new Map<string, number>()
    let absent = $state<Set<string>>(new Set())
    $effect(() => {
        missing = missingSince(
            missing,
            others.map((player) => player.id),
            present,
            Date.now(),
        )
        let timer: ReturnType<typeof setTimeout> | undefined
        const check = () => {
            const now = Date.now()
            absent = absentSeats(missing, now)
            const next = nextAbsence(missing, now)
            if (next !== undefined) timer = setTimeout(check, next - now)
        }
        check()
        return () => clearTimeout(timer)
    })
    const isHost = $derived(
        data.game.started &&
            data.game.view.players.some((player) => player.id === seat && player.host),
    )
    const absentPlayers = $derived(isHost ? others.filter((player) => absent.has(player.id)) : [])

    const phase = $derived(data.game.started ? data.game.view.phase.name : 'lobby')
    // The screen stays on through seating and play, across the phase change between them.
    const awake = $derived(phase === 'seating' || phase === 'playing')
    $effect(() => {
        if (awake) return holdWakeLock()
    })
</script>

{#if !data.game.started}
    <Lobby
        lobby={data.game.lobby}
        joinUrl={data.joinUrl}
        {form} />
{:else if phase === 'seating'}
    <Seating
        game={data.game}
        {absentPlayers}
        {form} />
{:else}
    <Playing
        game={data.game}
        {absentPlayers}
        {form} />
{/if}
