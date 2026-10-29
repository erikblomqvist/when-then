// PROTOTYPE (#16), throwaway: what every variant reads off a `SeatView` the same way. Layout stays
// in the variants; this is only lookups and words. Developer-only, so its words aren't translated.

import type { Command } from '#lib/game/machine.js'
import type { GameDate, GamePlayer, LogEntry, TimelineEntry } from '#lib/game/state.js'
import type { SeatView } from '#lib/game/view.js'
import type { CategoryLook } from '#lib/ui/types.js'

/** The synthetic deck's categories in the seed's looks, plus one for `culture`. */
const looks: Record<string, CategoryLook> = {
    events: { name: 'Events', icon: 'zap', colour: 'red' },
    people: { name: 'People', icon: 'user', colour: 'blue' },
    inventions: { name: 'Inventions', icon: 'lightbulb', colour: 'amber' },
    places: { name: 'Places', icon: 'map-pin', colour: 'green' },
    culture: { name: 'Culture', icon: 'palette', colour: 'purple' },
}

export const look = (category: string): CategoryLook =>
    looks[category] ?? { name: category, icon: 'zap', colour: 'teal' }

/** The look an anchor wears: it has no category. */
export const anchorLook: CategoryLook = { name: 'Anchor year', icon: 'flag', colour: 'teal' }

/** A date as a timeline shows it: a decade before 1500 reads "1490s", and BC "430s BC". */
export const year = (date: GameDate) =>
    date < 0 ? `${-date}s BC` : date < 1500 ? `${date}s` : String(date)

/** What a variant calls to play a command as the viewing seat. */
export type Dispatch = (command: Command) => void

export type VariantProps = { view: SeatView; dispatch: Dispatch }

export const player = (view: SeatView, id: string): GamePlayer =>
    view.players.find((p) => p.id === id)!

export const nameOf = (view: SeatView, id: string) =>
    id === view.seat ? 'You' : player(view, id).name

export const playOf = (view: SeatView) => (view.phase.name === 'playing' ? view.phase.play : null)

export const activeOf = (view: SeatView) =>
    view.phase.name === 'playing' ? view.phase.activeId : null

/** Whose move it is: the picker on a choice, the stealer in a steal, else the active player. */
export function actorOf(view: SeatView): string | null {
    if (view.phase.name !== 'playing') return null
    const { play, activeId } = view.phase
    if (play.step === 'picking') return play.pickerId
    if (play.step === 'stealing') return play.stealerId
    return activeId
}

/** The viewing seat's part in the play in progress. */
export type Role = 'active' | 'reader' | 'stealer' | 'picker' | 'watcher'

export function roleOf(view: SeatView): Role {
    const play = playOf(view)
    if (!play) return 'watcher'
    const me = view.seat
    if (play.step === 'picking' && play.pickerId === me) return 'picker'
    if (play.step === 'stealing' && play.stealerId === me) return 'stealer'
    if (view.phase.name === 'playing' && view.phase.activeId === me) return 'active'
    if (play.readerId === me) return 'reader'
    return 'watcher'
}

/** Whose timeline the play is on: the stealer's during a steal, else the active player's. */
export function focusOf(view: SeatView): string | null {
    const play = playOf(view)
    if (!play) return null
    if (play.step === 'stealing') return play.stealerId
    return activeOf(view)
}

/** The card in play, once dealt, as this seat sees it. */
export const cardInPlay = (view: SeatView) => {
    const play = playOf(view)
    return play && 'card' in play ? play.card : null
}

/** One timeline entry with what it shows. */
export type Shown = {
    entry: TimelineEntry
    category: CategoryLook
    text: string
    state: 'anchor' | 'locked' | 'unlocked'
}

export const shown = (view: SeatView, entry: TimelineEntry): Shown =>
    entry.kind === 'anchor'
        ? { entry, category: anchorLook, text: 'Anchor year', state: 'anchor' }
        : {
              entry,
              category: look(view.cards[entry.cardId]?.category ?? ''),
              text: view.cards[entry.cardId]?.text ?? '',
              state: entry.locked ? 'locked' : 'unlocked',
          }

export const unlockedCount = (view: SeatView, id: string) =>
    (view.timelines[id] ?? []).filter((entry) => entry.kind === 'card' && !entry.locked).length

/** A one-line headline and a detail for what just happened, newest first. */
export type Outcome = { tone: 'good' | 'bad' | 'neutral'; title: string; detail: string }

function describe(view: SeatView, entry: LogEntry): Outcome | null {
    const who = (id: string) => nameOf(view, id)
    const card = (id: string) => view.cards[id]
    switch (entry.kind) {
        case 'play': {
            const c = card(entry.cardId)
            return entry.correct
                ? {
                      tone: 'good',
                      title: `${who(entry.playerId)} placed it right`,
                      detail: c ? `${year(c.date)} · ${c.text}` : '',
                  }
                : {
                      tone: 'bad',
                      title: `${who(entry.playerId)} misplaced it`,
                      detail: 'The card passes round the table for a steal.',
                  }
        }
        case 'steal': {
            const c = card(entry.cardId)
            return entry.correct
                ? {
                      tone: 'good',
                      title: `${who(entry.playerId)} stole it`,
                      detail: c ? `Locked at ${year(c.date)} for 1 point.` : 'Locked for 1 point.',
                  }
                : {
                      tone: 'neutral',
                      title: `${who(entry.playerId)} missed the steal`,
                      detail: 'A miss costs nothing. It passes on.',
                  }
        }
        case 'discard': {
            const c = card(entry.cardId)
            return {
                tone: 'neutral',
                title: 'Nobody got it',
                detail: c ? `It was ${year(c.date)}: ${c.text}` : 'The card is discarded.',
            }
        }
        case 'skip':
            return { tone: 'neutral', title: `${who(entry.playerId)} was skipped`, detail: '' }
        case 'remove':
            return { tone: 'neutral', title: `${who(entry.playerId)} left the game`, detail: '' }
    }
}

/** What just happened: this turn's latest outcome, or how the last turn ended. */
export function latestOutcome(view: SeatView): Outcome | null {
    const entries = view.log.length > 0 ? view.log : view.lastTurn
    for (let i = entries.length - 1; i >= 0; i--) {
        const outcome = describe(view, entries[i])
        if (outcome) return outcome
    }
    return null
}

/** A key that changes whenever a new outcome lands, to re-run reveal animations. */
export const outcomeKey = (view: SeatView) =>
    `${view.log.length}:${view.lastTurn.length}:${activeOf(view)}`

/** True on the game's very first play: only anchors on the table and nothing logged. */
export const isFirstTurn = (view: SeatView) =>
    view.log.length === 0 &&
    view.lastTurn.length === 0 &&
    Object.values(view.timelines).every((timeline) => timeline.length === 1)

/** A short line for the draw: "Category draw · Inventions", "Reader's choice", "Free choice". */
export function drawLabel(view: SeatView): string | null {
    const play = playOf(view)
    if (!play) return null
    if (play.draw.kind === 'readersChoice') return "Reader's choice"
    if (play.draw.kind === 'freeChoice') return 'Free choice'
    return `Category draw · ${look(play.draw.category).name}`
}
