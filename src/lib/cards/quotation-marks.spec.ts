import { describe, expect, it } from 'vite-plus/test'
import { withQuotationMarks } from './quotation-marks'

describe('withQuotationMarks', () => {
    it('puts quoted passages in the language’s quotation marks', () => {
        expect(withQuotationMarks('"Star Wars" premieres', 'en')).toBe('“Star Wars” premieres')
        expect(withQuotationMarks('"Stjärnornas krig" har premiär', 'sv')).toBe(
            '”Stjärnornas krig” har premiär',
        )
        expect(withQuotationMarks('“Stjernekrigen” har premiere', 'nb')).toBe(
            '«Stjernekrigen» har premiere',
        )
        expect(withQuotationMarks('«Pippi» och "Emil" ges ut', 'sv')).toBe(
            '”Pippi” och ”Emil” ges ut',
        )
    })

    it('leaves text without a quoted passage alone, apostrophes and a lone quote too', () => {
        expect(withQuotationMarks('The Beatles’ first album', 'en')).toBe(
            'The Beatles’ first album',
        )
        expect(withQuotationMarks('A 12" record', 'en')).toBe('A 12" record')
        expect(withQuotationMarks('Already «right»', 'nb')).toBe('Already «right»')
    })
})
