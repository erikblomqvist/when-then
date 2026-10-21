// A card's date as the parts that are known (ADR 0001): nullable decade, year, month and day.
// Years are signed: BC is negative and there is no year 0. A decade is stored by its earliest
// year: 1490s → 1490, 490s BC → −499, "0s" (AD 1–9) → 1, "0s BC" (9–1 BC) → −9.
//
// Shared by the browser (the editor fills the decade from the year) and the server (form
// parsing). The database checks the same rules (`public.card_date_parts_valid`).

export type DateParts = {
    decade: number | null
    year: number | null
    month: number | null
    day: number | null
}

export type DatePartErrors = Partial<Record<keyof DateParts, string>>

export const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
]

/** The decade a year belongs to, stored by its earliest year. */
export function decadeOf(year: number): number {
    if (year > 0) return year < 10 ? 1 : year - (year % 10)
    const bc = -year
    return -(bc - (bc % 10) + 9)
}

/** Whether `decade` is a decade stored by its earliest year (1490, 1, −9, −499). */
export function isDecade(decade: number): boolean {
    if (!Number.isInteger(decade) || decade === 0) return false
    return decade > 0 ? decade === 1 || decade % 10 === 0 : (decade - 1) % 10 === 0
}

/** The decade as people say it, without the era: 1490 → 1490, −499 → 490, 1 and −9 → 0. */
export function decadeLabel(decade: number): number {
    if (decade === 1 || decade === -9) return 0
    return decade > 0 ? decade : -decade - 9
}

/** The stored decade for a label and era: (490, BC) → −499, (0, AD) → 1. Null if not a decade. */
export function decadeFromLabel(label: number, bc: boolean): number | null {
    if (!Number.isInteger(label) || label < 0 || label % 10 !== 0) return null
    if (label === 0) return bc ? -9 : 1
    return bc ? -(label + 9) : label
}

/** Days in a month of a (signed, no year 0) year on the proleptic Gregorian calendar. */
function daysInMonth(year: number, month: number): number {
    const astronomical = year < 0 ? year + 1 : year
    // Day 0 of the next month is the last day of this one; setUTCFullYear handles years < 100.
    const date = new Date(0)
    date.setUTCFullYear(astronomical, month, 0)
    return date.getUTCDate()
}

/**
 * Checks the date-part rules: a day needs a month, a month needs a year, there is no year 0,
 * the decade is stored by its earliest year and contains the year, and the month and day are
 * on the calendar. Returns an error per part; an empty object means valid. No date at all is
 * valid on a draft (publishing has its own rules).
 */
export function validateDateParts({ decade, year, month, day }: DateParts): DatePartErrors {
    const errors: DatePartErrors = {}

    if (year === 0) errors.year = 'There is no year 0: 1 BC is followed by AD 1.'
    else if (year !== null && !Number.isInteger(year)) errors.year = 'Year must be a whole number.'

    if (decade !== null && !isDecade(decade)) errors.decade = 'Not a decade.'
    else if (year !== null && !errors.year && decade !== decadeOf(year)) {
        errors.decade = `The decade must contain the year (${formatCardDate({
            decade: decadeOf(year),
            year: null,
            month: null,
            day: null,
        })}).`
    }

    if (month !== null) {
        if (year === null) errors.month = 'A month needs a year.'
        else if (!Number.isInteger(month) || month < 1 || month > 12) {
            errors.month = 'Month must be 1 to 12.'
        }
    }

    if (day !== null) {
        if (month === null) errors.day = 'A day needs a month.'
        else if (year !== null && !errors.year && !errors.month) {
            const days = daysInMonth(year, month)
            if (!Number.isInteger(day) || day < 1 || day > days) {
                errors.day = `${monthNames[month - 1]} ${formatYear(year)} has ${days} days.`
            }
        }
    }

    return errors
}

const formatYear = (year: number) => (year < 0 ? `${-year} BC` : `${year}`)

/** The date at its known precision: "20 July 1969", "July 1969", "1492", "490s BC", "No date". */
export function formatCardDate({ decade, year, month, day }: DateParts): string {
    if (year !== null) {
        const monthYear = month !== null ? `${monthNames[month - 1]} ${formatYear(year)}` : null
        if (monthYear && day !== null) return `${day} ${monthYear}`
        return monthYear ?? formatYear(year)
    }
    if (decade !== null) return `${decadeLabel(decade)}s${decade < 0 ? ' BC' : ''}`
    return 'No date'
}
