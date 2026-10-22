import { describe, expect, it } from 'vite-plus/test'
import { decadeOf, formatCardDate, validateDateParts } from './date-parts'

const none = { decade: null, year: null, month: null, day: null }

describe('decadeOf', () => {
    it('stores a decade by its earliest year (ADR 0001)', () => {
        expect(decadeOf(1492)).toBe(1490)
        expect(decadeOf(1490)).toBe(1490)
        expect(decadeOf(1499)).toBe(1490)
        expect(decadeOf(2024)).toBe(2020)
    })

    it('puts years 1 to 9 in the "0s", stored as 1', () => {
        expect(decadeOf(1)).toBe(1)
        expect(decadeOf(9)).toBe(1)
        expect(decadeOf(10)).toBe(10)
    })

    it('stores BC decades by their earliest year', () => {
        expect(decadeOf(-490)).toBe(-499)
        expect(decadeOf(-499)).toBe(-499)
        expect(decadeOf(-44)).toBe(-49)
        expect(decadeOf(-1)).toBe(-9)
        expect(decadeOf(-9)).toBe(-9)
        expect(decadeOf(-10)).toBe(-19)
    })
})

describe('validateDateParts', () => {
    it('accepts no date at all on a draft', () => {
        expect(validateDateParts(none)).toEqual({})
    })

    it('accepts a decade alone', () => {
        expect(validateDateParts({ ...none, decade: 1490 })).toEqual({})
        expect(validateDateParts({ ...none, decade: -499 })).toEqual({})
        expect(validateDateParts({ ...none, decade: 1 })).toEqual({})
        expect(validateDateParts({ ...none, decade: -9 })).toEqual({})
    })

    it('accepts a full date', () => {
        expect(validateDateParts({ decade: 1960, year: 1969, month: 7, day: 20 })).toEqual({})
        expect(validateDateParts({ decade: -49, year: -44, month: 3, day: 15 })).toEqual({})
    })

    it('rejects a day without a month', () => {
        expect(validateDateParts({ decade: 1960, year: 1969, month: null, day: 20 })).toEqual({
            day: 'A day needs a month.',
        })
    })

    it('rejects a month without a year', () => {
        expect(validateDateParts({ decade: 1960, year: null, month: 7, day: null })).toEqual({
            month: 'A month needs a year.',
        })
    })

    it('rejects year 0, which does not exist', () => {
        expect(validateDateParts({ ...none, decade: 1, year: 0 })).toEqual({
            year: 'There is no year 0: 1 BC is followed by AD 1.',
        })
    })

    it('rejects a decade that is not stored by its earliest year', () => {
        expect(validateDateParts({ ...none, decade: 1495 })).toEqual({
            decade: 'Not a decade.',
        })
        expect(validateDateParts({ ...none, decade: 0 })).toEqual({ decade: 'Not a decade.' })
        expect(validateDateParts({ ...none, decade: -490 })).toEqual({ decade: 'Not a decade.' })
    })

    it('rejects a decade that disagrees with the year', () => {
        expect(validateDateParts({ ...none, decade: 1480, year: 1492 })).toEqual({
            decade: 'The decade must contain the year (1490s).',
        })
    })

    it('rejects a year without its decade', () => {
        expect(validateDateParts({ ...none, year: 1492 })).toEqual({
            decade: 'The decade must contain the year (1490s).',
        })
    })

    it('rejects months and days that are not on the calendar', () => {
        expect(validateDateParts({ decade: 1960, year: 1969, month: 13, day: null })).toEqual({
            month: 'Month must be 1 to 12.',
        })
        expect(validateDateParts({ decade: 1960, year: 1969, month: 2, day: 30 })).toEqual({
            day: 'February 1969 has 28 days.',
        })
        expect(validateDateParts({ decade: 2020, year: 2024, month: 2, day: 29 })).toEqual({})
    })
})

describe('formatCardDate', () => {
    it('shows the date at its known precision', () => {
        expect(formatCardDate(none)).toBe('No date')
        expect(formatCardDate({ ...none, decade: 1490 })).toBe('1490s')
        expect(formatCardDate({ ...none, decade: 1490, year: 1492 })).toBe('1492')
        expect(formatCardDate({ decade: 1960, year: 1969, month: 7, day: null })).toBe('July 1969')
        expect(formatCardDate({ decade: 1960, year: 1969, month: 7, day: 20 })).toBe('20 July 1969')
    })

    it('writes BC dates and the 0s the way people say them', () => {
        expect(formatCardDate({ ...none, decade: -499 })).toBe('490s BC')
        expect(formatCardDate({ ...none, decade: 1 })).toBe('0s')
        expect(formatCardDate({ ...none, decade: -9 })).toBe('0s BC')
        expect(formatCardDate({ decade: -49, year: -44, month: 3, day: 15 })).toBe('15 March 44 BC')
    })
})
