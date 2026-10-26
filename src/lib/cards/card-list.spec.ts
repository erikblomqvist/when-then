import { describe, expect, it } from 'vite-plus/test'
import {
    cardListHref,
    isFiltered,
    parseCardListView,
    reviewQueueHref,
    reviewSwitchFilter,
} from './card-list'

const categoryId = '6f1c1d5e-8f0a-4c43-9d1e-2b7a0f6c1a01'

const params = (query: string) => new URLSearchParams(query)

describe('parseCardListView', () => {
    it('reads an empty URL as every card, most recently updated first, page 1', () => {
        expect(parseCardListView(params(''))).toEqual({
            filter: {},
            sort: '-updated',
            page: 1,
        })
    })

    it('reads search, every filter, sort and page', () => {
        expect(
            parseCardListView(
                params(
                    `q=+clock+&status=published&category=${categoryId}&verified=no&source=yes&era=before-1500&sort=-date&page=3`,
                ),
            ),
        ).toEqual({
            filter: {
                search: 'clock',
                status: 'published',
                categoryId,
                verified: false,
                hasSource: true,
                era: 'before-1500',
            },
            sort: '-date',
            page: 3,
        })
    })

    it('drops values it does not know instead of failing', () => {
        expect(
            parseCardListView(
                params(
                    'q=+++&status=retired&category=events&verified=maybe&source=1&era=1500&sort=random&page=-2',
                ),
            ),
        ).toEqual({ filter: {}, sort: '-updated', page: 1 })
        expect(parseCardListView(params('page=abc')).page).toBe(1)
        expect(parseCardListView(params('page=2.7')).page).toBe(2)
    })
})

describe('cardListHref', () => {
    it('is the plain list for the default view', () => {
        expect(cardListHref({})).toBe('/admin/cards')
        expect(cardListHref({ filter: {}, sort: '-updated', page: 1 })).toBe('/admin/cards')
    })

    it('writes a view that reads back the same', () => {
        const view = {
            filter: {
                search: 'harvest race & co',
                status: 'draft' as const,
                categoryId,
                verified: true,
                hasSource: false,
                era: 'from-1500' as const,
            },
            sort: 'date' as const,
            page: 2,
        }
        const href = cardListHref(view)
        expect(href).toBe(
            `/admin/cards?q=harvest+race+%26+co&status=draft&category=${categoryId}&verified=yes&source=no&era=from-1500&sort=date&page=2`,
        )
        expect(parseCardListView(new URL(href, 'http://localhost').searchParams)).toEqual(view)
    })
})

describe('isFiltered', () => {
    it('tells a narrowed list from the whole list', () => {
        expect(isFiltered({})).toBe(false)
        expect(isFiltered({ verified: false })).toBe(true)
    })

    it('does not count the Archived tab as a filter', () => {
        expect(isFiltered({ archived: true })).toBe(false)
        expect(isFiltered({ archived: true, search: 'moon' })).toBe(true)
    })
})

describe('the Archived tab', () => {
    it('is ?tab=archived, and the old status=archived opens it too', () => {
        expect(cardListHref({ filter: { archived: true } })).toBe('/admin/cards?tab=archived')
        expect(parseCardListView(new URLSearchParams('tab=archived&q=moon')).filter).toEqual({
            archived: true,
            search: 'moon',
        })
        expect(parseCardListView(new URLSearchParams('status=archived')).filter).toEqual({
            archived: true,
        })
    })
})

describe('translation filters', () => {
    it('reads a translation state per locale, dropping unknown states and locales', () => {
        expect(parseCardListView(params('sv=machine&nb=needs-review')).filter).toEqual({
            translations: { sv: 'machine', nb: 'needs-review' },
        })
        expect(parseCardListView(params('sv=done&en=missing')).filter).toEqual({})
    })

    it('writes them back after the other filters', () => {
        expect(
            cardListHref({
                filter: { status: 'published', translations: { nb: 'missing', sv: 'stale' } },
            }),
        ).toBe('/admin/cards?status=published&sv=stale&nb=missing')
        expect(isFiltered({ translations: {} })).toBe(false)
    })

    it('links the review queue for a locale: machine or stale there, in review mode', () => {
        expect(reviewQueueHref('sv')).toBe('/admin/cards?sv=needs-review&review=sv')
    })

    it('filters to what needs review on entering review mode, and drops it on leaving', () => {
        expect(reviewSwitchFilter({ search: 'kite' }, undefined, 'sv')).toEqual({
            search: 'kite',
            translations: { sv: 'needs-review' },
        })
        // A state chosen for the locale already stays.
        expect(reviewSwitchFilter({ translations: { sv: 'reviewed' } }, undefined, 'sv')).toEqual({
            translations: { sv: 'reviewed' },
        })
        // Another locale: its own needs-review, the other locale's goes, other states stay.
        expect(reviewSwitchFilter({ translations: { sv: 'needs-review' } }, 'sv', 'nb')).toEqual({
            translations: { nb: 'needs-review' },
        })
        expect(reviewSwitchFilter({ translations: { sv: 'machine' } }, 'sv', 'nb')).toEqual({
            translations: { sv: 'machine', nb: 'needs-review' },
        })
        // Off.
        expect(
            reviewSwitchFilter(
                { search: 'kite', translations: { sv: 'needs-review' } },
                'sv',
                undefined,
            ),
        ).toEqual({ search: 'kite' })
        // The same locale (another reference): unchanged, even with the filter removed.
        expect(reviewSwitchFilter({ search: 'kite' }, 'sv', 'sv')).toEqual({ search: 'kite' })
    })

    it('round-trips review mode, English as the reference unless another is given', () => {
        expect(parseCardListView(params('review=nb')).review).toEqual({
            locale: 'nb',
            reference: 'en',
        })
        const sv = { locale: 'sv' as const, reference: 'nb' as const }
        expect(cardListHref({ review: sv })).toBe('/admin/cards?review=sv-nb')
        expect(parseCardListView(params('review=sv-nb')).review).toEqual(sv)
        expect(cardListHref({ review: { locale: 'sv', reference: 'en' } })).toBe(
            '/admin/cards?review=sv',
        )
        // English given explicitly is the same, and its link leaves it out.
        expect(parseCardListView(params('review=nb-en')).review).toEqual({
            locale: 'nb',
            reference: 'en',
        })
    })

    it('drops a review mode that is not one: English, an unknown locale, itself as reference', () => {
        expect(parseCardListView(params('review=en')).review).toBeUndefined()
        expect(parseCardListView(params('review=fi')).review).toBeUndefined()
        expect(parseCardListView(params('')).review).toBeUndefined()
        expect(parseCardListView(params('review=en-sv')).review).toBeUndefined()
        // An unknown reference, or the locale itself, is English.
        for (const value of ['sv-sv', 'sv-fi', 'sv-', 'sv-nb-en']) {
            expect(parseCardListView(params(`review=${value}`)).review).toEqual({
                locale: 'sv',
                reference: 'en',
            })
        }
    })
})
