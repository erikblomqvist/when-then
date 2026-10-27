// PROTOTYPE (#16), throwaway: a whole game held in memory in the browser, played by the real
// machine. Every phone on the page, and every tab or iframe of this prototype, shares it over a
// BroadcastChannel, so the table view's phones move together. Nothing is saved.

import { apply, type Command } from '#lib/game/machine.js'
import { refusalMessage } from '#lib/game/refusals.js'
import { buildScenario } from '#lib/game/scenario.js'
import type { GameState } from '#lib/game/state.js'
import { redact } from '#lib/game/view.js'
import { actorOf } from './lib'
import { momentByKey } from './moments'

type Message =
    | { kind: 'state'; moment: string; version: number; state: GameState }
    | { kind: 'hello'; moment: string }

export class PrototypeGame {
    moment = $state('')
    state = $state.raw<GameState>(undefined!)
    version = $state(0)
    refusal = $state<string | null>(null)
    #channel: BroadcastChannel | null = null

    constructor(moment: string) {
        this.#load(moment)
        if (typeof BroadcastChannel !== 'undefined') {
            this.#channel = new BroadcastChannel('when-then-prototype-in-game')
            this.#channel.onmessage = ({ data }: MessageEvent<Message>) => this.#receive(data)
            this.#channel.postMessage({ kind: 'hello', moment: this.moment } satisfies Message)
        }
    }

    #load(moment: string) {
        const found = momentByKey(moment)
        this.moment = found.key
        this.state = buildScenario(found.recipe).state
        this.version = 0
        this.refusal = null
    }

    #receive(message: Message) {
        if (message.kind === 'hello') {
            if (message.moment === this.moment && this.version > 0) this.#send()
            return
        }
        // A reset (version 0) always wins; otherwise only a newer state of the same moment.
        if (
            message.version === 0 ||
            (message.moment === this.moment && message.version > this.version)
        ) {
            this.moment = message.moment
            this.state = message.state
            this.version = message.version
            this.refusal = null
        }
    }

    #send() {
        this.#channel?.postMessage({
            kind: 'state',
            moment: this.moment,
            version: this.version,
            state: $state.snapshot(this.state) as GameState,
        } satisfies Message)
    }

    /** Back to the start of `moment`, on every phone. */
    reset(moment = this.moment) {
        this.#load(moment)
        this.#send()
    }

    dispatch = (command: Command) => {
        const result = apply(this.state, command)
        if (!result.ok) {
            this.refusal = refusalMessage(result.refusal)
            return
        }
        this.state = result.state
        this.version++
        this.refusal = null
        this.#send()
    }

    /** Players in their numbering, the host first. */
    get players() {
        return this.state.players.filter((p) => !p.removed)
    }

    /** The seat for `seat`: a player number, or `follow` for whoever has the move. */
    seatFor(seat: string): string {
        const n = Number(seat)
        if (Number.isInteger(n) && n >= 1 && n <= this.players.length) return this.players[n - 1].id
        return actorOf(redact(this.state, this.players[0].id)) ?? this.players[0].id
    }

    viewFor(seat: string) {
        return redact(this.state, this.seatFor(seat))
    }

    destroy() {
        this.#channel?.close()
    }
}
