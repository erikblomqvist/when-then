import { describe, expect, it } from 'vite-plus/test'
import { cardListHref, isFiltered, parseCardListView } from './card-list'

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
})
