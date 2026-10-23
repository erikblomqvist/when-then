// "Suggest date" (#42): Claude proposes a card's year with a source, grounded as
// docs/research/ai-card-authoring.md recommends.
//
// 1. Wikidata first: a conversation where Claude may only call `lookup_wikidata` (run here,
//    `./wikidata`) and submit. Ending without a submission means Wikidata had nothing usable.
// 2. Web search second: a fresh conversation with the web search server tool and the same
//    submit tool, told what Wikidata said. `pause_turn` is continued.
//
// The answer comes through the strict custom tool `submit_year_suggestion` (structured output
// can't be combined with web search citations), and is rejected unless its `source_url` was
// actually retrieved in this request: a Wikidata/Wikipedia URL from our lookup, or a web search
// result or citation. The whole request is one `runModel` run: one audit row (action
// `ai_suggest_date`) with the summed cost, the sources and the outcome. The card text and its
// category name are all that is sent. Nothing is saved: the editor decides.

import type {
    BetaContentBlockParam,
    BetaMessage,
    BetaMessageParam,
    BetaToolUnion,
    BetaToolUseBlock,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { sourceQuoteMaxLength } from '../cards/card-form'
import { decadeOf, validateDateParts } from '../cards/date-parts'
import { AiAnswerRejectedError, replyText, runModel, type AiDeps, type AiRequest } from './ai'
import type { WikidataLookup } from './wikidata'

export type SuggestDateDeps = AiDeps & {
    lookupWikidata: (subject: string) => Promise<WikidataLookup>
}

export type DateConfidence = 'high' | 'medium' | 'low'

export type DateAlternative = {
    year: number
    reason: string
    /** Null unless a retrieved source supports this year. */
    sourceUrl: string | null
    sourceQuote: string | null
}

export type DateSuggestion = {
    /** Signed: BCE negative, no year 0. */
    year: number
    /** When the source states them; a day only with a month. */
    month: number | null
    day: number | null
    sourceUrl: string
    sourceQuote: string
    interpretation: string
    confidence: DateConfidence
    alternatives: DateAlternative[]
    via: 'wikidata' | 'web_search'
}

export type SuggestCardDate = {
    actorId: string
    /** What the request is audited against: the card, or the photo reading a candidate came from. */
    entity: 'card' | 'photo'
    entityId: string
    english: string
    category: string | null
}

// ---------------------------------------------------------------------------------------
// Source validation

const normalUrl = (url: string): string | null => {
    let parsed: URL
    try {
        parsed = new URL(url.trim())
    } catch {
        return null
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    parsed.hash = ''
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1)
    }
    return parsed.href
}

/** Whether `url` is one of the `retrieved` pages (ignoring a fragment, trailing slash, host case). */
export function isRetrieved(url: string, retrieved: string[]): boolean {
    const wanted = normalUrl(url)
    return wanted !== null && retrieved.some((one) => normalUrl(one) === wanted)
}

/** The pages a reply retrieved: web search results and the URLs its text cites. */
export function sourcesIn(reply: BetaMessage): string[] {
    const urls: string[] = []
    for (const block of reply.content) {
        if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
            urls.push(...block.content.map((result) => result.url))
        }
        if (block.type === 'text') {
            for (const citation of block.citations ?? []) {
                if (citation.type === 'web_search_result_location') urls.push(citation.url)
            }
        }
    }
    return urls
}

// ---------------------------------------------------------------------------------------
// The request

const submitTool: BetaToolUnion = {
    name: 'submit_year_suggestion',
    description:
        'Submit the year for the card, with the retrieved source that states it. Call once, at the end.',
    strict: true,
    input_schema: {
        type: 'object',
        properties: {
            year: {
                type: 'integer',
                description: 'The year. BCE years are negative (44 BC is -44); there is no year 0.',
            },
            month: {
                anyOf: [{ type: 'integer' }, { type: 'null' }],
                description: 'The month (1 to 12) when the source states it, otherwise null.',
            },
            day: {
                anyOf: [{ type: 'integer' }, { type: 'null' }],
                description: 'The day of the month when the source states it, otherwise null.',
            },
            source_url: {
                type: 'string',
                description: 'A URL you retrieved in this conversation that states the year.',
            },
            source_quote: {
                type: 'string',
                description:
                    'The passage from that source giving the year, at most 150 characters.',
            },
            interpretation: {
                type: 'string',
                description:
                    'How you read the statement, in one sentence (which event or milestone, which country).',
            },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            alternatives: {
                type: 'array',
                description: 'Other years a reasonable reader could mean, each with why.',
                items: {
                    type: 'object',
                    properties: {
                        year: { type: 'integer' },
                        reason: { type: 'string' },
                        source_url: {
                            type: 'string',
                            description: 'A retrieved URL supporting this year, or empty.',
                        },
                        source_quote: { type: 'string', description: 'Its passage, or empty.' },
                    },
                    required: ['year', 'reason', 'source_url', 'source_quote'],
                    additionalProperties: false,
                },
            },
        },
        required: [
            'year',
            'month',
            'day',
            'source_url',
            'source_quote',
            'interpretation',
            'confidence',
            'alternatives',
        ],
        additionalProperties: false,
    },
}

const lookupTool: BetaToolUnion = {
    name: 'lookup_wikidata',
    description:
        'Search Wikidata for items named `subject` (English) and get their dated statements (birth, death, inception, publication, start, point in time, opening…) with their Wikidata and Wikipedia URLs. A statement without a year has only decade or century precision.',
    strict: true,
    input_schema: {
        type: 'object',
        properties: {
            subject: {
                type: 'string',
                description:
                    'The name of the person, thing, place or event, as Wikipedia titles it.',
            },
        },
        required: ['subject'],
        additionalProperties: false,
    },
}

const webSearchTool: BetaToolUnion = {
    type: 'web_search_20260209',
    name: 'web_search',
    max_uses: 3,
}

const system = `You find the year for cards in "When Then?", a party game where players place historical events on a timeline. Each card is one short statement in the present tense. A player who knows the exact year is rewarded, so the year must be right and backed by a source.

- Take the statement literally: "for the first time" means the first occurrence, not the best-known one. Decide which milestone it names (born, founded, invented, patented, announced, released, opened…).
- If a reasonable reader could mean another year, give the most literal reading as the year and the others as alternatives with a short reason. If the answer depends on the country, say so in the interpretation.
- Only suggest a year that a source you retrieved in this conversation states, at year precision or better. Never answer from memory alone.
- Give the exact date when that source states it: the month, and the day too when it is known. Leave month and day null when the source gives only the year.
- Submit with submit_year_suggestion: source_url must be a URL you got from a tool in this conversation, and source_quote the passage (at most 150 characters) that gives the year. Leave an alternative's source_url and source_quote empty unless a retrieved source supports it.`

const wikidataSteps = `First look the subject up on Wikidata with lookup_wikidata (you may try a few names). If a statement dates the card at year precision or better, submit it (with its month and day when the statement has them), citing that item's Wikipedia URL (or its Wikidata URL when it has none) and the statement as the quote. If Wikidata has nothing that dates this statement at year precision, don't submit: answer with one sentence saying what Wikidata had. A web search follows in that case.`

const webSteps = `Wikidata had nothing usable (see "wikidata" in the card). Search the web with web_search, prefer encyclopedias and official sources, then submit. If no source you retrieved gives the year, don't submit: answer with one sentence saying why.`

const cardMessage = (input: SuggestCardDate, wikidata?: string): BetaMessageParam => ({
    role: 'user',
    content: JSON.stringify({
        card: input.english,
        category: input.category,
        ...(wikidata ? { wikidata } : {}),
    }),
})

const params = (
    tools: BetaToolUnion[],
    steps: string,
    messages: BetaMessageParam[],
): AiRequest['params'] => ({
    max_tokens: 8000,
    system: `${system}\n\n${steps}`,
    tools,
    tool_choice: { type: 'auto' },
    output_config: { effort: 'medium' },
    messages,
})

const toolUses = (reply: BetaMessage, name: string) =>
    reply.content.filter(
        (block): block is BetaToolUseBlock => block.type === 'tool_use' && block.name === name,
    )

const asParams = (reply: BetaMessage) => reply.content as unknown as BetaContentBlockParam[]

type Submitted = {
    year?: unknown
    month?: unknown
    day?: unknown
    source_url?: unknown
    source_quote?: unknown
    interpretation?: unknown
    confidence?: unknown
    alternatives?: unknown
}
type SubmittedAlternative = {
    year?: unknown
    reason?: unknown
    source_url?: unknown
    source_quote?: unknown
}

const isYear = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value !== 0
const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const whole = (value: unknown) =>
    typeof value === 'number' && Number.isInteger(value) ? value : null

/** The month and day that hold together with the year: a bad day is dropped, a bad month both. */
export function monthAndDay(
    year: number,
    month: unknown,
    day: unknown,
): { month: number | null; day: number | null } {
    const date = { decade: decadeOf(year), year, month: whole(month), day: whole(day) }
    if (date.month === null) return { month: null, day: null }
    const errors = validateDateParts(date)
    if (errors.month) return { month: null, day: null }
    return { month: date.month, day: errors.day ? null : date.day }
}

const quote = (value: unknown) => str(value).slice(0, sourceQuoteMaxLength)

function checkSubmission(
    input: Submitted,
    retrieved: string[],
    via: DateSuggestion['via'],
): DateSuggestion {
    const sourceUrl = str(input.source_url)
    if (!isYear(input.year)) {
        throw new AiAnswerRejectedError('invalid_answer', 'The AI answer had no usable year.', {
            year: input.year ?? null,
        })
    }
    if (!isRetrieved(sourceUrl, retrieved)) {
        throw new AiAnswerRejectedError(
            'unsourced',
            'The AI cited a source it did not retrieve, so its suggestion was rejected. Try again, or look the date up yourself.',
            { year: input.year, source_url: sourceUrl, sources: retrieved },
        )
    }
    const alternatives = (Array.isArray(input.alternatives) ? input.alternatives : []).flatMap(
        (alternative: SubmittedAlternative): DateAlternative[] => {
            if (!isYear(alternative.year)) return []
            const url = str(alternative.source_url)
            const sourced = url !== '' && isRetrieved(url, retrieved)
            return [
                {
                    year: alternative.year,
                    reason: str(alternative.reason),
                    sourceUrl: sourced ? url : null,
                    sourceQuote: sourced ? quote(alternative.source_quote) || null : null,
                },
            ]
        },
    )
    const confidence = ['high', 'medium', 'low'].includes(str(input.confidence))
        ? (str(input.confidence) as DateConfidence)
        : 'low'
    return {
        year: input.year,
        ...monthAndDay(input.year, input.month, input.day),
        sourceUrl,
        sourceQuote: quote(input.source_quote),
        interpretation: str(input.interpretation),
        confidence,
        alternatives,
        via,
    }
}

/**
 * Suggests a year for the card's English statement (as `actorId`, audited against the card or
 * the photo reading).
 * Returns the suggestion and the id of its audit row (`requestId`, for the accept/reject
 * entry). Throws the `runModel` errors, and `AiAnswerRejectedError` when the source wasn't
 * retrieved (`unsourced`), the answer is unusable, or no source gives a year (`no_suggestion`).
 */
export async function suggestCardDate(
    deps: SuggestDateDeps,
    input: SuggestCardDate,
): Promise<{ suggestion: DateSuggestion; requestId: number | null }> {
    const retrieved: string[] = []
    let phase: DateSuggestion['via'] = 'wikidata'
    let messages: BetaMessageParam[] = [cardMessage(input)]

    const { value, auditId } = await runModel<DateSuggestion>(
        deps,
        {
            actorId: input.actorId,
            action: 'ai_suggest_date',
            entity: input.entity,
            entityId: input.entityId,
            params: params([lookupTool, submitTool], wikidataSteps, messages),
        },
        async (reply) => {
            retrieved.push(...sourcesIn(reply))
            const sources = [...new Set(retrieved)]

            const [submitted] = toolUses(reply, 'submit_year_suggestion')
            if (submitted) {
                const suggestion = checkSubmission(submitted.input as Submitted, sources, phase)
                return {
                    done: suggestion,
                    details: {
                        via: phase,
                        year: suggestion.year,
                        month: suggestion.month,
                        day: suggestion.day,
                        confidence: suggestion.confidence,
                        source_url: suggestion.sourceUrl,
                        sources,
                    },
                }
            }

            if (phase === 'wikidata') {
                const lookups = toolUses(reply, 'lookup_wikidata')
                if (lookups.length > 0 && reply.stop_reason === 'tool_use') {
                    const results = await Promise.all(
                        lookups.map(async (call): Promise<BetaContentBlockParam> => {
                            try {
                                const subject = str((call.input as { subject?: unknown }).subject)
                                const found = await deps.lookupWikidata(subject)
                                retrieved.push(...found.urls)
                                return {
                                    type: 'tool_result',
                                    tool_use_id: call.id,
                                    content: JSON.stringify({ items: found.items }),
                                }
                            } catch (error) {
                                return {
                                    type: 'tool_result',
                                    tool_use_id: call.id,
                                    content: error instanceof Error ? error.message : String(error),
                                    is_error: true,
                                }
                            }
                        }),
                    )
                    messages = [
                        ...messages,
                        { role: 'assistant', content: asParams(reply) },
                        { role: 'user', content: results },
                    ]
                    return { next: params([lookupTool, submitTool], wikidataSteps, messages) }
                }
                // Wikidata had nothing usable: start over with web search.
                phase = 'web_search'
                const note = replyText(reply) || 'Wikidata had nothing usable.'
                messages = [cardMessage(input, note)]
                return { next: params([webSearchTool, submitTool], webSteps, messages) }
            }

            if (reply.stop_reason === 'pause_turn') {
                messages = [...messages, { role: 'assistant', content: asParams(reply) }]
                return { next: params([webSearchTool, submitTool], webSteps, messages) }
            }
            const reason = replyText(reply)
            throw new AiAnswerRejectedError(
                'no_suggestion',
                `The AI found no sourced year for this card.${reason ? ` ${reason}` : ''}`,
                { sources },
            )
        },
    )
    return { suggestion: value, requestId: auditId }
}
