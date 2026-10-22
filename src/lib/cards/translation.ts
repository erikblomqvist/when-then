// A card's translations (sv, nb) as the editor's locale tabs work with them: what a tab holds
// before it is saved (a draft), and which status the save gives it.
//
// The database decides the status when the card is saved (`public.save_card`); `statusOnSave`
// mirrors its rules so a tab can show what will happen. The form posts a status only when a
// person ticked "reviewed" or the text is a machine translation left as it is
// (`postedStatus`); otherwise the database works it out from what changed:
//
// - no text: the translation is missing (a saved one is removed)
// - ticked reviewed: reviewed
// - the machine's text, untouched: machine
// - new or edited text: reviewed (editing counts as review; a note alone does not)
// - otherwise the saved status stays, except that a reviewed translation turns stale when the
//   English text changes in the same save.

import type { CardLocale, Translation, TranslationStatus } from './card'

/** The card languages that are translations of the English. */
export const translationLocales = ['sv', 'nb'] as const satisfies readonly CardLocale[]
export type TranslationLocale = (typeof translationLocales)[number]

export const localeName: Record<CardLocale, string> = {
    en: 'English',
    sv: 'Swedish',
    nb: 'Norwegian',
}

/** A translation's state in one locale: its status, or missing when there is none. */
export type TranslationState = TranslationStatus | 'missing'
export const translationStates: readonly TranslationState[] = [
    'missing',
    'machine',
    'reviewed',
    'stale',
]
export const translationStateLabel: Record<TranslationState, string> = {
    missing: 'Missing',
    machine: 'Machine',
    reviewed: 'Reviewed',
    stale: 'Stale',
}

/** What a locale tab holds before it is saved. */
export type TranslationDraft = {
    text: string
    note: string
    /** The person ticked "reviewed". */
    reviewed: boolean
    /** The text a machine translation filled in, to tell it apart from a person's edit. */
    machineText: string | null
}

/** A tab's starting point: the saved translation, or an empty tab. */
export const draftFromTranslation = (
    saved: { text: string; note?: string | null } | undefined,
): TranslationDraft => ({
    text: saved?.text ?? '',
    note: saved?.note ?? '',
    reviewed: false,
    machineText: null,
})

/** The draft after a machine translation filled it (unsaved; marked machine until reviewed). */
export const fillMachineTranslation = (
    draft: TranslationDraft,
    text: string,
): TranslationDraft => ({
    ...draft,
    text,
    reviewed: false,
    machineText: text,
})

const isMachineText = (draft: TranslationDraft) =>
    draft.machineText !== null && draft.text.trim() === draft.machineText.trim()

/** The status the form sends with the translation, when the database can't tell by itself. */
export function postedStatus(draft: TranslationDraft): TranslationStatus | undefined {
    if (draft.reviewed) return 'reviewed'
    if (isMachineText(draft)) return 'machine'
    return undefined
}

/** The state the tab will have once saved. */
export function statusOnSave({
    saved,
    draft,
    englishChanged,
}: {
    saved?: Translation
    draft: TranslationDraft
    englishChanged: boolean
}): TranslationState {
    if (!draft.text.trim()) return 'missing'
    const posted = postedStatus(draft)
    if (posted) return posted
    if (!saved || saved.text !== draft.text.trim()) return 'reviewed'
    if (saved.status === 'reviewed' && englishChanged) return 'stale'
    return saved.status
}
