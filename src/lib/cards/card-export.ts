// Exporting cards: what an export holds and how a request names it. Pure, so the list page
// builds export links with the same rules the endpoint (`/admin/cards/export`) reads them.
//
// A request names a format and which cards: explicit ids (the list's row selection), or a
// filter (the current view; no filter is every card). Ids win when both are given.

import type { CardLocale, CardStatus, Translation } from './card'
import { filterParams, parseFilter, type CardFilter } from './card-list'
import type { DateParts } from './date-parts'

/** A card as exported: everything about it, with all its translations. */
export type ExportedCard = {
    id: string
    status: CardStatus
    category: { id: string; name: string }
    date: DateParts
    sourceUrl: string | null
    sourceQuote: string | null
    tags: string[]
    difficulty: number | null
    translations: Partial<Record<CardLocale, Translation>>
    verifiedAt: string | null
    verifiedBy: string | null
    createdAt: string
    updatedAt: string
}

export type ExportFormat = 'csv' | 'json'
export const exportFormats: readonly ExportFormat[] = ['csv', 'json']
export const exportFormatLabel: Record<ExportFormat, string> = { csv: 'CSV', json: 'JSON' }

/** Which cards to export. */
export type ExportSelection = { ids: string[] } | { filter: CardFilter }

export type ExportRequest = { format: ExportFormat; selection: ExportSelection }

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/**
 * An export request from query or form fields: `format` (csv, the default, or json), then
 * either `id` (repeated) or the card list's filter keys (`q`, `status`, …). `scope=all`
 * ignores the filter, so one form can offer "all cards" next to "the matching cards".
 * Malformed ids are dropped; if none are left the request is for no cards.
 */
export function parseExportRequest(params: URLSearchParams): ExportRequest {
    const format = params.get('format') === 'json' ? 'json' : 'csv'
    const rawIds = params.getAll('id')
    if (rawIds.length > 0) {
        const ids = [...new Set(rawIds.filter((id) => uuid.test(id)).map((id) => id.toLowerCase()))]
        return { format, selection: { ids } }
    }
    const filter = params.get('scope') === 'all' ? {} : parseFilter(params)
    return { format, selection: { filter } }
}

/** The fields of an export request, as `parseExportRequest` reads them. */
export function exportParams({ format, selection }: ExportRequest): URLSearchParams {
    const params = new URLSearchParams({ format })
    if ('ids' in selection) {
        for (const id of selection.ids) params.append('id', id)
    } else {
        for (const [key, value] of filterParams(selection.filter)) params.append(key, value)
    }
    return params
}

/** The endpoint that downloads an export. Ids belong in a POST body (`exportParams`). */
export const exportPath = '/admin/cards/export'

/** A GET link that downloads cards matching `filter` (every card without one). */
export const exportHref = (format: ExportFormat, filter: CardFilter = {}) =>
    `${exportPath}?${exportParams({ format, selection: { filter } })}`

/** The download's file name: `when-then-cards-2026-10-22.csv`. */
export const exportFileName = (format: ExportFormat, now: Date) =>
    `when-then-cards-${now.toISOString().slice(0, 10)}.${format}`
