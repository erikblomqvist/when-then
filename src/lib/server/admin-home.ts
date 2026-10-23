// The admin Home's numbers: how the deck stands (by status, ready drafts, review queues,
// unverified dates, translation coverage, cards per category) and, for admins, people and
// recent activity. Each count is one cheap query, run side by side. Cards counted here are the
// Cards tab's (drafts and published) unless a count says archived.

import type { CardStatus } from '../cards/card'
import type { CategoryColour, CategoryIconName } from '../categories/look'
import type { AuditNames } from '../audit/display'
import { publishBlockers } from '../cards/publish-rule'
import {
    translationLocales,
    type TranslationLocale,
    type TranslationState,
} from '../cards/translation'
import { auditLog, auditNames, type AuditEntry } from './audit'
import { countMatchingCards } from './cards'
import { listCategories } from './categories'
import { listPeople } from './people'
import type { AppRole } from './roles'
import type { Db } from './supabase'

const week = 7 * 24 * 60 * 60 * 1000
const weeksShown = 8

export type AdminHome = {
    cards: {
        published: number
        drafts: number
        /** Drafts that meet the publish rule already. */
        draftsReady: number
        archived: number
        /** Cards published in the last seven days (from the audit log). */
        publishedThisWeek: number
        /** Drafts and published cards whose date nobody has verified. */
        unverified: number
    }
    /**
     * Cards published per week (rolling seven-day windows back from now), oldest first; the
     * last is this week.
     */
    publishedPerWeek: { from: string; count: number }[]
    /** Cards with a machine or stale translation, per locale (the review queues). */
    toReview: Record<TranslationLocale, number>
    /** Drafts and published cards by translation state, per locale. */
    translations: Record<TranslationLocale, Record<TranslationState, number>>
    categories: {
        id: string
        name: string
        colour: CategoryColour
        icon: CategoryIconName
        archived: boolean
        cardCount: number
    }[]
    /** Admins only. */
    people?: { withRole: number; invites: number }
    /** Admins only: the latest changes, and how many there were in the last seven days. */
    activity?: { changesThisWeek: number; recent: AuditEntry[]; names: AuditNames }
}

const translationStatesCounted: TranslationState[] = ['reviewed', 'machine', 'stale', 'missing']

async function countSince(db: Db, since: Date, action?: string, until?: Date) {
    let query = db
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('at', since.toISOString())
    if (until) query = query.lt('at', until.toISOString())
    if (action) query = query.eq('action', action).eq('entity', 'card')
    const { count, error } = await query
    if (error) throw new Error(error.message, { cause: error })
    return count ?? 0
}

/** Drafts that would pass the publish rule as saved. */
async function countReadyDrafts(db: Db) {
    const { data, error } = await db
        .from('cards')
        .select('decade, year, month, day, card_translations(locale, text)')
        .eq('status', 'draft' satisfies CardStatus)
    if (error) throw new Error(error.message, { cause: error })
    return (data ?? []).filter(
        (card) =>
            publishBlockers({
                date: { decade: card.decade, year: card.year, month: card.month, day: card.day },
                translations: {
                    en: card.card_translations.find((translation) => translation.locale === 'en'),
                },
            }).length === 0,
    ).length
}

export async function adminHome(db: Db, role: AppRole, now = new Date()): Promise<AdminHome> {
    const since = new Date(now.getTime() - week)
    const count = (filter: Parameters<typeof countMatchingCards>[1]) =>
        countMatchingCards(db, filter)
    const perLocale = <T>(make: (locale: TranslationLocale) => Promise<T>) =>
        Promise.all(translationLocales.map(make)).then(
            (values) =>
                Object.fromEntries(
                    translationLocales.map((locale, index) => [locale, values[index]]),
                ) as Record<TranslationLocale, T>,
        )

    const [published, drafts, draftsReady, archived, publishedThisWeek, unverified] =
        await Promise.all([
            count({ status: 'published' }),
            count({ status: 'draft' }),
            countReadyDrafts(db),
            count({ archived: true }),
            countSince(db, since, 'publish'),
            count({ verified: false }),
        ])
    const weeks = Array.from({ length: weeksShown }, (_, index) => {
        const until = new Date(now.getTime() - (weeksShown - 1 - index) * week)
        return { from: new Date(until.getTime() - week), until }
    })
    const [toReview, translations, categories, publishedPerWeek] = await Promise.all([
        perLocale((locale) => count({ translations: { [locale]: 'needs-review' } })),
        perLocale(async (locale) => {
            const counts = await Promise.all(
                translationStatesCounted.map((state) =>
                    count({ translations: { [locale]: state } }),
                ),
            )
            return Object.fromEntries(
                translationStatesCounted.map((state, index) => [state, counts[index]]),
            ) as Record<TranslationState, number>
        }),
        listCategories(db, { includeArchived: true }),
        Promise.all(
            weeks.map(async ({ from, until }) => ({
                from: from.toISOString(),
                count: await countSince(db, from, 'publish', until),
            })),
        ),
    ])

    const home: AdminHome = {
        cards: { published, drafts, draftsReady, archived, publishedThisWeek, unverified },
        publishedPerWeek,
        toReview,
        translations,
        categories: categories.map(({ id, name, colour, icon, archived, cardCount }) => ({
            id,
            name,
            colour,
            icon,
            archived,
            cardCount,
        })),
    }
    if (role !== 'admin') return home

    const [{ people, invites }, changesThisWeek, log, names] = await Promise.all([
        listPeople(db),
        countSince(db, since),
        auditLog(db, { pageSize: 5 }),
        auditNames(db),
    ])
    home.people = { withRole: people.length, invites: invites.length }
    home.activity = { changesThisWeek, recent: log.entries, names }
    return home
}
