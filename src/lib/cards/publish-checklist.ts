// What the card editor shows before Publish: every requirement of the publish rule (and the
// form), always the same list, each ticked off once the form as typed meets it, and after it
// the things worth adding that aren't required (translations, a source, a verified date),
// listed only while missing. Publish is offered when every requirement is done.

import type { Card } from './card'
import {
    parseCardFormValues,
    translationDraft,
    type CardFormErrors,
    type CardFormValues,
} from './card-form'
import { yearRequiredFrom, yearRequiredMessage } from './publish-rule'
import { localeName, statusOnSave, translationLocales } from './translation'

export type PublishCheck = {
    key: 'text' | 'category' | 'date' | 'year' | 'fields'
    label: string
    done: boolean
    /** Why it isn't done yet (a mistake to fix), or how it was met when that isn't obvious. */
    detail?: string
}

const dateFields = ['decade', 'year', 'month', 'day'] as const
// The fields the checklist names; a mistake anywhere else is "Fix the marked fields".
const checkedFields = new Set<keyof CardFormValues>(['text_en', 'category_id', ...dateFields])

/**
 * The checklist for the form's values as they would be posted (the decade as shown). The
 * first four items are always there; "Fix the marked fields" only while another field (a
 * source, a translation) has a mistake.
 */
export function publishChecklist(values: CardFormValues): PublishCheck[] {
    const parsed = parseCardFormValues(values)
    const errors: CardFormErrors = parsed.ok ? {} : parsed.errors
    const hasDate = values.year.trim() !== '' || values.decade.trim() !== ''
    const needsYear = errors.decade === yearRequiredMessage
    const dateError = dateFields
        .map((field) => errors[field])
        .find((error) => error && error !== yearRequiredMessage)
    const dateDone = hasDate && !dateError
    const hasYear = values.year.trim() !== '' && !errors.year

    const checks: PublishCheck[] = [
        {
            key: 'text',
            label: 'English text',
            done: !errors.text_en,
            detail: values.text_en.trim() ? errors.text_en : undefined,
        },
        { key: 'category', label: 'Category', done: !errors.category_id },
        { key: 'date', label: 'Date, at least the decade', done: dateDone, detail: dateError },
        {
            key: 'year',
            label: `Year, for cards from ${yearRequiredFrom} on`,
            done: hasYear || (dateDone && !needsYear),
            detail:
                !hasYear && dateDone && !needsYear
                    ? `Not needed before ${yearRequiredFrom}`
                    : undefined,
        },
    ]
    const otherError = Object.entries(errors).find(
        ([field]) => !checkedFields.has(field as keyof CardFormValues),
    )
    if (otherError) {
        checks.push({
            key: 'fields',
            label: 'Fix the marked fields',
            done: false,
            detail: otherError[1],
        })
    }
    return checks
}

/** Something worth adding that the publish rule doesn't ask for. */
export type PublishSuggestion = { key: string; label: string; detail?: string }

/**
 * What the card still lacks among the things worth having: each translation (missing, or
 * machine-made or stale and so not reviewed, as it will be once saved), a source, and a
 * verified date (`card` is the saved card, if any). Empty when it has them all.
 */
export function publishSuggestions(values: CardFormValues, card?: Card): PublishSuggestion[] {
    const englishChanged =
        card !== undefined && values.text_en.trim() !== (card.translations.en?.text ?? '')
    const suggestions: PublishSuggestion[] = []
    for (const locale of translationLocales) {
        const state = statusOnSave({
            saved: card?.translations[locale],
            draft: translationDraft(values, locale),
            englishChanged,
        })
        const language = localeName[locale]
        if (state === 'missing') {
            suggestions.push({ key: locale, label: `${language} translation` })
        } else if (state === 'machine') {
            suggestions.push({
                key: locale,
                label: `Review the ${language} translation`,
                detail: 'Machine translated, not reviewed yet',
            })
        } else if (state === 'stale') {
            suggestions.push({
                key: locale,
                label: `Review the ${language} translation`,
                detail: 'The English changed since it was reviewed',
            })
        }
    }
    if (!values.source_url.trim()) suggestions.push({ key: 'source', label: 'Source' })
    if (!card?.verifiedAt) suggestions.push({ key: 'verified', label: 'Date verified' })
    return suggestions
}
