// Which cards a bulk action in the card list acts on: cards the editor picked one by one, or
// every card matching the list's filter ("select all matching"), however many pages that is.
// Bulk actions (publish, archive, move, and later export and machine translation) all take a
// `CardSelection`; the server turns it into card ids with `resolveCardSelection`
// (`#lib/server/card-selection.js`), so "all matching" means the matching cards at the moment
// the action runs.
//
// In a form the selection travels as fields prefixed `selection`, so it can't clash with the
// action's own fields (e.g. the target category of a move).

import { filterParams, parseFilter, type CardFilter } from './card-list'

export type CardSelection =
    | { kind: 'cards'; ids: string[] }
    | { kind: 'matching'; filter: CardFilter }

const prefix = 'selection.'
const cardField = `${prefix}card`
const matchingField = `${prefix}matching`

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/** The selection as form fields `[name, value]`, for hidden inputs in a bulk action's form. */
export function selectionFields(selection: CardSelection): [string, string][] {
    if (selection.kind === 'cards') return selection.ids.map((id) => [cardField, id])
    return [
        [matchingField, 'yes'],
        ...[...filterParams(selection.filter)].map(([name, value]): [string, string] => [
            prefix + name,
            value,
        ]),
    ]
}

/** The selection a bulk action's form posted, or null when it selects no card. */
export function readCardSelection(form: FormData): CardSelection | null {
    if (form.get(matchingField) === 'yes') {
        const params = new URLSearchParams()
        for (const [name, value] of form) {
            if (name.startsWith(prefix) && typeof value === 'string') {
                params.append(name.slice(prefix.length), value)
            }
        }
        return { kind: 'matching', filter: parseFilter(params) }
    }
    const ids = new Set<string>()
    for (const value of form.getAll(cardField)) {
        if (typeof value === 'string' && uuid.test(value)) ids.add(value.toLowerCase())
    }
    return ids.size > 0 ? { kind: 'cards', ids: [...ids] } : null
}
