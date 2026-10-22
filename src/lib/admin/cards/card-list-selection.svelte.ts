// Row selection in the card list: cards picked one by one (kept across pages), or every card
// matching the list's filter ("select all matching"). `selection` is the `CardSelection` a
// bulk action posts; `BulkActionBar` renders it as form fields.

import { SvelteSet } from 'svelte/reactivity'
import type { CardFilter } from '#lib/cards/card-list.js'
import type { CardSelection } from '#lib/cards/card-selection.js'

type ListState = {
    filter: CardFilter
    /** How many cards match the filter, on all pages. */
    total: number
    /** The ids of the cards on the page shown, in order. */
    pageIds: string[]
}

export class CardListSelection {
    #list: () => ListState
    #picked = new SvelteSet<string>()
    #allMatching = $state(false)

    /** `list` reads the list's current state (a getter over the page data). */
    constructor(list: () => ListState) {
        this.#list = list
    }

    /** Every card matching the filter is selected, including those on other pages. */
    get allMatching() {
        return this.#allMatching
    }

    /** How many cards a bulk action would act on. */
    get count() {
        return this.#allMatching ? this.#list().total : this.#picked.size
    }

    /** How many cards match the list's filter, on all pages. */
    get totalMatching() {
        return this.#list().total
    }

    /** What a bulk action acts on, or null when nothing is selected. */
    get selection(): CardSelection | null {
        if (this.#allMatching) return { kind: 'matching', filter: this.#list().filter }
        return this.#picked.size > 0 ? { kind: 'cards', ids: [...this.#picked] } : null
    }

    /** Every card on the page shown is selected (and there is at least one). */
    get pageSelected() {
        const { pageIds } = this.#list()
        return pageIds.length > 0 && pageIds.every((id) => this.has(id))
    }

    /** Some, but not all, cards on the page are selected. */
    get pagePartlySelected() {
        return !this.pageSelected && this.#list().pageIds.some((id) => this.has(id))
    }

    /** More cards match than are selected, so "select all matching" adds some. */
    get canSelectAllMatching() {
        return !this.#allMatching && this.pageSelected && this.#list().total > this.#picked.size
    }

    has(id: string) {
        return this.#allMatching || this.#picked.has(id)
    }

    toggle(id: string) {
        // Leaving "all matching": keep the rest of this page selected.
        if (this.#allMatching) this.#pickPage()
        if (this.#picked.has(id)) this.#picked.delete(id)
        else this.#picked.add(id)
    }

    togglePage() {
        if (this.pageSelected) {
            this.#allMatching = false
            for (const id of this.#list().pageIds) this.#picked.delete(id)
        } else {
            for (const id of this.#list().pageIds) this.#picked.add(id)
        }
    }

    selectAllMatching() {
        this.#allMatching = true
    }

    clear() {
        this.#allMatching = false
        this.#picked.clear()
    }

    #pickPage() {
        this.#allMatching = false
        this.#picked.clear()
        for (const id of this.#list().pageIds) this.#picked.add(id)
    }
}
