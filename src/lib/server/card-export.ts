// Exporting cards: read them from the database a batch at a time and encode them as they
// come, so an export of the whole deck never sits in memory at once. The endpoint
// (`/admin/cards/export`) pipes `encodeExport(exportedCards(…))` into its response.

import { cardCsvHeader, cardCsvLine } from '../cards/card-csv'
import type { CardLocale, Translation } from '../cards/card'
import type { ExportFormat, ExportSelection, ExportedCard } from '../cards/card-export'
import { matchingCards } from './cards'
import { namesByLocale } from './categories'
import type { Db } from './supabase'

const exportColumns = `id, status, category_id, decade, year, month, day, source_url,
    source_quote, tags, difficulty, verified_at, verified_by, created_at, updated_at,
    category:categories!inner(id, category_translations(locale, name)),
    card_translations(locale, text, note, status)`

// The Data API returns at most `max_rows` (supabase/config.toml) rows per request.
const defaultBatchSize = 1000
// Ids per `in (…)` filter, kept short enough for the request URL.
const idChunkSize = 200

type ExportRow = {
    id: string
    status: ExportedCard['status']
    decade: number | null
    year: number | null
    month: number | null
    day: number | null
    source_url: string | null
    source_quote: string | null
    tags: string[]
    difficulty: number | null
    verified_at: string | null
    verified_by: string | null
    created_at: string
    updated_at: string
    category: { id: string; category_translations: { locale: CardLocale; name: string }[] }
    card_translations: (Translation & { locale: CardLocale })[]
}

const toExportedCard = (row: ExportRow): ExportedCard => ({
    id: row.id,
    status: row.status,
    category: {
        id: row.category.id,
        name: namesByLocale(row.category.category_translations).en ?? '',
    },
    date: { decade: row.decade, year: row.year, month: row.month, day: row.day },
    sourceUrl: row.source_url,
    sourceQuote: row.source_quote,
    tags: row.tags,
    difficulty: row.difficulty,
    translations: Object.fromEntries(
        row.card_translations.map(({ locale, text, note, status }) => [
            locale,
            { text, note, status } satisfies Translation,
        ]),
    ),
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
})

const fail = (error: { message: string }): never => {
    throw new Error(error.message, { cause: error })
}

/**
 * The selected cards in id order, read `batchSize` at a time (keyset paging, so edits made
 * during a long export never repeat or skip a card).
 */
export async function* exportedCards(
    db: Db,
    selection: ExportSelection,
    { batchSize = defaultBatchSize } = {},
): AsyncGenerator<ExportedCard> {
    if ('ids' in selection) {
        const ids = [...selection.ids].sort()
        for (let start = 0; start < ids.length; start += idChunkSize) {
            const { data, error } = await db
                .from('cards')
                .select(exportColumns)
                .in('id', ids.slice(start, start + idChunkSize))
                .order('id')
            if (error) fail(error)
            for (const row of (data ?? []) as ExportRow[]) yield toExportedCard(row)
        }
        return
    }
    let after: string | null = null
    for (;;) {
        let query = matchingCards(db, selection.filter).select(exportColumns)
        if (after) query = query.gt('id', after)
        const { data, error } = await query.order('id').limit(batchSize)
        if (error) fail(error)
        const rows = (data ?? []) as ExportRow[]
        for (const row of rows) yield toExportedCard(row)
        if (rows.length < batchSize) return
        after = rows.at(-1)!.id
    }
}

/** The export's MIME type. */
export const exportContentType: Record<ExportFormat, string> = {
    csv: 'text/csv; charset=utf-8',
    json: 'application/json; charset=utf-8',
}

/**
 * Cards encoded as they arrive. CSV starts with a byte order mark so spreadsheets read å, ä
 * and ø as UTF-8; JSON is an array of full cards.
 */
export function encodeExport(
    cards: AsyncIterable<ExportedCard>,
    format: ExportFormat,
): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder()
    const iterator = cards[Symbol.asyncIterator]()
    let started = false
    let count = 0
    return new ReadableStream({
        async pull(controller) {
            if (!started) {
                started = true
                controller.enqueue(encoder.encode(format === 'csv' ? `﻿${cardCsvHeader()}` : '['))
            }
            const next = await iterator.next()
            if (next.done) {
                if (format === 'json') controller.enqueue(encoder.encode(count ? '\n]\n' : ']\n'))
                controller.close()
                return
            }
            const card = next.value
            const chunk =
                format === 'csv'
                    ? cardCsvLine(card)
                    : `${count ? ',' : ''}\n${JSON.stringify(card)}`
            count += 1
            controller.enqueue(encoder.encode(chunk))
        },
        async cancel() {
            await iterator.return?.()
        },
    })
}
