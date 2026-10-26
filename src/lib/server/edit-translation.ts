// Editing one translation in place, from the card list's review mode (`public.edit_translation`,
// migration `20261026120000_edit_translation.sql`). The edit saves the text as reviewed, as an
// edit in the editor does, and is refused when the translation changed since the list loaded.

import type { TranslationLocale } from '../cards/translation'
import { checkRpc, RpcRefusal, type Refusals } from './rpc-refusal'
import type { Db } from './supabase'

export type EditTranslationErrorCode = 'invalid_locale' | 'empty_text' | 'not_found' | 'changed'

// The database words every refusal itself, in the detail.
const inItsWords = (details: string) => details
const refusals = {
    invalid_locale: inItsWords,
    empty_text: inItsWords,
    not_found: inItsWords,
    changed: inItsWords,
} satisfies Record<EditTranslationErrorCode, unknown> & Refusals

/** A refused edit; `message` says why, in a sentence the list can show. */
export class EditTranslationError extends RpcRefusal {
    declare readonly code: EditTranslationErrorCode
}

/**
 * Saves the card's translation in `locale` as `text`, reviewed. `was` is the text the edit
 * started from (null: there was none); a translation that no longer matches it is refused.
 */
export async function editTranslation(
    db: Db,
    actorId: string,
    edit: { cardId: string; locale: TranslationLocale; text: string; was: string | null },
): Promise<void> {
    const { error } = await db.rpc('edit_translation', {
        actor: actorId,
        card_id: edit.cardId,
        locale: edit.locale,
        text: edit.text,
        ...(edit.was === null ? {} : { was: edit.was }),
    })
    checkRpc(error, refusals, EditTranslationError)
}
