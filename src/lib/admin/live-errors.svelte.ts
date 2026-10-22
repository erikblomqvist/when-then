// Live validation for the admin forms (#52): the errors a form shows follow what is typed,
// instead of waiting for a save. A field's error shows once the person has edited the field
// and left it, or has tried to save; from then on it follows the field and goes away when
// fixed. The server stays the judge: an error only it can find (a published card's date
// rule, a duplicate name) shows until the field it is on changes.
//
//     const live = new LiveErrors(() => values, cardFormErrors, () => errors)
//     <form onfocusout={live.onfocusout} use:enhance={() => { if (!live.attempt()) cancel() … }}>
//     {live.shown.text_en}

import { SvelteSet } from 'svelte/reactivity'

type Errors<Values> = Partial<Record<keyof Values, string>>

// Whether a mouse button or finger is down, from the press until it is released.
let pressed = false
let tracking = false
function trackPresses() {
    if (typeof window === 'undefined' || tracking) return
    tracking = true
    const options = { capture: true, passive: true }
    window.addEventListener('pointerdown', () => (pressed = true), options)
    for (const type of ['pointerup', 'pointercancel'] as const) {
        window.addEventListener(type, () => (pressed = false), options)
    }
}

/** Calls `then` once the current press ends, after the click it makes (if any). */
function afterPress(then: () => void) {
    const ended = new AbortController()
    const options = { capture: true, signal: ended.signal }
    const end = () => {
        ended.abort()
        setTimeout(then)
    }
    window.addEventListener('pointerup', end, options)
    window.addEventListener('pointercancel', end, options)
}

export class LiveErrors<Values extends Record<keyof Values, string>> {
    #values: () => Values
    #validate: (values: Values) => Errors<Values>
    #server: () => Errors<Values>
    #initial: Values
    #left = new SvelteSet<keyof Values>()
    #tried = $state(false)
    /** The values last sent to the server, to tell its errors from ones typed since. */
    #posted: Values | null = $state(null)

    /**
     * `values` reads the form's current values, `validate` finds what the browser can tell is
     * wrong with them, and `server` reads the errors from the last save's result. A form shown
     * with server errors already (a save without JavaScript) starts as tried.
     */
    constructor(
        values: () => Values,
        validate: (values: Values) => Errors<Values>,
        server: () => Errors<Values>,
    ) {
        this.#values = values
        this.#validate = validate
        this.#server = server
        this.#initial = { ...values() }
        trackPresses()
        if (Object.keys(server()).length > 0) {
            this.#tried = true
            this.#posted = { ...values() }
        }
    }

    /** The server's errors the browser can't find for itself in what was posted. */
    #serverOnly = $derived.by((): Errors<Values> => {
        const server = this.#server()
        if (!this.#posted) return {}
        const posted = this.#validate(this.#posted)
        const only: Errors<Values> = {}
        for (const name of Object.keys(server) as (keyof Values)[]) {
            if (server[name] !== posted[name]) only[name] = server[name]
        }
        return only
    })

    /** The errors to show now, by field. */
    readonly shown = $derived.by(() => {
        const values = this.#values()
        const live = this.#validate(values)
        const shown: Errors<Values> = {}
        const names = new Set([...Object.keys(live), ...Object.keys(this.#serverOnly)])
        for (const name of names as Set<keyof Values>) {
            const unchanged = this.#posted?.[name] === values[name]
            const error = live[name] ?? (unchanged ? this.#serverOnly[name] : undefined)
            if (error && (this.#tried || this.#left.has(name))) shown[name] = error
        }
        return shown
    })

    /** Nothing has changed since the last save was sent, or since the form was shown (so a
     * refusal of that save still applies). */
    get unchangedSincePosted() {
        const posted = this.#posted ?? this.#initial
        const values = this.#values()
        return (Object.keys(posted) as (keyof Values)[]).every(
            (name) => posted[name] === values[name],
        )
    }

    /** On the <form>: a field the person edited and then left shows its errors from now on. */
    onfocusout = (event: FocusEvent) => {
        const name = (event.target as { name?: unknown } | null)?.name
        if (typeof name !== 'string' || !(name in this.#initial)) return
        const field = name as keyof Values
        if (this.#values()[field] === this.#initial[field]) return
        if (!pressed) {
            this.#left.add(field)
            return
        }
        // Left by pressing something, such as Save: an error shown now could push that button
        // away before the press ends, and the click would miss it. Show it once the click is in.
        afterPress(() => this.#left.add(field))
    }

    /**
     * A save is being sent: every error shows from now on. Returns false when the browser
     * can already tell the save would fail, so the form can skip the round trip.
     */
    attempt() {
        this.#tried = true
        const posted = { ...this.#values() }
        // Not sent: the server's errors still belong to the values sent before.
        if (Object.keys(this.#validate(posted)).length > 0) return false
        this.#posted = posted
        return true
    }

    /** The save went through: the form starts over from what it now shows. */
    settle() {
        this.#tried = false
        this.#posted = null
        this.#left.clear()
        this.#initial = { ...this.#values() }
    }
}
