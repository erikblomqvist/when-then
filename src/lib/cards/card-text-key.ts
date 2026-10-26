// A card's English text for comparing, as `public.card_text_key` in the database does it: lower
// case, punctuation and runs of spacing as one space. The database compares against saved
// cards; this compares the texts of one batch (a CSV file, a photo's candidates) with each
// other, before any of them is saved.

export const cardTextKey = (text: string) =>
    text
        .toLowerCase()
        .replace(/[\p{P}\p{S}\s]+/gu, ' ')
        .trim()

/** Per text: the index of an earlier text in the list that is the same, or null. */
export function earlierSameText(texts: readonly string[]): (number | null)[] {
    const first = new Map<string, number>()
    return texts.map((text, index) => {
        const key = cardTextKey(text)
        if (!key) return null
        const earlier = first.get(key)
        if (earlier !== undefined) return earlier
        first.set(key, index)
        return null
    })
}
