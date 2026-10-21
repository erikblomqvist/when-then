// The card list's view: which cards (the filter), in what order (the sort) and which page.
// One module owns the round trip URL ⇄ typed view, so a view can be shared and reloaded, and
// the server turns the same typed filter into its query (`matchingCards` in
// `#lib/server/cards.js`, backed by `public.cards_matching`).
//
// Adding a filter: a field on `CardFilter`, its URL key in `parseFilter` / `filterParams`,
// its key in the server's `filterArgs`, and its clause in `public.cards_matching`.
// Unknown or malformed URL values are dropped, never errors: a stale link shows more cards.

import { Constants } from '../database.types'
import type { CardStatus } from './card'

const cardStatuses: readonly CardStatus[] = Constants.public.Enums.card_status

/** Before 1500 a card may be known only to the decade; from 1500 on it needs a year. */
export type CardEra = 'before-1500' | 'from-1500'
export const cardEraLabel: Record<CardEra, string> = {
    'before-1500': 'Before 1500',
    'from-1500': '1500 and later',
}

/** Which cards to show. Every field is optional; an absent field doesn't narrow. */
export type CardFilter = {
    /** Free text, matched case-insensitively against the card's text in any locale. */
    search?: string
    status?: CardStatus
    categoryId?: string
    verified?: boolean
    /** Whether the card has a source URL. */
    hasSource?: boolean
    /** By the card's date (year, or decade when only that is known); undated cards match neither. */
    era?: CardEra
}

/** Sort key, `-` for descending. Date sorts undated cards last either way. */
export type CardSort = 'date' | '-date' | 'updated' | '-updated'
export const cardSorts: readonly CardSort[] = ['-updated', 'updated', 'date', '-date']
export const cardSortLabel: Record<CardSort, string> = {
    '-updated': 'Recently updated',
    updated: 'Least recently updated',
    date: 'Date, oldest first',
    '-date': 'Date, newest first',
}
export const defaultCardSort: CardSort = '-updated'

export type CardListView = { filter: CardFilter; sort: CardSort; page: number }

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

const oneOf = <T extends string>(values: readonly T[], value: string | null): T | undefined =>
    values.find((candidate) => candidate === value)

const yesNo = (value: string | null): boolean | undefined =>
    value === 'yes' ? true : value === 'no' ? false : undefined

/** The filter in a URL. */
export function parseFilter(params: URLSearchParams): CardFilter {
    const filter: CardFilter = {}
    const search = params.get('q')?.trim()
    if (search) filter.search = search
    const status = oneOf(cardStatuses, params.get('status'))
    if (status) filter.status = status
    const categoryId = params.get('category')
    if (categoryId && uuid.test(categoryId)) filter.categoryId = categoryId.toLowerCase()
    const verified = yesNo(params.get('verified'))
    if (verified !== undefined) filter.verified = verified
    const hasSource = yesNo(params.get('source'))
    if (hasSource !== undefined) filter.hasSource = hasSource
    const era = oneOf(['before-1500', 'from-1500'], params.get('era'))
    if (era) filter.era = era
    return filter
}

/** The list view in a URL (`/admin/cards?…`). */
export function parseCardListView(params: URLSearchParams): CardListView {
    const page = Math.floor(Number(params.get('page')))
    return {
        filter: parseFilter(params),
        sort: oneOf(cardSorts, params.get('sort')) ?? defaultCardSort,
        page: Number.isFinite(page) && page > 1 ? page : 1,
    }
}

const yesNoParam = (value: boolean) => (value ? 'yes' : 'no')

/** The filter as URL parameters, in a fixed order; absent fields are left out. */
export function filterParams(filter: CardFilter): URLSearchParams {
    const params = new URLSearchParams()
    if (filter.search) params.set('q', filter.search)
    if (filter.status) params.set('status', filter.status)
    if (filter.categoryId) params.set('category', filter.categoryId)
    if (filter.verified !== undefined) params.set('verified', yesNoParam(filter.verified))
    if (filter.hasSource !== undefined) params.set('source', yesNoParam(filter.hasSource))
    if (filter.era) params.set('era', filter.era)
    return params
}

/**
 * The card list's URL for a view, leaving out defaults so the plain list stays `/admin/cards`.
 * Pass the current view with changes, e.g. `cardListHref({ ...view, page: view.page + 1 })`.
 */
export function cardListHref({
    filter = {},
    sort = defaultCardSort,
    page = 1,
}: Partial<CardListView>) {
    const params = filterParams(filter)
    if (sort !== defaultCardSort) params.set('sort', sort)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/admin/cards?${query}` : '/admin/cards'
}

/** Whether the filter narrows the list at all (for "No cards match" vs "No cards yet"). */
export const isFiltered = (filter: CardFilter) => filterParams(filter).size > 0
