// The card list's view: which cards (the filter), in what order (the sort) and which page.
// One module owns the round trip URL ⇄ typed view, so a view can be shared and reloaded, and
// the server turns the same typed filter into its query (`matchingCards` in
// `#lib/server/cards.js`, backed by `public.cards_matching`).
//
// The review mode (`review`) shows one locale's translations next to a reference language, for
// reading through, editing in place and marking reviewed in bulk. It doesn't narrow the list by
// itself, but switching it on filters the locale to what still needs review
// (`reviewSwitchFilter`), a filter like any other that can be changed or removed.
//
// Adding a filter: a field on `CardFilter`, its URL key in `parseFilter` / `filterParams`,
// its key in the server's `filterArgs`, and its clause in `public.cards_matching`.
// Unknown or malformed URL values are dropped, never errors: a stale link shows more cards.

import { Constants } from '../database.types'
import { cardLocales, type CardLocale, type CardStatus } from './card'
import { isCountryCode } from './country'
import {
    translationLocales,
    translationStateLabel,
    translationStates,
    type TranslationLocale,
    type TranslationState,
} from './translation'

const cardStatuses: readonly CardStatus[] = Constants.public.Enums.card_status

/** Before 1500 a card may be known only to the decade; from 1500 on it needs a year. */
export type CardEra = 'before-1500' | 'from-1500'
export const cardEraLabel: Record<CardEra, string> = {
    'before-1500': 'Before 1500',
    'from-1500': '1500 and later',
}

/** A translation state to filter one locale by; `needs-review` is machine or stale. */
export type TranslationFilter = TranslationState | 'needs-review'
export const translationFilters: readonly TranslationFilter[] = [
    ...translationStates,
    'needs-review',
]
export const translationFilterLabel: Record<TranslationFilter, string> = {
    ...translationStateLabel,
    'needs-review': 'Needs review',
}

/** Which cards to show. Every field is optional; an absent field doesn't narrow. */
export type CardFilter = {
    /** Free text, matched case-insensitively against the card's text in any locale. */
    search?: string
    status?: CardStatus
    /** The Archived tab (archived cards only); otherwise the Cards tab (drafts and published). */
    archived?: true
    categoryId?: string
    verified?: boolean
    /** Whether the card has a source URL. */
    hasSource?: boolean
    /** By the card's date (year, or decade when only that is known); undated cards match neither. */
    era?: CardEra
    /** Country-specific cards for a country (its code), or `none` for the rest. */
    country?: string
    /** By each locale's translation state (URL keys `sv`, `nb`). */
    translations?: Partial<Record<TranslationLocale, TranslationFilter>>
    /**
     * Suspected duplicates: cards whose English text another card (not archived) has too,
     * case, punctuation and spacing aside (`public.card_text_key`).
     */
    duplicates?: true
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

/** Review mode: a locale's translations next to a reference language (English unless set). */
export type CardReview = { locale: TranslationLocale; reference: CardLocale }

export type CardListView = {
    filter: CardFilter
    sort: CardSort
    page: number
    /** Absent: the plain list. */
    review?: CardReview
}

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
    // `status=archived` is the Archived tab, from before it had one.
    const status = oneOf(cardStatuses, params.get('status'))
    if (params.get('tab') === 'archived' || status === 'archived') filter.archived = true
    else if (status) filter.status = status
    const categoryId = params.get('category')
    if (categoryId && uuid.test(categoryId)) filter.categoryId = categoryId.toLowerCase()
    const verified = yesNo(params.get('verified'))
    if (verified !== undefined) filter.verified = verified
    const hasSource = yesNo(params.get('source'))
    if (hasSource !== undefined) filter.hasSource = hasSource
    const era = oneOf(['before-1500', 'from-1500'], params.get('era'))
    if (era) filter.era = era
    const country = params.get('country')
    if (country === 'none' || isCountryCode(country)) filter.country = country
    for (const locale of translationLocales) {
        const state = oneOf(translationFilters, params.get(locale))
        if (state) filter.translations = { ...filter.translations, [locale]: state }
    }
    if (params.get('duplicates') === 'yes') filter.duplicates = true
    return filter
}

/**
 * Review mode in a URL: `review=<locale>`, or `review=<locale>-<reference>` when the reference
 * isn't English (`review=sv-nb`: the Swedish next to the Norwegian). An unknown reference, or
 * the locale itself, is English.
 */
export function parseReview(params: URLSearchParams): CardReview | undefined {
    const [target, base = null, ...extra] = (params.get('review') ?? '').split('-')
    const locale = oneOf(translationLocales, target)
    if (!locale) return undefined
    const reference = extra.length === 0 ? oneOf(cardLocales, base) : undefined
    return { locale, reference: reference && reference !== locale ? reference : 'en' }
}

/** The `review` URL value for a review mode, leaving out an English reference. */
export const reviewParam = ({ locale, reference }: CardReview) =>
    reference === 'en' ? locale : `${locale}-${reference}`

/** The list view in a URL (`/admin/cards?…`). */
export function parseCardListView(params: URLSearchParams): CardListView {
    const page = Math.floor(Number(params.get('page')))
    const review = parseReview(params)
    return {
        filter: parseFilter(params),
        sort: oneOf(cardSorts, params.get('sort')) ?? defaultCardSort,
        page: Number.isFinite(page) && page > 1 ? page : 1,
        ...(review && { review }),
    }
}

const yesNoParam = (value: boolean) => (value ? 'yes' : 'no')

/** The filter as URL parameters, in a fixed order; absent fields are left out. */
export function filterParams(filter: CardFilter): URLSearchParams {
    const params = new URLSearchParams()
    if (filter.archived) params.set('tab', 'archived')
    if (filter.search) params.set('q', filter.search)
    if (filter.status) params.set('status', filter.status)
    if (filter.categoryId) params.set('category', filter.categoryId)
    if (filter.verified !== undefined) params.set('verified', yesNoParam(filter.verified))
    if (filter.hasSource !== undefined) params.set('source', yesNoParam(filter.hasSource))
    if (filter.era) params.set('era', filter.era)
    if (filter.country) params.set('country', filter.country)
    for (const locale of translationLocales) {
        const state = filter.translations?.[locale]
        if (state) params.set(locale, state)
    }
    if (filter.duplicates) params.set('duplicates', 'yes')
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
    review,
}: Partial<CardListView>) {
    const params = filterParams(filter)
    if (review) params.set('review', reviewParam(review))
    if (sort !== defaultCardSort) params.set('sort', sort)
    if (page > 1) params.set('page', String(page))
    const query = params.toString()
    return query ? `/admin/cards?${query}` : '/admin/cards'
}

/** Whether the filter narrows the list at all (for "No cards match" vs "No cards yet"). */
/** Whether the filter narrows the tab it is in. */
export const isFiltered = (filter: CardFilter) =>
    filterParams({ ...filter, archived: undefined }).size > 0

/**
 * The filter after switching review mode from locale `from` to `to` (absent: off). Entering a
 * locale filters it to `needs-review`, unless a state is chosen for it already; the locale left
 * loses a `needs-review` filter, which the switch is most likely to have added. Staying in the
 * same locale (another reference language) leaves the filter as it is.
 */
export function reviewSwitchFilter(
    filter: CardFilter,
    from: TranslationLocale | undefined,
    to: TranslationLocale | undefined,
): CardFilter {
    if (from === to) return filter
    const { translations: chosen, ...rest } = filter
    const translations = { ...chosen }
    if (from && translations[from] === 'needs-review') delete translations[from]
    if (to) translations[to] ??= 'needs-review'
    return Object.keys(translations).length > 0 ? { ...rest, translations } : rest
}

/**
 * The review queue for a locale: cards whose translation there is machine or stale, in review
 * mode next to English.
 */
export const reviewQueueHref = (locale: TranslationLocale) =>
    cardListHref({
        filter: { translations: { [locale]: 'needs-review' } },
        review: { locale, reference: 'en' },
    })
