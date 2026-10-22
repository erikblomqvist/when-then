// Bulk machine translation (#41): fills the missing locales (sv, nb) of many cards, one
// Claude call per card, as machine translations. Never overwrites a translation and never
// touches anything but translation text. Reports per card what it skipped and why, in the
// shape of the other bulk actions (`BulkResult`, #46).

import { localeName, translationLocales, type TranslationLocale } from '../cards/translation'
import { AiRateLimitError, aiAllowance, defaultRateLimit, type AiDeps } from './ai'
import { translateCardText } from './ai-translate'
import type { BulkResult, SkippedCard } from './card-bulk'
import type { Db } from './supabase'

/** Calls running side by side: fast enough for a page of cards, gentle on the API. */
const parallelCalls = 4
const loadBatch = 200

type Pending = {
    id: string
    english: string
    category: string | null
    missing: TranslationLocale[]
}

const failure = (error: unknown) =>
    error instanceof Error ? error.message : 'The translation failed.'

/** The cards, with their English text, category name and the locales they lack. */
async function loadCards(db: Db, ids: string[]) {
    const found = new Map<string, Pending>()
    for (let start = 0; start < ids.length; start += loadBatch) {
        const { data, error } = await db
            .from('cards')
            .select(
                'id, card_translations(locale, text), categories(category_translations(locale, name))',
            )
            .in('id', ids.slice(start, start + loadBatch))
        if (error) throw new Error(error.message, { cause: error })
        for (const row of data) {
            const texts = new Map(row.card_translations.map((t) => [t.locale, t.text]))
            found.set(row.id, {
                id: row.id,
                english: texts.get('en') ?? '',
                category:
                    row.categories?.category_translations.find((t) => t.locale === 'en')?.name ??
                    null,
                missing: translationLocales.filter((locale) => !texts.get(locale)),
            })
        }
    }
    return found
}

/**
 * Machine-translates the missing locales of each card (as `actorId`), in the given order.
 * Cards that need nothing, are gone, fail, or are past the person's AI rate limit are skipped
 * with the reason. `deps` from `aiDeps()`; throws `AiUnavailableError` there when there's no key.
 */
export async function translateMissingCards(
    deps: AiDeps,
    db: Db,
    actorId: string,
    cardIds: string[],
): Promise<BulkResult> {
    const ids = [...new Set(cardIds)]
    const cards = await loadCards(db, ids)
    let allowance = await aiAllowance(deps, actorId)
    const rateLimited = new AiRateLimitError(deps.rateLimit ?? defaultRateLimit).message

    const outcome = new Map<string, true | SkippedCard>()
    const work: Pending[] = []
    for (const id of ids) {
        const card = cards.get(id)
        if (!card) outcome.set(id, { id, text: null, reason: 'No such card.' })
        else if (!card.english) {
            outcome.set(id, { id, text: null, reason: 'It has no English text.' })
        } else if (card.missing.length === 0) {
            const names = translationLocales.map((locale) => localeName[locale]).join(' and ')
            outcome.set(id, { id, text: card.english, reason: `It has ${names} text already.` })
        } else if (allowance === 0) {
            outcome.set(id, { id, text: card.english, reason: rateLimited })
        } else {
            allowance -= 1
            work.push(card)
        }
    }

    const translate = async (card: Pending): Promise<true | SkippedCard> => {
        const skip = (reason: string): SkippedCard => ({ id: card.id, text: card.english, reason })
        try {
            const texts = await translateCardText(deps, {
                actorId,
                cardId: card.id,
                english: card.english,
                category: card.category,
                locales: card.missing,
            })
            const { data, error } = await db.rpc('add_machine_translations', {
                actor: actorId,
                card_id: card.id,
                english: card.english,
                translations: texts,
            })
            if (error) return skip(error.message)
            const saved = data as { added: string[]; english_changed: boolean }
            if (saved.english_changed) {
                return skip('Its English text changed while it was being translated.')
            }
            if (saved.added.length === 0) return skip('Someone translated it meanwhile.')
            return true
        } catch (error) {
            return skip(failure(error))
        }
    }

    for (let start = 0; start < work.length; start += parallelCalls) {
        const batch = work.slice(start, start + parallelCalls)
        const results = await Promise.all(batch.map(translate))
        batch.forEach((card, index) => outcome.set(card.id, results[index]))
    }

    const result: BulkResult = { done: [], skipped: [] }
    for (const id of ids) {
        const done = outcome.get(id)
        if (done === true) result.done.push(id)
        else if (done) result.skipped.push(done)
    }
    return result
}
