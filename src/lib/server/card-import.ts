// Creating the cards of a CSV import (#48) over `public.import_cards`
// (`supabase/migrations/20261023004800_import_cards.sql`): the checked rows go in one call, so
// an import creates all its cards or none. The database checks the actor is an admin and logs
// an 'import' per card with the file name and row.

import type { PostgrestError } from '@supabase/supabase-js'
import type { ImportRow } from '../cards/card-import'
import type { Db } from './supabase'

/** Why the database refused an import, in words for the import page. */
export class CardImportError extends Error {}

const refusals: Record<string, string> = {
    not_admin: 'Only admins can import cards.',
    invalid_category:
        'A category was archived or deleted since the preview. Upload the file again to check it.',
}

function check(error: PostgrestError | null) {
    if (!error) return
    const refusal = refusals[error.message]
    if (refusal) throw new CardImportError(refusal, { cause: error })
    throw new Error(error.message, { cause: error })
}

/** A card the import created, by the CSV row it came from. */
export type CreatedCard = { row: number; id: string }

/** Creates a draft for every row without errors (the others are skipped). */
export async function importCards(
    db: Db,
    actor: string,
    rows: readonly ImportRow[],
    { fileName }: { fileName: string | null },
): Promise<CreatedCard[]> {
    const importable = rows.flatMap((row) => (row.card ? [{ row: row.row, card: row.card }] : []))
    if (importable.length === 0) return []

    const { data, error } = await db.rpc('import_cards', {
        actor,
        file_name: fileName ?? undefined,
        cards: importable.map(({ row, card }) => ({
            row,
            category_id: card.categoryId,
            decade: card.date.decade,
            year: card.date.year,
            month: card.date.month,
            day: card.date.day,
            source_url: card.sourceUrl,
            source_quote: card.sourceQuote,
            tags: card.tags,
            translations: card.translations,
        })),
    })
    check(error)
    const ids = (data ?? []) as string[]
    return importable.map(({ row }, index) => ({ row, id: ids[index]! }))
}
