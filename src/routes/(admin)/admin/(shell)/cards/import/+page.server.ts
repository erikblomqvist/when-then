import { fail, type RequestEvent } from '@sveltejs/kit'
import { planCardImport, type ImportRow } from '#lib/cards/card-import.js'
import { CardImportError, importCards } from '#lib/server/card-import.js'
import { categoriesByEnglishName } from '#lib/server/categories.js'
import { suspectedDuplicates, type SameTextCard } from '#lib/server/duplicate-cards.js'
import { requireRole } from '#lib/server/guard.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

// Admin only (#14). Preview reads the uploaded file and writes nothing; Import posts the same
// CSV text back and checks it again, so what is created never rests on the browser's word.
// Rows with the same English text as an existing card, or as an earlier row, are suspected
// duplicates: the preview marks them, and Import leaves them out unless told not to.

const maxFileBytes = 2 * 1024 * 1024

export const load: PageServerLoad = async (event) => {
    await requireRole(event, 'admin')
    return {}
}

const text = (form: FormData, name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
}

/** Per row number, why the row looks like a duplicate (rows that won't be created never do). */
async function duplicatesOf(rows: readonly ImportRow[]) {
    const found = await suspectedDuplicates(
        supabaseService(),
        rows.map((row) => row.card?.translations.en ?? ''),
    )
    return Object.fromEntries(
        rows.flatMap((row, index) => {
            const suspected = found[index]
            if (!suspected) return []
            const earlier = suspected.earlier === null ? null : rows[suspected.earlier]!.row
            return [[row.row, { cards: suspected.cards, earlierRow: earlier }]]
        }),
    ) as Record<number, { cards: SameTextCard[]; earlierRow: number | null }>
}

/** The file's rows against the current categories (archived ones match, to say so). */
async function plan(csv: string) {
    return planCardImport(
        csv,
        await categoriesByEnglishName(supabaseService(), { includeArchived: true }),
    )
}

async function readUpload(event: RequestEvent) {
    const form = await event.request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV file.' }
    if (file.size > maxFileBytes)
        return { error: 'The file is over 2 MB. Split it and import the parts.' }
    return { fileName: file.name, csv: await file.text() }
}

export const actions: Actions = {
    preview: async (event) => {
        await requireRole(event, 'admin')
        const upload = await readUpload(event)
        if ('error' in upload) return fail(400, { stage: 'upload' as const, error: upload.error })
        const planned = await plan(upload.csv)
        if (!planned.ok) return fail(400, { stage: 'upload' as const, error: planned.error })
        return {
            stage: 'preview' as const,
            ...upload,
            rows: planned.rows,
            duplicates: await duplicatesOf(planned.rows),
        }
    },

    import: async (event) => {
        const { user } = await requireRole(event, 'admin')
        const form = await event.request.formData()
        const csv = text(form, 'csv')
        const fileName = text(form, 'file_name') || null
        const planned = await plan(csv)
        if (!planned.ok) return fail(400, { stage: 'upload' as const, error: planned.error })
        // "Leave out suspected duplicates", checked again now rather than taken from the preview.
        const duplicates = form.get('skip_duplicates') ? await duplicatesOf(planned.rows) : {}
        const leftOut = planned.rows.filter((row) => row.row in duplicates)
        const rows = planned.rows.filter((row) => !(row.row in duplicates))

        try {
            const created = await importCards(supabaseService(), user.id, rows, {
                fileName,
            })
            const byRow = new Map(created.map((card) => [card.row, card.id]))
            return {
                stage: 'imported' as const,
                created: rows.flatMap((row) => {
                    const id = byRow.get(row.row)
                    return id ? [{ row: row.row, id, text: row.text }] : []
                }),
                skipped: rows.filter((row) => !byRow.has(row.row)),
                leftOut: leftOut.map(({ row, text }) => ({ row, text })),
            }
        } catch (error) {
            if (!(error instanceof CardImportError)) throw error
            return fail(409, { stage: 'upload' as const, error: error.message })
        }
    },
}
