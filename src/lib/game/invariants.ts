// What must hold of every game state, whatever the moves. The rules themselves live in the
// machine (`./machine`); this is only a safety net that the scenario builder (`./scenario`)
// runs after every step, so a rules bug shows up next to the move that caused it (ADR 0004).

import { categoriesLeft, type GameState } from './state'

/** Everything wrong with `state`, in words; empty when it's sound. */
export function invariantProblems(state: GameState): string[] {
    const problems: string[] = []
    const ids = new Set(state.players.map((player) => player.id))
    const removed = new Set(
        state.players.filter((player) => player.removed).map((player) => player.id),
    )

    if (new Set(state.seating).size !== state.seating.length) problems.push('seating repeats')
    for (const id of state.seating) {
        if (!ids.has(id)) problems.push(`seated ${id} is not a player`)
        if (removed.has(id)) problems.push(`seated ${id} is removed`)
    }

    // Each card is in exactly one place: a queue, a timeline, the discards or in play.
    const places = new Map<string, number>()
    const put = (cardId: string) => places.set(cardId, (places.get(cardId) ?? 0) + 1)
    for (const [category, queue] of Object.entries(state.queues)) {
        for (const cardId of queue) {
            put(cardId)
            if (state.cards[cardId]?.category !== category) {
                problems.push(`${cardId} is queued under ${category}`)
            }
        }
    }
    for (const cardId of state.discards) put(cardId)

    const playing = state.phase.name === 'playing' ? state.phase : undefined
    for (const [playerId, timeline] of Object.entries(state.timelines)) {
        if (!state.seating.includes(playerId)) problems.push(`${playerId} has a timeline unseated`)
        if (timeline.filter((entry) => entry.kind === 'anchor').length !== 1) {
            problems.push(`${playerId} has no single anchor`)
        }
        timeline.forEach((entry, i) => {
            if (i > 0 && timeline[i - 1].date > entry.date) {
                problems.push(`${playerId}'s timeline is out of order at ${i}`)
            }
            if (entry.kind !== 'card') return
            put(entry.cardId)
            if (state.cards[entry.cardId]?.date !== entry.date) {
                problems.push(`${entry.cardId} has the wrong date on ${playerId}'s timeline`)
            }
            if (!entry.locked && playerId !== playing?.activeId) {
                problems.push(`${playerId} has an unlocked card out of turn`)
            }
        })
    }
    const anchors = Object.values(state.timelines).flatMap((timeline) =>
        timeline.filter((entry) => entry.kind === 'anchor').map((entry) => entry.date),
    )
    if (new Set(anchors).size !== anchors.length) problems.push('two anchors share a year')

    if (playing) {
        const { activeId, play } = playing
        if (!state.seating.includes(activeId)) problems.push('the active player is not seated')
        if (!state.seating.includes(play.readerId)) problems.push('the reader is not seated')
        if (play.readerId === activeId) problems.push('the active player reads their own card')
        if (play.step === 'picking') {
            if (categoriesLeft(state).length === 0) problems.push('picking with no category left')
        } else {
            const category = state.cards[play.cardId]?.category
            if (play.draw.kind === 'category' && category !== play.draw.category) {
                problems.push('the card in play is not from the drawn category')
            }
            const onTimeline = state.timelines[activeId]?.some(
                (entry) => entry.kind === 'card' && entry.cardId === play.cardId && !entry.locked,
            )
            if (play.step === 'deciding' && !onTimeline) {
                problems.push('deciding without the card unlocked on the timeline')
            }
            if (play.step === 'placing' || play.step === 'stealing') put(play.cardId)
            if (play.step === 'stealing') {
                if (!state.seating.includes(play.stealerId))
                    problems.push('the stealer is not seated')
                if (play.stealerId === activeId)
                    problems.push('the active player steals their own card')
                const unlocked = state.timelines[activeId]?.some(
                    (entry) => entry.kind === 'card' && !entry.locked,
                )
                if (unlocked) problems.push('stealing while the active player keeps unlocked cards')
            }
        }
    }

    for (const [cardId, count] of places) {
        if (count > 1) problems.push(`${cardId} is in ${count} places`)
        if (!state.cards[cardId]) problems.push(`${cardId} is not in the deck`)
    }
    return problems
}
