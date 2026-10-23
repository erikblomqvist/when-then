// The countries a host can leave country-specific cards out for (`#lib/cards/country.js`), with
// their names in the player's language, for the lobby settings.

import { cardCountries } from '#lib/cards/country.js'
import { m } from '#lib/paraglide/messages.js'

export const gameCountries = cardCountries

const countryWords: Record<(typeof cardCountries)[number], () => string> = {
    SE: m.country_se,
    NO: m.country_no,
}

/** The country's name in the current locale, or its code for one the game doesn't name. */
export const countryLabel = (code: string) =>
    code in countryWords ? countryWords[code as keyof typeof countryWords]() : code
