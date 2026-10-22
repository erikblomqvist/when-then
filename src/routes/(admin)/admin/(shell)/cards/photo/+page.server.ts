import { randomUUID } from 'node:crypto'
import { fail, redirect } from '@sveltejs/kit'
import { readPhotoDrafts } from '#lib/cards/photo-import.js'
import { AiCallError, AiRateLimitError, AiUnavailableError } from '#lib/server/ai.js'
import { aiDeps } from '#lib/server/ai-client.js'
import {
    photoImageTypes,
    readCardsFromPhoto,
    type PhotoImageType,
} from '#lib/server/ai-read-photo.js'
import { listCategories } from '#lib/server/categories.js'
import { createCategoryAction } from '#lib/server/category-editor.js'
import { requireRole } from '#lib/server/guard.js'
import { findNearbyCards, importPhotoCards, PhotoImportError } from '#lib/server/photo-import.js'
import { supabaseService } from '#lib/server/supabase.js'
import type { Actions, PageServerLoad } from './$types'

// "Add from photo" (#60), admin only like CSV import. Read sends the photo to the AI and
// returns candidate cards (nothing saved, the photo not kept); the page edits them and Save
// posts the ticked ones back as JSON, checked again here before they are created as drafts.

// Reading a dense page, plus the duplicate check, can take a while.
export const config = { maxDuration: 120 }

/** The API takes images up to 5 MB; the page shrinks a phone photo well under that first. */
const maxPhotoBytes = 5 * 1024 * 1024

const activeCategories = async () =>
    (await listCategories(supabaseService())).map(({ id, name, icon, colour }) => ({
        id,
        name,
        icon,
        colour,
    }))

export const load: PageServerLoad = async (event) => {
    await requireRole(event, 'admin')
    return { categories: await activeCategories() }
}

const text = (form: FormData, name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
}

const isImageType = (type: string): type is PhotoImageType =>
    photoImageTypes.some((one) => one === type)

export const actions: Actions = {
    read: async (event) => {
        const { user } = await requireRole(event, 'admin')
        const form = await event.request.formData()
        const photo = form.get('photo')
        if (!(photo instanceof File) || photo.size === 0) {
            return fail(400, { stage: 'photo' as const, error: 'Take or choose a photo.' })
        }
        if (!isImageType(photo.type)) {
            return fail(400, {
                stage: 'photo' as const,
                error: 'Use a JPEG, PNG, WebP or GIF image.',
            })
        }
        if (photo.size > maxPhotoBytes) {
            return fail(400, {
                stage: 'photo' as const,
                error: 'The photo is over 5 MB. Take it at a lower resolution and try again.',
            })
        }

        const db = supabaseService()
        const categories = await activeCategories()
        try {
            const { candidates, requestId } = await readCardsFromPhoto(
                { ...aiDeps(), findNearbyCards: (years) => findNearbyCards(db, years) },
                {
                    actorId: user.id,
                    requestKey: randomUUID(),
                    image: {
                        mediaType: photo.type,
                        base64: Buffer.from(await photo.arrayBuffer()).toString('base64'),
                    },
                    categories,
                    usedColours: [...new Set(categories.map(({ colour }) => colour))],
                },
            )
            return { stage: 'review' as const, candidates, requestId }
        } catch (failure) {
            if (
                failure instanceof AiUnavailableError ||
                failure instanceof AiRateLimitError ||
                failure instanceof AiCallError
            ) {
                return fail(failure instanceof AiCallError ? 502 : 503, {
                    stage: 'photo' as const,
                    error: failure.message,
                })
            }
            throw failure
        }
    },

    createCategory: createCategoryAction,

    save: async (event) => {
        const { user } = await requireRole(event, 'admin')
        const form = await event.request.formData()
        const drafts = readPhotoDrafts(text(form, 'cards'))
        const request = Number(form.get('request_id'))
        if (!drafts) return fail(400, { stage: 'save' as const, error: 'Tick at least one card.' })
        const invalid = drafts.findIndex(({ errors }) => errors.length > 0)
        if (invalid !== -1) {
            return fail(400, {
                stage: 'save' as const,
                error: `Card ${invalid + 1}: ${drafts[invalid].errors.join(' ')}`,
            })
        }

        let ids: string[]
        try {
            ids = await importPhotoCards(
                supabaseService(),
                user.id,
                drafts.map(({ draft }) => draft),
                Number.isInteger(request) && request > 0 ? request : null,
            )
        } catch (failure) {
            if (!(failure instanceof PhotoImportError)) throw failure
            return fail(409, { stage: 'save' as const, error: failure.message })
        }
        const params = new URLSearchParams(ids.map((id) => ['new', id]))
        redirect(303, `/admin/cards?${params}`)
    },
}
