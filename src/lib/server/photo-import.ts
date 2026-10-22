// The database side of "Add from photo" (#60): the existing cards near a candidate's date, for
// the AI's duplicate check, and creating the drafts the admin saves over
// `public.import_photo_cards` (`supabase/migrations/20261023005600_import_photo_cards.sql`),
// all or none.

import type { PhotoDraft } from '../cards/photo-import'
import type { NearbyCard } from './ai-read-photo'
import { checkRpc, RpcRefusal, type Refusals } from './rpc-refusal'
import type { Db } from './supabase'

/** How many years either side of a candidate count as near. */
const nearbyYears = 2
/** The most nearby cards sent to the duplicate check. */
const nearbyLimit = 200

/** Why the database refused the drafts, in words for the review page. */
export class PhotoImportError extends RpcRefusal {}

const refusals: Refusals = {
    not_admin: 'Only admins can add cards from a photo.',
    invalid_category: 'A category was archived or deleted meanwhile. Pick another one.',
}

/** Existing cards dated within a couple of years (or in the same decade) of these years. */
export async function findNearbyCards(db: Db, years: number[]): Promise<NearbyCard[]> {
    const ranges = [...new Set(years)].map(
        (year) =>
            `and(year.gte.${year - nearbyYears},year.lte.${year + nearbyYears}),and(year.is.null,decade.gte.${year - 10},decade.lte.${year})`,
    )
    const { data, error } = await db
        .from('cards')
        .select('id, year, decade, card_translations(locale, text)')
        .or(ranges.join(','))
        .limit(nearbyLimit)
    if (error) throw new Error(error.message, { cause: error })
    return data.flatMap((row) => {
        const text = row.card_translations.find((t) => t.locale === 'en')?.text
        return text ? [{ id: row.id, text, year: row.year, decade: row.decade }] : []
    })
}

/** Creates the drafts in one call, in order, and returns their ids. */
export async function importPhotoCards(
    db: Db,
    actor: string,
    drafts: readonly PhotoDraft[],
    requestId: number | null,
): Promise<string[]> {
    const { data, error } = await db.rpc('import_photo_cards', {
        actor,
        request_id: requestId ?? undefined,
        cards: drafts.map((draft) => ({
            category_id: draft.categoryId,
            decade: draft.date.decade,
            year: draft.date.year,
            month: draft.date.month,
            day: draft.date.day,
            source_quote: draft.sourceQuote,
            difficulty: draft.difficulty,
            translations: draft.translations,
        })),
    })
    checkRpc(error, refusals, PhotoImportError)
    return (data ?? []) as string[]
}
