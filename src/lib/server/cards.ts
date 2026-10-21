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

const listColumns = `id, status, decade, year, month, day, updated_at,
    category:categories!inner(id, icon, colour, category_translations(locale, name)),
    card_translations(locale, text, status)`

/**
 * One page of the card list, most recently updated first, with the total for paging.
 * Search, filters and sorting extend `CardListQuery` and the query built here.
 */
export async function listCards(
    db: Db,
    { page, pageSize }: CardListQuery,
): Promise<{ cards: CardSummary[]; total: number }> {
    const from = (page - 1) * pageSize
    const { data, count, error } = await db
        .from('cards')
        .select(listColumns, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .order('id')
        .range(from, from + pageSize - 1)
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
        translations: Object.fromEntries(
            data.card_translations.map(({ locale, text, note, status }) => [
                locale,
                { text, note, status } satisfies Translation,
            ]),
        ),
        verifiedAt: data.verified_at,
        verifiedBy: data.verified_by,
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
