// Wikidata lookup for date suggestions (#42): the first source tried, before web search
// (docs/research/ai-card-authoring.md, 2a). Searches items by name, then reads their dated
// statements and links through the JSON API (where 1 BCE is -1, matching our signed years).
//
//     const { items, urls } = await lookupWikidata({ fetch, apiUrl }, 'Albert Einstein')
//
// A year is only given for a statement at year precision or better; a decade or century
// statement comes back with `year: null` so the model can say the source is too coarse.
// `fetch` and `apiUrl` are injected: tests and e2e never reach Wikimedia.

import { decadeOf, formatCardDate } from '../cards/date-parts'

export const wikidataApiUrl = 'https://www.wikidata.org/w/api.php'

/** Wikimedia rejects requests without a descriptive agent (HTTP 403). */
const userAgent = 'WhenThen/1.0 (https://github.com/erikblomqvist/when-then; admin card authoring)'

/** The date properties a card's statement is usually about, with their English labels. */
const dateProperties: Record<string, string> = {
    P569: 'date of birth',
    P570: 'date of death',
    P571: 'inception',
    P576: 'dissolved, abolished or demolished',
    P577: 'publication date',
    P580: 'start time',
    P582: 'end time',
    P585: 'point in time',
    P575: 'time of discovery or invention',
    P606: 'first flight',
    P619: 'launch date',
    P729: 'service entry',
    P1191: 'date of first performance',
    P1619: 'date of official opening',
}

export type WikidataPrecision = 'day' | 'month' | 'year' | 'decade' | 'century' | 'coarser'

export type WikidataDate = {
    /** Null below year precision: the source doesn't give a year. */
    year: number | null
    month: number | null
    day: number | null
    precision: WikidataPrecision
}

export type WikidataStatement = WikidataDate & {
    property: string
    label: string
    /** The statement in words, usable as the card's source quote. */
    quote: string
}

export type WikidataItem = {
    id: string
    label: string | null
    description: string | null
    wikidataUrl: string
    wikipediaUrl: string | null
    statements: WikidataStatement[]
}

export type WikidataLookup = {
    items: WikidataItem[]
    /** Every page URL this lookup returned: the sources a suggestion may cite. */
    urls: string[]
}

const precisions: Record<number, WikidataPrecision> = {
    11: 'day',
    10: 'month',
    9: 'year',
    8: 'decade',
    7: 'century',
}

/** A Wikidata JSON time value (`+1879-03-14T00:00:00Z`, precision 11) as date parts. */
export function wikidataDate(time: string, precision: number): WikidataDate | null {
    const match = /^([+-])(\d+)-(\d\d)-(\d\d)T/.exec(time)
    if (!match) return null
    const year = Number(match[2]) * (match[1] === '-' ? -1 : 1)
    if (year === 0) return null
    if (precision < 9) {
        return { year: null, month: null, day: null, precision: precisions[precision] ?? 'coarser' }
    }
    return {
        year,
        month: precision >= 10 && Number(match[3]) ? Number(match[3]) : null,
        day: precision >= 11 && Number(match[4]) ? Number(match[4]) : null,
        precision: precisions[Math.min(precision, 11)],
    }
}

type Snak = {
    snaktype?: string
    datavalue?: { type?: string; value?: { time?: string; precision?: number } }
}
type Claims = Record<string, { mainsnak?: Snak }[] | undefined>

function coarseQuote(label: string, time: string, precision: WikidataPrecision) {
    const year = Number(/^([+-]\d+)/.exec(time)?.[1] ?? 0)
    if (precision === 'decade' && year) {
        const decade = formatCardDate({
            decade: decadeOf(year),
            year: null,
            month: null,
            day: null,
        })
        return `${label}: the ${decade} (decade precision only)`
    }
    return `${label}: around ${Math.abs(year)}${year < 0 ? ' BC' : ''} (${precision} precision only)`
}

/** The dated statements among an item's claims, in property order, readable values only. */
export function datedStatements(claims: Claims): WikidataStatement[] {
    const statements: WikidataStatement[] = []
    for (const [property, values] of Object.entries(claims)) {
        const label = dateProperties[property]
        if (!label) continue
        for (const { mainsnak } of values ?? []) {
            const value = mainsnak?.datavalue?.value
            if (mainsnak?.snaktype !== 'value' || mainsnak.datavalue?.type !== 'time') continue
            if (!value?.time || value.precision === undefined) continue
            const date = wikidataDate(value.time, value.precision)
            if (!date) continue
            const quote =
                date.year !== null
                    ? `${label}: ${formatCardDate({ decade: null, ...date })}`
                    : coarseQuote(label, value.time, date.precision)
            statements.push({ property, label, ...date, quote })
        }
    }
    return statements
}

export type WikidataDeps = {
    fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
    apiUrl: string
}

async function ask(deps: WikidataDeps, params: Record<string, string>): Promise<unknown> {
    const url = new URL(deps.apiUrl)
    for (const [name, value] of Object.entries({ ...params, format: 'json' })) {
        url.searchParams.set(name, value)
    }
    const response = await deps.fetch(url, {
        headers: { 'user-agent': userAgent, accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Wikidata answered HTTP ${response.status}.`)
    return response.json()
}

type Entity = {
    id?: string
    labels?: Record<string, { value?: string }>
    descriptions?: Record<string, { value?: string }>
    sitelinks?: Record<string, { url?: string }>
    claims?: Claims
}

/** Up to five items matching `subject` (English), with links and dated statements. */
export async function lookupWikidata(deps: WikidataDeps, subject: string): Promise<WikidataLookup> {
    const found = (await ask(deps, {
        action: 'wbsearchentities',
        search: subject,
        language: 'en',
        type: 'item',
        limit: '5',
    })) as { search?: { id?: string }[] }
    const ids = (found.search ?? []).flatMap(({ id }) => (id ? [id] : []))
    if (ids.length === 0) return { items: [], urls: [] }

    const read = (await ask(deps, {
        action: 'wbgetentities',
        ids: ids.join('|'),
        props: 'labels|descriptions|claims|sitelinks/urls',
        languages: 'en',
        sitefilter: 'enwiki',
    })) as { entities?: Record<string, Entity> }

    const items = ids.flatMap((id): WikidataItem[] => {
        const entity = read.entities?.[id]
        if (!entity) return []
        return [
            {
                id,
                label: entity.labels?.en?.value ?? null,
                description: entity.descriptions?.en?.value ?? null,
                wikidataUrl: `https://www.wikidata.org/wiki/${id}`,
                wikipediaUrl: entity.sitelinks?.enwiki?.url ?? null,
                statements: datedStatements(entity.claims ?? {}),
            },
        ]
    })
    const urls = items.flatMap(({ wikidataUrl, wikipediaUrl }) =>
        wikipediaUrl ? [wikidataUrl, wikipediaUrl] : [wikidataUrl],
    )
    return { items, urls }
}
