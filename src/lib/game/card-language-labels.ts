// The name of each card language (`#lib/cards/card.js`), in the player's language, for the
// lobby settings.

import type { CardLocale } from '#lib/cards/card.js'
import { m } from '#lib/paraglide/messages.js'

const languageWords: Record<CardLocale, () => string> = {
    en: m.card_language_en,
    sv: m.card_language_sv,
    nb: m.card_language_nb,
}

/** The card language's name, in the current locale. */
export const cardLanguageLabel = (locale: CardLocale) => languageWords[locale]()
