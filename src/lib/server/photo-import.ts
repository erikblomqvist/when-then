// The database side of "Add from photo" (#60): the existing cards near a candidate's date, for
// the AI's duplicate check (the exact-text one is `cardsWithSameText`), and creating the drafts the admin saves over
// `public.import_photo_cards` (`supabase/migrations/20261023005600_import_photo_cards.sql`),
// all or none.

import type { PhotoDraft } from '../cards/photo-import'
import type { NearbyCard } from './ai-read-photo'
import { checkRpc, RpcRefusal, type Refusals } from './rpc-refusal'
import type { Db } from './supabase'

/** About how many nearby cards the duplicate check gets, shared out between the years. */
const nearbyBudget = 200
/** The fewest nearby cards a year gets, however many years a photo has. */
const nearbyPerYearAtLeast = 15

/** Why the database refused the drafts, in words for the review page. */
export class PhotoImportError extends RpcRefusal {}

const refusals: Refusals = {
    not_admin: 'Only admins can add cards from a photo.',
    invalid_category: 'A category was archived or deleted meanwhile. Pick another one.',
}

/**
 * Existing cards (not archived) dated within a couple of years (or undated in the decade) of
 * these years, closest in date first per year (`public.cards_near_years`).
 */
export async function findNearbyCards(db: Db, years: number[]): Promise<NearbyCard[]> {
    const distinct = [...new Set(years)]
    if (distinct.length === 0) return []
    const { data, error } = await db.rpc('cards_near_years', {
        years: distinct,
        per_year: Math.max(nearbyPerYearAtLeast, Math.floor(nearbyBudget / distinct.length)),
    })
    if (error) throw new Error(error.message, { cause: error })
    return data.map((row) => ({
        id: row.card_id,
        text: row.card_text,
        year: row.year ?? null,
        decade: row.decade ?? null,
    }))
}

/** Creates the drafts in one call, in order, each naming its own AI request, and returns their ids. */
export async function importPhotoCards(
    db: Db,
    actor: string,
    drafts: readonly PhotoDraft[],
): Promise<string[]> {
    const { data, error } = await db.rpc('import_photo_cards', {
        actor,
        cards: drafts.map((draft) => ({
            category_id: draft.categoryId,
            decade: draft.date.decade,
            year: draft.date.year,
            month: draft.date.month,
            day: draft.date.day,
            source_url: draft.sourceUrl,
            source_quote: draft.sourceQuote,
            difficulty: draft.difficulty,
            country_specific: draft.countrySpecific,
            translations: draft.translations,
            request_id: draft.requestId,
        })),
    })
    checkRpc(error, refusals, PhotoImportError)
    return (data ?? []) as string[]
}
