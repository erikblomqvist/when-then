import { describe, expect, it } from 'vite-plus/test'
import {
    cardCsvHeader,
    cardCsvLine,
    cardExportColumns,
    cardImportColumns,
    csvLine,
    parseCsv,
    parseCsvRecords,
    parseTags,
} from './card-csv'
import type { ExportedCard } from './card-export'

const card = (overrides: Partial<ExportedCard> = {}): ExportedCard => ({
    id: '00000000-0000-4000-9000-000000000004',
    status: 'published',
    category: { id: '00000000-0000-4000-8000-000000000004', name: 'Places' },
    date: { decade: -49, year: -44, month: null, day: null },
    sourceUrl: 'https://example.com/sampleby',
    sourceQuote: 'the lighthouse was lit in 44 BC',
    tags: ['harbours', 'light'],
    difficulty: null,
    translations: {
        en: { text: 'A made-up port lights its lighthouse', note: null, status: 'reviewed' },
        sv: { text: 'En påhittad hamn tänder sitt fyrtorn', note: null, status: 'reviewed' },
    },
    verifiedAt: null,
    verifiedBy: null,
    createdAt: '2026-10-22T10:00:00Z',
    updatedAt: '2026-10-22T11:00:00Z',
    ...overrides,
})

describe('columns', () => {
    it('are the import columns plus status and id', () => {
        expect(cardImportColumns).toEqual([
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
        ])
        expect(cardExportColumns).toEqual([...cardImportColumns, 'status', 'id'])
        expect(cardCsvHeader()).toBe(
            'text_en,decade,year,month,day,category,source_url,source_quote,text_sv,text_nb,tags,status,id\r\n',
        )
    })
})

describe('csvLine', () => {
    it('leaves plain fields bare and ends with CRLF', () => {
        expect(csvLine(['a', '1', ''])).toBe('a,1,\r\n')
    })

    it('quotes fields with commas, quotes or line breaks, doubling quotes', () => {
        expect(csvLine(['a, b', 'say "hi"', 'two\nlines', 'cr\r'])).toBe(
            '"a, b","say ""hi""","two\nlines","cr\r"\r\n',
        )
    })

    it('quotes fields with leading or trailing spaces so they survive spreadsheets', () => {
        expect(csvLine([' padded '])).toBe('" padded "\r\n')
    })
})

describe('cardCsvLine', () => {
    it('writes a card in export column order, BC years as negative numbers', () => {
        expect(cardCsvLine(card())).toBe(
            'A made-up port lights its lighthouse,-49,-44,,,Places,https://example.com/sampleby,' +
                'the lighthouse was lit in 44 BC,En påhittad hamn tänder sitt fyrtorn,,' +
                'harbours; light,published,00000000-0000-4000-9000-000000000004\r\n',
        )
    })

    it('quotes text with commas, quotes and newlines', () => {
        const line = cardCsvLine(
            card({
                translations: {
                    en: { text: 'Fire, "smoke"\nand ash', note: null, status: 'reviewed' },
                },
                tags: [],
                sourceUrl: null,
                sourceQuote: null,
            }),
        )
        expect(line).toBe(
            '"Fire, ""smoke""\nand ash",-49,-44,,,Places,,,,,,published,00000000-0000-4000-9000-000000000004\r\n',
        )
    })
})

describe('parseCsv', () => {
    it('reads what csvLine writes, quotes, commas and newlines included', () => {
        const rows = [
            ['text_en', 'year'],
            ['Fire, "smoke"\nand ash', '-44'],
            ['', ' padded '],
        ]
        expect(parseCsv(rows.map(csvLine).join(''))).toEqual(rows)
    })

    it('accepts LF line ends, a byte order mark and no final line break', () => {
        expect(parseCsv('﻿a,b\nc,"d\r\ne"')).toEqual([
            ['a', 'b'],
            ['c', 'd\r\ne'],
        ])
    })

    it('skips blank lines', () => {
        expect(parseCsv('a,b\r\n\r\nc,d\r\n\r\n')).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ])
    })

    it('rejects a quote left open', () => {
        expect(() => parseCsv('a,"b\nc')).toThrow(/quote/i)
    })
})

describe('parseCsvRecords', () => {
    it('keys each row by the header, trimmed, ignoring case', () => {
        expect(parseCsvRecords(' Text_EN ,year\r\nA card,-44\r\nShort row\r\n')).toEqual({
            columns: ['text_en', 'year'],
            records: [
                { text_en: 'A card', year: '-44' },
                { text_en: 'Short row', year: '' },
            ],
        })
    })

    it('round-trips an exported card', () => {
        const { records } = parseCsvRecords(cardCsvHeader() + cardCsvLine(card()))
        expect(records).toEqual([
            {
                text_en: 'A made-up port lights its lighthouse',
                decade: '-49',
                year: '-44',
                month: '',
                day: '',
                category: 'Places',
                source_url: 'https://example.com/sampleby',
                source_quote: 'the lighthouse was lit in 44 BC',
                text_sv: 'En påhittad hamn tänder sitt fyrtorn',
                text_nb: '',
                tags: 'harbours; light',
                status: 'published',
                id: '00000000-0000-4000-9000-000000000004',
            },
        ])
        expect(parseTags(records[0]!.tags!)).toEqual(['harbours', 'light'])
    })
})

describe('parseTags', () => {
    it('splits on semicolons, trims and drops empties', () => {
        expect(parseTags(' a ;b;; c ')).toEqual(['a', 'b', 'c'])
        expect(parseTags('')).toEqual([])
    })
})
