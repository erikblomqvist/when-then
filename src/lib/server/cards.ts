// The card repository: every card read and write the admin makes goes through here, with
// the service client (`supabaseService()`) after the route checked the role. Each function
// takes the client first, so tests run it against the local stack.
//
// Writes go through the `save_card` rpc, which names the actor for the audit triggers and
// writes the card and its translations in one transaction. New write paths (publish,
// archive, verify, AI translations) follow the same shape: an rpc taking `actor` first.

import type {
    Card,
    CardInput,
    CardListQuery,
    CardLocale,
    CardSummary,
    Translation,
    TranslationStatus,
} from '../cards/card'
import { defaultCardSort, type CardFilter } from '../cards/card-list'
import type { DateParts } from '../cards/date-parts'
import { historyOf, type AuditEntry } from './audit'
import { namesByLocale } from './categories'
import type { Db } from './supabase'

const fail = (error: { message: string }): never => {
    throw new Error(error.message, { cause: error })
}

const dateParts = (row: DateParts): DateParts => ({
    decade: row.decade,
    year: row.year,
    month: row.month,
    day: row.day,
})

const listColumns = `id, status, decade, year, month, day, verified_at, updated_at, country_specific,
    category:categories!inner(id, icon, colour, category_translations(locale, name)),
    card_translations(locale, text, status)`

/** The typed filter as `public.cards_matching`'s `filter` argument (absent keys drop out). */
const filterArgs = (filter: CardFilter) => ({
    search: filter.search,
    status: filter.status,
    archived: filter.archived ?? false,
    category_id: filter.categoryId,
    verified: filter.verified,
    has_source: filter.hasSource,
    era: filter.era,
    country: filter.country,
    translations: filter.translations,
})

/**
 * Every card matching `filter`, as a query to finish with `.select(…)` and, if needed, order
 * and range: the one definition of "cards matching this view", for the list, select all
 * matching and export. Pass `{ count: 'exact' }` to get the total with the rows.
 */
export const matchingCards = (
    db: Db,
    filter: CardFilter,
    options?: { count?: 'exact'; head?: boolean },
) => db.rpc('cards_matching', { filter: filterArgs(filter) }, options)

/** How many cards match `filter`. */
export async function countMatchingCards(db: Db, filter: CardFilter): Promise<number> {
    const { count, error } = await matchingCards(db, filter, { count: 'exact', head: true })
    if (error) fail(error)
    return count ?? 0
}

// The Data API returns at most `max_rows` (supabase/config.toml) rows per request.
const idBatch = 1000

/** The ids of every card matching `filter`, however many (select all matching). */
export async function matchingCardIds(db: Db, filter: CardFilter): Promise<string[]> {
    const ids: string[] = []
    for (;;) {
        const { data, error } = await matchingCards(db, filter)
            .select('id')
            .order('id')
            .range(ids.length, ids.length + idBatch - 1)
        if (error?.code === 'PGRST103') return ids
        if (error) fail(error)
        ids.push(...(data ?? []).map((row) => row.id))
        if ((data ?? []).length < idBatch) return ids
    }
}

/**
 * One page of the cards matching `filter`, in `sort` order, with the total for paging.
 * Sorting by date orders by decade (stored by its earliest year, so BC sorts right), then
 * year, month and day with the less precise date first, and puts undated cards last either
 * way. Ties break by id, so pages never overlap.
 */
export async function listCards(
    db: Db,
    { page, pageSize, filter = {}, sort = defaultCardSort }: CardListQuery,
): Promise<{ cards: CardSummary[]; total: number }> {
    const from = (page - 1) * pageSize
    const ascending = !sort.startsWith('-')
    let query = matchingCards(db, filter, { count: 'exact' }).select(listColumns)
    if (sort === 'date' || sort === '-date') {
        query = query
            .order('decade', { ascending, nullsFirst: false })
            .order('year', { ascending, nullsFirst: ascending })
            .order('month', { ascending, nullsFirst: ascending })
            .order('day', { ascending, nullsFirst: ascending })
    } else {
        query = query.order('updated_at', { ascending })
    }
    const { data, count, error } = await query.order('id').range(from, from + pageSize - 1)
    // A page past the end (a stale link, or cards archived meanwhile): no rows, the real total.
    if (error?.code === 'PGRST103') {
        return { cards: [], total: await countMatchingCards(db, filter) }
    }
    if (error) fail(error)

    const cards = (data ?? []).map((row): CardSummary => {
        const english = row.card_translations.find((translation) => translation.locale === 'en')
        return {
            id: row.id,
            status: row.status,
            text: english?.text ?? null,
            date: dateParts(row),
            category: {
                id: row.category.id,
                name: namesByLocale(row.category.category_translations).en ?? '',
                icon: row.category.icon,
                colour: row.category.colour,
            },
            translations: Object.fromEntries(
                row.card_translations.map((translation) => [
                    translation.locale,
                    translation.status,
                ]),
            ) as Partial<Record<CardLocale, TranslationStatus>>,
            texts: Object.fromEntries(
                row.card_translations.map((translation) => [translation.locale, translation.text]),
            ) as Partial<Record<CardLocale, string>>,
            countrySpecific: row.country_specific,
            verified: row.verified_at !== null,
            updatedAt: row.updated_at,
        }
    })
    return { cards, total: count ?? cards.length }
}

/** A card with all its translations, or null if there is none with this id. */
export async function getCard(db: Db, id: string): Promise<Card | null> {
    // Not a uuid: no such card (and Postgres would reject the comparison).
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) return null
    const { data, error } = await db
        .from('cards')
        .select('*, card_translations(locale, text, note, status)')
        .eq('id', id)
        .maybeSingle()
    if (error) fail(error)
    if (!data) return null
    return {
        id: data.id,
        status: data.status,
        categoryId: data.category_id,
        date: dateParts(data),
        sourceUrl: data.source_url,
        sourceQuote: data.source_quote,
        difficulty: data.difficulty,
        countrySpecific: data.country_specific,
        translations: Object.fromEntries(
            data.card_translations.map(({ locale, text, note, status }) => [
                locale,
                { text, note, status } satisfies Translation,
            ]),
        ),
        verifiedAt: data.verified_at,
        verifiedBy: data.verified_by,
        archivedFrom: data.archived_from,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
    }
}

/**
 * Creates a draft (no `cardId`) or edits a card, as `actorId`, in one audited transaction.
 * Returns the card's id. Throws on anything the database refuses (date-part rules, an unknown
 * category); the form validates first, so that is a bug rather than user input.
 */
export async function saveCard(
    db: Db,
    actorId: string,
    input: CardInput,
    cardId?: string,
): Promise<string> {
    const { data, error } = await db.rpc('save_card', {
        actor: actorId,
        card: {
            category_id: input.categoryId,
            decade: input.date.decade,
            year: input.date.year,
            month: input.date.month,
            day: input.date.day,
            source_url: input.sourceUrl,
            source_quote: input.sourceQuote,
            // Only when given: an import that leaves it out keeps the card's difficulty.
            ...(input.difficulty === undefined ? {} : { difficulty: input.difficulty }),
            ...(input.countrySpecific === undefined
                ? {}
                : { country_specific: input.countrySpecific }),
            clear_verification: input.clearVerification ?? false,
        },
        translations: input.translations,
        card_id: cardId,
    })
    if (error) fail(error)
    return data as string
}

/** The card's history (card and translations), newest first. */
export const cardHistory = (db: Db, cardId: string): Promise<AuditEntry[]> => historyOf(db, cardId)
