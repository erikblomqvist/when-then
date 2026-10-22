// Cards as CSV: the one place that knows the columns and the CSV dialect, for export (#47)
// and import (#48). RFC 4180: comma separated, CRLF line ends, fields quoted when they hold a
// comma, quote or line break (quotes doubled). Pure, so it runs anywhere and tests in Node.
//
// Values as written: date parts are the stored signed numbers (BC negative, a decade by its
// earliest year: 490s BC → -499, see ADR 0001), so an exported row imports to the same date.
// `category` is the English category name. `tags` are joined with "; ".

import type { ExportedCard } from './card-export'

/** The columns an import reads, in order. */
export const cardImportColumns = [
    'text_en',
    'decade',
    'year',
    'month',
    'day',
    'category',
    'source_url',
    'source_quote',
    'text_sv',
    'text_nb',
    'tags',
] as const

/** The columns an export writes: the import columns, then status and id. */
export const cardExportColumns = [...cardImportColumns, 'status', 'id'] as const

export type CardImportColumn = (typeof cardImportColumns)[number]
export type CardExportColumn = (typeof cardExportColumns)[number]

const tagSeparator = ';'

/** Tags as one CSV field. */
export const formatTags = (tags: readonly string[]) => tags.join(`${tagSeparator} `)

/** Tags from a CSV field: split on semicolons, trimmed, empties dropped. */
export const parseTags = (field: string) =>
    field
        .split(tagSeparator)
        .map((tag) => tag.trim())
        .filter((tag) => tag !== '')

const needsQuotes = /[",\r\n]|^\s|\s$/

const csvField = (value: string) =>
    needsQuotes.test(value) ? `"${value.replaceAll('"', '""')}"` : value

/** One CSV line, CRLF included. */
export const csvLine = (fields: readonly string[]) => `${fields.map(csvField).join(',')}\r\n`

/** The export's header line. */
export const cardCsvHeader = () => csvLine(cardExportColumns)

const number = (value: number | null) => (value === null ? '' : String(value))

/** A card as CSV fields, by column. */
export function cardCsvRecord(card: ExportedCard): Record<CardExportColumn, string> {
    return {
        text_en: card.translations.en?.text ?? '',
        decade: number(card.date.decade),
        year: number(card.date.year),
        month: number(card.date.month),
        day: number(card.date.day),
        category: card.category.name,
        source_url: card.sourceUrl ?? '',
        source_quote: card.sourceQuote ?? '',
        text_sv: card.translations.sv?.text ?? '',
        text_nb: card.translations.nb?.text ?? '',
        tags: formatTags(card.tags),
        status: card.status,
        id: card.id,
    }
}

/** A card as one CSV line in export column order. */
export function cardCsvLine(card: ExportedCard): string {
    const record = cardCsvRecord(card)
    return csvLine(cardExportColumns.map((column) => record[column]))
}

/**
 * Every row of a CSV text as its fields. Accepts CRLF or LF, a leading byte order mark (Excel
 * writes one) and a missing final line break; skips blank lines. Throws on a quote left open.
 */
export function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let field = ''
    let quoted = false
    let i = text.startsWith('﻿') ? 1 : 0

    const endRow = () => {
        row.push(field)
        if (row.length > 1 || row[0] !== '') rows.push(row)
        row = []
        field = ''
    }

    while (i < text.length) {
        const char = text[i]!
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"'
                i += 2
                continue
            }
            if (char === '"') quoted = false
            else field += char
            i += 1
            continue
        }
        if (char === '"' && field === '') quoted = true
        else if (char === ',') {
            row.push(field)
            field = ''
        } else if (char === '\n') endRow()
        else if (char === '\r' && text[i + 1] === '\n') {
            endRow()
            i += 1
        } else field += char
        i += 1
    }
    if (quoted) throw new Error('The CSV has a quote that is never closed.')
    if (field !== '' || row.length > 0) endRow()
    return rows
}

/**
 * A CSV text as records keyed by its header (trimmed, lower-cased). Rows shorter than the
 * header get empty strings; extra fields are dropped. For import: check `columns` for the
 * ones you need, then read each record.
 */
export function parseCsvRecords(text: string): {
    columns: string[]
    records: Record<string, string>[]
} {
    const [header = [], ...rows] = parseCsv(text)
    const columns = header.map((column) => column.trim().toLowerCase())
    const records = rows.map((fields) =>
        Object.fromEntries(columns.map((column, index) => [column, fields[index] ?? ''])),
    )
    return { columns, records }
}
