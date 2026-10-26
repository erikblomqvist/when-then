// Machine translation of a card's English text (#41): one Claude call per card for all the
// locales asked for, structured output with one string per locale. Only the card text, its
// category name and the target languages are sent. The date is never part of it.

import { cardTextMaxLength } from '../cards/card-form'
import { quotationMarksRule, withQuotationMarks } from '../cards/quotation-marks'
import type { TranslationLocale } from '../cards/translation'
import { AiCallError, callModel, replyText, type AiDeps } from './ai'

/** How the prompt names each target language (more precise than the UI's tab names). */
const languages: Record<TranslationLocale, string> = {
    sv: 'Swedish',
    nb: 'Norwegian (Bokmål)',
}

const system = `You translate cards for "When Then?", a party game where players place historical events on a timeline. Each card is one short statement, read aloud, in the present tense ("Albert Einstein is born", "The first Nobel Prizes are awarded").

The user message is JSON: the English card text, its category, and the target languages keyed by locale code. Translate the English text into each target language.

- Keep the same event, the same milestone and the same specificity. Don't add, drop or explain facts, and never add a date or a year.
- Keep the present tense and the short, natural phrasing a native speaker would read aloud.
- Use the names, spellings and conventions that are established in that language (for people, places, works and institutions). ${quotationMarksRule}
- Answer with the JSON object only: one string per locale code, the translated card text.`

export type TranslateCardText = {
    actorId: string
    cardId: string
    english: string
    category: string | null
    locales: TranslationLocale[]
}

/**
 * Translates the English card text into each locale (as `actorId`, audited against the card).
 * Returns the text per locale; throws the `callModel` errors (rate limit, refusal, failure),
 * and `AiCallError` when the answer lacks a usable text for a locale.
 */
export async function translateCardText(
    deps: AiDeps,
    { actorId, cardId, english, category, locales }: TranslateCardText,
): Promise<Record<TranslationLocale, string>> {
    const reply = await callModel(deps, {
        actorId,
        action: 'ai_translate',
        entity: 'card',
        entityId: cardId,
        locale: locales.length === 1 ? locales[0] : null,
        details: { locales },
        params: {
            max_tokens: 4000,
            system,
            messages: [
                {
                    role: 'user',
                    content: JSON.stringify({
                        english,
                        category,
                        locales: Object.fromEntries(
                            locales.map((locale) => [locale, languages[locale]]),
                        ),
                    }),
                },
            ],
            output_config: {
                effort: 'low',
                format: {
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        properties: Object.fromEntries(
                            locales.map((locale) => [locale, { type: 'string' }]),
                        ),
                        required: locales,
                        additionalProperties: false,
                    },
                },
            },
        },
    })

    let answer: unknown
    try {
        answer = JSON.parse(replyText(reply))
    } catch {
        throw new AiCallError('The AI answer was not the translation asked for.')
    }
    const texts = {} as Record<TranslationLocale, string>
    for (const locale of locales) {
        const text = (answer as Record<string, unknown> | null)?.[locale]
        if (typeof text !== 'string' || !text.trim()) {
            throw new AiCallError(`The AI answer had no ${languages[locale]} text.`)
        }
        texts[locale] = withQuotationMarks(text.trim(), locale).slice(0, cardTextMaxLength)
    }
    return texts
}
