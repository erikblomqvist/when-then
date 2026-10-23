// Country-specific cards (`cards.country_specific`): a card whose answer takes knowledge so
// local you almost had to grow up in the country, by its ISO 3166-1 alpha-2 code. Not every
// card about Sweden is Sweden-specific: only what a Swede knows and others don't. Any code is
// kept; the admin offers the countries the game is played in.

export const cardCountries = ['SE', 'NO'] as const

const countryNames: Record<string, string> = { SE: 'Sweden', NO: 'Norway' }

/** A country's English name, or its code when it isn't one the admin offers. */
export const countryName = (code: string) => countryNames[code] ?? code

/** An ISO 3166-1 alpha-2 code, as the database takes it. */
export const isCountryCode = (value: unknown): value is string =>
    typeof value === 'string' && /^[A-Z]{2}$/.test(value)
