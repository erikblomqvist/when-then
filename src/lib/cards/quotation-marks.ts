// Quotation marks as each card language writes them: “…” in English, ”…” in Swedish and «…» in
// Norwegian. The AI prompts that write card text ask for them (`quotationMarksRule`), and its
// answers go through `withQuotationMarks`, which fixes the straight or foreign quotes it still
// sends.

import type { CardLocale } from './card'

export const quotationMarks: Record<CardLocale, readonly [open: string, close: string]> = {
    en: ['“', '”'],
    sv: ['”', '”'],
    nb: ['«', '»'],
}

/** The prompt line asking for each language's quotation marks. */
export const quotationMarksRule =
    'Quote titles and names as each language does: “…” in English, ”…” in Swedish, «…» in Norwegian. Never straight quotes.'

const quoted = /["“”„«»]([^"“”„«»\n]+)["“”„«»]/g

/** The text with each quoted passage in the locale's quotation marks. */
export function withQuotationMarks(text: string, locale: CardLocale): string {
    const [open, close] = quotationMarks[locale]
    return text.replace(quoted, (_, inner: string) => `${open}${inner}${close}`)
}
