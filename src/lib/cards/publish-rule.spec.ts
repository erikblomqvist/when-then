import { describe, expect, it } from 'vite-plus/test'
import { publishBlockers } from './publish-rule'

const date = (decade: number | null, year: number | null = null) => ({
    decade,
    year,
    month: null,
    day: null,
})
const english = { en: { text: 'A made-up voyage' } }

describe('publishBlockers', () => {
    it('lets a card with English text and a year be published', () => {
        expect(publishBlockers({ date: date(1490, 1492), translations: english })).toEqual([])
    })

    it('lets a card before 1500 be published with only a decade', () => {
        expect(publishBlockers({ date: date(1490), translations: english })).toEqual([])
        expect(publishBlockers({ date: date(-499), translations: english })).toEqual([])
    })

    it('needs a year for a card from 1500 onwards', () => {
        expect(publishBlockers({ date: date(1500), translations: english })).toEqual([
            'Cards from 1500 onwards need a year.',
        ])
        expect(publishBlockers({ date: date(1960), translations: english })).toEqual([
            'Cards from 1500 onwards need a year.',
        ])
    })

    it('needs English text', () => {
        expect(publishBlockers({ date: date(1960, 1969), translations: {} })).toEqual([
            'Add the English text.',
        ])
        expect(
            publishBlockers({ date: date(1960, 1969), translations: { en: { text: '  ' } } }),
        ).toEqual(['Add the English text.'])
    })

    it('needs a date, since an undated card cannot be placed', () => {
        expect(publishBlockers({ date: date(null), translations: english })).toEqual([
            'Add a date: at least the decade.',
        ])
    })

    it('lists every reason at once', () => {
        expect(publishBlockers({ date: date(1800), translations: {} })).toEqual([
            'Add the English text.',
            'Cards from 1500 onwards need a year.',
        ])
    })
})
