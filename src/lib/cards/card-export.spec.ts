import { describe, expect, it } from 'vite-plus/test'
import {
    exportFileName,
    exportHref,
    exportParams,
    parseExportRequest,
    type ExportRequest,
} from './card-export'

const idA = '00000000-0000-4000-9000-000000000001'
const idB = '00000000-0000-4000-9000-000000000002'
const params = (query: string) => new URLSearchParams(query)

describe('parseExportRequest', () => {
    it('reads no fields as every card as CSV', () => {
        expect(parseExportRequest(params(''))).toEqual({
            format: 'csv',
            selection: { filter: {} },
        })
    })

    it('reads the card list filter and the format', () => {
        expect(parseExportRequest(params('format=json&q=clock&status=published&page=2'))).toEqual({
            format: 'json',
            selection: { filter: { search: 'clock', status: 'published' } },
        })
    })

    it('ignores the filter for scope=all', () => {
        expect(parseExportRequest(params('scope=all&q=clock'))).toEqual({
            format: 'csv',
            selection: { filter: {} },
        })
    })

    it('reads selected ids, dropping duplicates and malformed ones, over any filter', () => {
        expect(
            parseExportRequest(
                params(`id=${idA}&id=${idB.toUpperCase()}&id=${idA}&id=nope&q=clock`),
            ),
        ).toEqual({ format: 'csv', selection: { ids: [idA, idB] } })
    })

    it('reads only malformed ids as no cards, not every card', () => {
        expect(parseExportRequest(params('id=nope'))).toEqual({
            format: 'csv',
            selection: { ids: [] },
        })
    })
})

describe('exportParams and exportHref', () => {
    it('write requests that read back the same', () => {
        const byIds: ExportRequest = { format: 'json', selection: { ids: [idA, idB] } }
        expect(parseExportRequest(exportParams(byIds))).toEqual(byIds)
        expect(exportHref('csv', { status: 'draft', era: 'from-1500' })).toBe(
            '/admin/cards/export?format=csv&status=draft&era=from-1500',
        )
        expect(exportHref('json')).toBe('/admin/cards/export?format=json')
    })
})

describe('exportFileName', () => {
    it('names the file by date and format', () => {
        expect(exportFileName('csv', new Date('2026-10-22T23:00:00Z'))).toBe(
            'when-then-cards-2026-10-22.csv',
        )
    })
})
