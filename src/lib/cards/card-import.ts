// Importing cards from CSV (#48): reads a file in the import columns (`./card-csv`, shared
// with the export) into one preview row per CSV row, each either a draft card ready to create
// or the reasons it can't be. Pure, so the preview and the confirm re-check run the same rules.
//
// Values are read the way the export writes them: date parts are the stored signed numbers
// (BC negative, a decade by its earliest year), `category` is the English category name
// (matched ignoring case and surrounding spaces), sv/nb are plain text, tags are split on ";".
// A year without a decade gets its decade filled in, like the editor does.

import { englishNameKey } from '../categories/category-form'
import { cardImportColumns, parseCsvRecords, parseTags, type CardImportColumn } from './card-csv'
import { cardTextMaxLength, isWebAddress, sourceQuoteMaxLength } from './card-form'
import { decadeOf, validateDateParts, type DateParts } from './date-parts'
import type { TranslationLocale } from './translation'

/** A category as the import matches it: by English name, refusing archived ones. */
export type ImportCategory = { id: string; name: string; archived: boolean }

/** A draft card to create: English text plus any sv/nb text (stored as reviewed). */
export type ImportedCard = {
    categoryId: string
    date: DateParts
    sourceUrl: string | null
    sourceQuote: string | null
    tags: string[]
    translations: { en: string } & Partial<Record<TranslationLocale, string>>
}

export type ImportError = { column: CardImportColumn; message: string }

/** One CSV row in the preview: the card it becomes, or null with its errors. */
export type ImportRow = {
    /** 1 for the first row under the header (blank lines are not counted). */
    row: number
    /** The English text as written, to recognise the row by. */
    text: string
    /** The category as written. */
    category: string
    errors: ImportError[]
    card: ImportedCard | null
}

export type ImportPlan = { ok: true; rows: ImportRow[] } | { ok: false; error: string }

/** The most rows one import takes, so a preview stays readable and a confirm one request. */
export const importRowLimit = 1000

/** The columns a file must have; the others may be left out (empty in every row). */
export const requiredImportColumns = ['text_en', 'category'] as const satisfies CardImportColumn[]

const dateParts = ['decade', 'year', 'month', 'day'] as const

/** A signed whole number from a field: null when empty, NaN when not a whole number. */
const signedNumber = (value: string) => {
    if (value === '') return null
    return /^[+-]?\d+$/.test(value) ? Number(value) : Number.NaN
}

const wholeNumberMessage: Record<keyof DateParts, string> = {
    decade: 'Decade must be a whole number, such as 1490 or -499 for the 490s BC.',
    year: 'Year must be a whole number, negative for BC.',
    month: 'Month must be 1 to 12.',
    day: 'Day must be a whole number.',
}

function readDate(record: Record<string, string>, errors: ImportError[]): DateParts {
    const date = Object.fromEntries(
        dateParts.map((part) => [part, signedNumber((record[part] ?? '').trim())]),
    ) as DateParts
    let readable = true
    for (const part of dateParts) {
        if (Number.isNaN(date[part])) {
            errors.push({ column: part, message: wholeNumberMessage[part] })
            readable = false
        }
    }
    if (!readable) return date
    if (date.decade === null && date.year !== null && date.year !== 0) {
        date.decade = decadeOf(date.year)
    }
    const dateErrors = validateDateParts(date)
    for (const part of dateParts) {
        const message = dateErrors[part]
        if (message) errors.push({ column: part, message })
    }
    return date
}

function readText(
    value: string,
    column: CardImportColumn,
    errors: ImportError[],
    missing?: string,
): string {
    if (!value && missing) errors.push({ column, message: missing })
    else if (value.length > cardTextMaxLength) {
        errors.push({ column, message: `Keep the card under ${cardTextMaxLength} characters.` })
    }
    return value
}

function readRow(
    record: Record<string, string>,
    row: number,
    categories: ReadonlyMap<string, ImportCategory>,
): ImportRow {
    const field = (column: CardImportColumn) => (record[column] ?? '').trim()
    const errors: ImportError[] = []

    const text = readText(field('text_en'), 'text_en', errors, 'The English text is missing.')
    const date = readDate(record, errors)

    const categoryName = field('category')
    const category = categories.get(englishNameKey(categoryName))
    if (!categoryName) errors.push({ column: 'category', message: 'The category is missing.' })
    else if (!category) {
        errors.push({ column: 'category', message: `There is no category "${categoryName}".` })
    } else if (category.archived) {
        errors.push({ column: 'category', message: `The category "${category.name}" is archived.` })
    }

    const sourceUrl = field('source_url')
    if (sourceUrl && !isWebAddress(sourceUrl)) {
        errors.push({
            column: 'source_url',
            message: 'Use a full web address, starting with https://.',
        })
    }
    const sourceQuote = field('source_quote')
    if (sourceQuote.length > sourceQuoteMaxLength) {
        errors.push({
            column: 'source_quote',
            message: `Keep the quote under ${sourceQuoteMaxLength} characters.`,
        })
    }

    const sv = readText(field('text_sv'), 'text_sv', errors)
    const nb = readText(field('text_nb'), 'text_nb', errors)

    const card: ImportedCard | null =
        errors.length > 0 || !category
            ? null
            : {
                  categoryId: category.id,
                  date,
                  sourceUrl: sourceUrl || null,
                  sourceQuote: sourceQuote || null,
                  tags: parseTags(record.tags ?? ''),
                  translations: { en: text, ...(sv && { sv }), ...(nb && { nb }) },
              }
    return { row, text, category: categoryName, errors, card }
}

/**
 * A CSV file as the import preview: every row with the card it becomes or its errors, keyed
 * against the categories by `englishNameKey` of their English name. A file that can't be read
 * as a whole (open quote, missing columns, no rows, too many rows) is one error instead.
 */
export function planCardImport(
    text: string,
    categories: ReadonlyMap<string, ImportCategory>,
): ImportPlan {
    let parsed: ReturnType<typeof parseCsvRecords>
    try {
        parsed = parseCsvRecords(text)
    } catch (error) {
        return { ok: false, error: (error as Error).message }
    }
    const { columns, records } = parsed

    const missing = requiredImportColumns.filter((column) => !columns.includes(column))
    if (missing.length > 0) {
        return {
            ok: false,
            error: `The file needs a header row with the columns ${missing.join(' and ')} (and any of ${cardImportColumns.join(', ')}).`,
        }
    }
    if (records.length === 0) return { ok: false, error: 'The file has no cards under its header.' }
    if (records.length > importRowLimit) {
        return {
            ok: false,
            error: `The file has ${records.length} rows; import at most ${importRowLimit} at a time.`,
        }
    }

    return {
        ok: true,
        rows: records.map((record, index) => readRow(record, index + 1, categories)),
    }
}

/** Column names as the preview shows them next to an error. */
export const importColumnLabel: Record<CardImportColumn, string> = {
    text_en: 'English text',
    decade: 'Decade',
    year: 'Year',
    month: 'Month',
    day: 'Day',
    category: 'Category',
    source_url: 'Source URL',
    source_quote: 'Source quote',
    text_sv: 'Swedish text',
    text_nb: 'Norwegian text',
    tags: 'Tags',
}
