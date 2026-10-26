import { describe, expect, it } from 'vite-plus/test'
import { absentAfter, absentSeats, missingSince, nextAbsence } from './absence'

const seats = ['astrid', 'bo', 'caro']

describe('missingSince', () => {
    it('starts the clock for every seat not present, and none for those present', () => {
        const missing = missingSince(new Map(), seats, new Set(['astrid']), 1000)
        expect(missing).toEqual(
            new Map([
                ['bo', 1000],
                ['caro', 1000],
            ]),
        )
    })

    it('keeps the time a seat went missing while it stays missing', () => {
        const before = new Map([['bo', 1000]])
        const missing = missingSince(before, ['astrid', 'bo'], new Set(['astrid']), 5000)
        expect(missing.get('bo')).toBe(1000)
    })

    it('forgets a seat once it is present again', () => {
        const before = new Map([['bo', 1000]])
        const missing = missingSince(before, seats, new Set(seats), 5000)
        expect(missing.size).toBe(0)
    })

    it('forgets a seat that is no longer in the game', () => {
        const before = new Map([['caro', 1000]])
        const missing = missingSince(before, ['astrid', 'bo'], new Set(['astrid', 'bo']), 5000)
        expect(missing.has('caro')).toBe(false)
    })
})

describe('absentSeats', () => {
    const missing = new Map([
        ['bo', 1000],
        ['caro', 8000],
    ])

    it('is nobody during the grace period', () => {
        expect(absentSeats(missing, 1000 + absentAfter - 1)).toEqual(new Set())
    })

    it('is each seat missing for the whole grace period', () => {
        expect(absentSeats(missing, 1000 + absentAfter)).toEqual(new Set(['bo']))
        expect(absentSeats(missing, 8000 + absentAfter)).toEqual(new Set(['bo', 'caro']))
    })
})

describe('nextAbsence', () => {
    it('is when the next missing seat turns absent', () => {
        const missing = new Map([
            ['bo', 1000],
            ['caro', 8000],
        ])
        expect(nextAbsence(missing, 2000)).toBe(1000 + absentAfter)
        expect(nextAbsence(missing, 1000 + absentAfter)).toBe(8000 + absentAfter)
    })

    it('is nothing when every missing seat is already absent, or none is missing', () => {
        expect(nextAbsence(new Map([['bo', 1000]]), 1000 + absentAfter)).toBeUndefined()
        expect(nextAbsence(new Map(), 0)).toBeUndefined()
    })
})
