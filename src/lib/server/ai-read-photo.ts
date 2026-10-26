// "Add from photo" (#60): Claude reads a photo (a game card, notes, a book page, a museum sign,
// a screenshot) into candidate cards (`#lib/cards/photo-import.ts`). One `runModel` request,
// so one audit row (action `ai_read_photo`) with the summed cost:
//
// 1. The photo, the existing categories and the curated looks go in; structured output gives
//    up to 15 candidates, each written in the photo's language and translated into the other
//    card languages, with a date (said whether the photo prints it), a difficulty, whether it is
//    country-specific, and either an existing category or a suggested new one.
// 2. When existing cards sit near a candidate's year, a second, text-only call says which
//    candidates repeat one of them. Only those nearby cards are sent, so the request stays
//    small however many cards there are.
//
// Nothing is saved: the admin ticks and edits the candidates and saves them as drafts. The
// photo itself is not stored; the passage the AI read goes into each card's source quote.

import type {
    BetaMessageParam,
    BetaContentBlockParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { cardLocales, type CardLocale } from '../cards/card'
import { cardTextMaxLength, sourceQuoteMaxLength } from '../cards/card-form'
import {
    isDifficulty,
    normaliseDate,
    photoCandidateLimit,
    suggestedCategory,
    type PhotoCandidate,
} from '../cards/photo-import'
import { isCountryCode } from '../cards/country'
import { quotationMarksRule, withQuotationMarks } from '../cards/quotation-marks'
import { categoryColours, categoryIcons } from '../categories/look'
import { englishNameKey } from '../categories/category-form'
import { AiAnswerRejectedError, replyText, runModel, type AiDeps, type AiRequest } from './ai'

/** An existing card near a candidate's date, for the duplicate check. */
export type NearbyCard = { id: string; text: string; year: number | null; decade: number | null }

export type ReadPhotoDeps = AiDeps & {
    /** Existing cards whose year (or decade) is near any of these years. */
    findNearbyCards: (years: number[]) => Promise<NearbyCard[]>
}

export type PhotoImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
export const photoImageTypes: PhotoImageType[] = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]

export type ReadPhoto = {
    actorId: string
    /** Names the request in the audit log (no card exists yet). */
    requestKey: string
    image: { mediaType: PhotoImageType; base64: string }
    /** Active categories a candidate may go in: id and English name. */
    categories: { id: string; name: string }[]
    /** Colours the categories already use, so a new one can stand apart. */
    usedColours: string[]
}

export type PhotoReading = { candidates: PhotoCandidate[]; requestId: number | null }

const languages: Record<CardLocale, string> = {
    en: 'English',
    sv: 'Swedish',
    nb: 'Norwegian (Bokmål)',
}

const system = `You turn photos into cards for "When Then?", a party game where players place historical events on a timeline. Each card is one short statement, read aloud, in the present tense ("Albert Einstein is born", "The Vasa sinks on its maiden voyage"), at most 120 characters.

The photo may be anything: a card from another timeline game (statement on one side, year on the other), handwritten or printed notes, a book page, a museum sign, a screenshot. Work out what it holds and find every distinct historical fact that would make a good card (at most ${photoCandidateLimit}, the most interesting first). A card names one event or milestone that can be dated.

For each card:
- source_language: the language the photo is written in (en, sv, nb, or other).
- texts: write the statement fresh in the game's style (not a copied sentence) in the photo's language, then translate it into the others, so en, sv and nb are all filled. Use the names established in each language. Never put the date or year in the text. ${quotationMarksRule}
- source_quote: the passage in the photo the card is based on, as written, at most 300 characters.
- date: the event's date as precisely as it is reliably known: year (BCE negative, no year 0); month and day too whenever the event happened on a known day (a launch, a sinking, a birth, a treaty signed), from the photo or from what you reliably know, so fill them in rather than stopping at the year; leave them null for something that took longer than a day or whose day isn't recorded. decade (its earliest year, e.g. 1490) only when the year isn't known. date_from_photo says whether the photo itself states the date; if not, give the date from your own knowledge only when you are confident, and otherwise leave every part null.
- difficulty: 1 (most people know it) to 4 (obscure).
- country_specific: the ISO 3166-1 alpha-2 code (e.g. SE, NO) of a country when the card takes knowledge so local that you almost had to grow up there to know it: a domestic TV show, a local politician, a national reform others never heard of. Not just because it happens in that country: Sweden's first Nobel Prizes or the Vasa sinking are known well beyond Sweden. Otherwise an empty string. Most cards are not country-specific.
- category: the English name of the existing category it fits best, exactly as listed. If it fits none of them, leave category empty and suggest new_category: names in en, sv and nb, an icon and a colour from the lists (prefer a colour not in use). Otherwise new_category is null.

If the photo holds no historical fact that could be a card, or can't be read, return no cards and say why in message (one sentence, in English).`

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] })
const localeTexts = {
    type: 'object',
    properties: Object.fromEntries(cardLocales.map((locale) => [locale, { type: 'string' }])),
    required: [...cardLocales],
    additionalProperties: false,
}

const readSchema = {
    type: 'object',
    properties: {
        message: { type: 'string' },
        cards: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    source_language: { type: 'string', enum: [...cardLocales, 'other'] },
                    texts: localeTexts,
                    source_quote: { type: 'string' },
                    date: {
                        type: 'object',
                        properties: {
                            decade: nullable({ type: 'integer' }),
                            year: nullable({ type: 'integer' }),
                            month: nullable({ type: 'integer' }),
                            day: nullable({ type: 'integer' }),
                        },
                        required: ['decade', 'year', 'month', 'day'],
                        additionalProperties: false,
                    },
                    date_from_photo: { type: 'boolean' },
                    difficulty: { type: 'integer' },
                    country_specific: { type: 'string' },
                    category: { type: 'string' },
                    new_category: nullable({
                        type: 'object',
                        properties: {
                            names: localeTexts,
                            icon: { type: 'string', enum: [...categoryIcons] },
                            colour: { type: 'string', enum: [...categoryColours] },
                        },
                        required: ['names', 'icon', 'colour'],
                        additionalProperties: false,
                    }),
                },
                required: [
                    'source_language',
                    'texts',
                    'source_quote',
                    'date',
                    'date_from_photo',
                    'difficulty',
                    'country_specific',
                    'category',
                    'new_category',
                ],
                additionalProperties: false,
            },
        },
    },
    required: ['message', 'cards'],
    additionalProperties: false,
}

const duplicateSystem = `You check new cards for "When Then?", a timeline party game, against cards that already exist. A new card repeats an existing one when both name the same event or milestone, however differently worded. A related but different event (another milestone of the same thing, another country) is not a repeat.

The user message is JSON: the new cards by index and the existing cards by id, each with its English text and year. Answer with one entry per new card: the id of the existing card it repeats, or an empty string.`

const duplicateSchema = {
    type: 'object',
    properties: {
        duplicates: {
            type: 'array',
            items: {
                type: 'object',
                properties: { index: { type: 'integer' }, card_id: { type: 'string' } },
                required: ['index', 'card_id'],
                additionalProperties: false,
            },
        },
    },
    required: ['duplicates'],
    additionalProperties: false,
}

type ReadCard = {
    source_language?: unknown
    texts?: Partial<Record<CardLocale, unknown>>
    source_quote?: unknown
    date?: Record<string, unknown>
    date_from_photo?: unknown
    difficulty?: unknown
    country_specific?: unknown
    category?: unknown
    new_category?: unknown
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const parse = (text: string): unknown => {
    try {
        return JSON.parse(text)
    } catch {
        throw new AiAnswerRejectedError('invalid_answer', 'The AI answer could not be read.')
    }
}

/** The AI's cards as candidates, matched against the categories by English name. */
export function candidatesFrom(
    cards: ReadCard[],
    categories: ReadPhoto['categories'],
): PhotoCandidate[] {
    const byName = new Map(categories.map((category) => [englishNameKey(category.name), category]))
    return cards.slice(0, photoCandidateLimit).flatMap((card, key): PhotoCandidate[] => {
        const texts = Object.fromEntries(
            cardLocales.map((locale) => [
                locale,
                withQuotationMarks(str(card.texts?.[locale]), locale).slice(0, cardTextMaxLength),
            ]),
        ) as Record<CardLocale, string>
        if (!texts.en) return []
        const language = str(card.source_language)
        const category = byName.get(englishNameKey(str(card.category)))
        return [
            {
                key,
                sourceLocale: cardLocales.find((locale) => locale === language) ?? null,
                texts,
                sourceQuote: str(card.source_quote).slice(0, sourceQuoteMaxLength),
                date: normaliseDate(card.date ?? {}),
                dateFromPhoto: card.date_from_photo === true,
                difficulty: isDifficulty(card.difficulty) ? card.difficulty : null,
                countrySpecific: countryCode(card.country_specific),
                categoryId: category?.id ?? null,
                newCategory: category ? null : suggestedCategory(card.new_category),
                duplicateOf: null,
            },
        ]
    })
}

/** The AI's country code, upper-cased, or null when it gave none (or not a code). */
const countryCode = (value: unknown) => {
    const code = str(value).toUpperCase()
    return isCountryCode(code) ? code : null
}

const yearOf = ({ date }: PhotoCandidate) => date.year ?? date.decade

/**
 * Reads the photo into candidate cards (as `actorId`, audited under `requestKey`) and marks
 * the ones that likely repeat an existing card. Throws the `runModel` errors, and
 * `AiAnswerRejectedError` (`no_cards`) with the AI's reason when the photo holds no card.
 */
export async function readCardsFromPhoto(
    deps: ReadPhotoDeps,
    input: ReadPhoto,
): Promise<PhotoReading> {
    const photoMessage: BetaMessageParam = {
        role: 'user',
        content: [
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: input.image.mediaType,
                    data: input.image.base64,
                },
            },
            {
                type: 'text',
                text: JSON.stringify({
                    categories: input.categories.map(({ name }) => name),
                    colours_in_use: input.usedColours,
                    languages,
                }),
            },
        ] satisfies BetaContentBlockParam[],
    }
    const readParams: AiRequest['params'] = {
        max_tokens: 16000,
        system,
        messages: [photoMessage],
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: readSchema } },
    }

    let candidates: PhotoCandidate[] = []
    let nearby = new Map<string, string>()

    const { value, auditId } = await runModel<PhotoCandidate[]>(
        deps,
        {
            actorId: input.actorId,
            action: 'ai_read_photo',
            entity: 'photo',
            entityId: input.requestKey,
            params: readParams,
        },
        async (reply, round) => {
            if (round === 1) {
                const answer = parse(replyText(reply)) as { message?: unknown; cards?: unknown }
                candidates = candidatesFrom(
                    Array.isArray(answer?.cards) ? (answer.cards as ReadCard[]) : [],
                    input.categories,
                )
                if (candidates.length === 0) {
                    throw new AiAnswerRejectedError(
                        'no_cards',
                        str(answer?.message) ||
                            'The AI found nothing in the photo to make a card of.',
                    )
                }
                const years = candidates.flatMap((candidate) => yearOf(candidate) ?? [])
                const existing = years.length > 0 ? await deps.findNearbyCards(years) : []
                if (existing.length === 0) {
                    return { done: candidates, details: { candidates: candidates.length } }
                }
                nearby = new Map(existing.map((card) => [card.id, card.text]))
                return {
                    next: {
                        max_tokens: 4000,
                        system: duplicateSystem,
                        messages: [
                            {
                                role: 'user',
                                content: JSON.stringify({
                                    new_cards: candidates.map((candidate, index) => ({
                                        index,
                                        text: candidate.texts.en,
                                        year: yearOf(candidate),
                                    })),
                                    existing_cards: existing.map(({ id, text, year, decade }) => ({
                                        id,
                                        text,
                                        year: year ?? decade,
                                    })),
                                }),
                            },
                        ],
                        output_config: {
                            effort: 'low',
                            format: { type: 'json_schema', schema: duplicateSchema },
                        },
                    },
                }
            }
            const answer = parse(replyText(reply)) as { duplicates?: unknown }
            const found = Array.isArray(answer?.duplicates) ? answer.duplicates : []
            for (const entry of found as { index?: unknown; card_id?: unknown }[]) {
                const candidate = typeof entry.index === 'number' ? candidates[entry.index] : null
                const id = str(entry.card_id)
                const text = nearby.get(id)
                if (candidate && text !== undefined) candidate.duplicateOf = { id, text }
            }
            return {
                done: candidates,
                details: {
                    candidates: candidates.length,
                    duplicates: candidates.filter((candidate) => candidate.duplicateOf).length,
                },
            }
        },
    )
    return { candidates: value, requestId: auditId }
}
