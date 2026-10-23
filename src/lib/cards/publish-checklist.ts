// What the card editor shows before Publish: every requirement of the publish rule (and the
// form), always the same list, each ticked off once the form as typed meets it, and after it
// the things worth having that aren't required (translations, a source, a verified date),
// ticked off the same way. Publish is offered when every requirement is done.

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

/** Something worth having that the publish rule doesn't ask for, and whether the card has it. */
export type PublishSuggestion = { key: string; label: string; done: boolean; detail?: string }

/**
 * The things worth having, always the same list, each ticked off once the card has it: each
 * translation, reviewed (as it will be once saved; a machine-made or stale one is there but
 * open, saying why), a source, and a verified date (`card` is the saved card, if any).
 */
export function publishSuggestions(values: CardFormValues, card?: Card): PublishSuggestion[] {
    const englishChanged =
        card !== undefined && values.text_en.trim() !== (card.translations.en?.text ?? '')
    const translations = translationLocales.map((locale): PublishSuggestion => {
        const state = statusOnSave({
            saved: card?.translations[locale],
            draft: translationDraft(values, locale),
            englishChanged,
        })
        const detail =
            state === 'machine'
                ? 'Machine translated, not reviewed yet'
                : state === 'stale'
                  ? 'The English changed since it was reviewed'
                  : undefined
        return {
            key: locale,
            label: `${localeName[locale]} translation`,
            done: state === 'reviewed',
            detail,
        }
    })
    return [
        ...translations,
        { key: 'source', label: 'Source link for the date', done: values.source_url.trim() !== '' },
        { key: 'verified', label: 'Date verified', done: Boolean(card?.verifiedAt) },
    ]
}
