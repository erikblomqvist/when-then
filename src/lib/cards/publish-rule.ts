// The publish rule (ADR 0001, issue #14): what a card needs before it can be dealt. Shared by
// the editor (Publish stays disabled and says why), the server actions (single and bulk
// publish) and mirrored in SQL by `public.card_publish_blockers`, which `publish_card` checks.

import type { DateParts } from './date-parts'

/** The parts of a card the rule looks at; a `Card` or `CardInput` fits. */
export type PublishableCard = {
    date: DateParts
    translations: { en?: { text: string } }
}

/** From this year on, the standard game mode places cards by year, so they need one. */
export const yearRequiredFrom = 1500

/** Why a decade alone isn't enough from `yearRequiredFrom` on (the rule and the form say so). */
export const yearRequiredMessage = `Cards from ${yearRequiredFrom} onwards need a year.`

/**
 * Why the card can't be published yet, as sentences for the editor; empty when it can.
 * English text is required (the fallback for every card language) and a date: from 1500
 * onwards at least the year, before that at least the decade.
 */
export function publishBlockers({ date, translations }: PublishableCard): string[] {
    const blockers: string[] = []
    if (!translations.en?.text.trim()) blockers.push('Add the English text.')
    if (date.decade === null) blockers.push('Add a date: at least the decade.')
    else if (date.decade >= yearRequiredFrom && date.year === null) {
        blockers.push(yearRequiredMessage)
    }
    return blockers
}
