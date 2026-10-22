import { describe, expect, it } from 'vite-plus/test'
import { readCardSelection, selectionFields, type CardSelection } from './card-selection'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const category = '33333333-3333-4333-8333-333333333333'

const form = (fields: [string, string][]) => {
    const data = new FormData()
    for (const [name, value] of fields) data.append(name, value)
    return data
}

const roundTrip = (selection: CardSelection) => readCardSelection(form(selectionFields(selection)))

describe('card selection in a form', () => {
    it('round-trips picked cards', () => {
        expect(roundTrip({ kind: 'cards', ids: [a, b] })).toEqual({ kind: 'cards', ids: [a, b] })
    })

    it('round-trips every card matching a filter', () => {
        const selection: CardSelection = {
            kind: 'matching',
            filter: { search: 'Sample', status: 'draft', categoryId: category, verified: false },
        }
        expect(roundTrip(selection)).toEqual(selection)
    })

    it('round-trips every card when the filter is empty', () => {
        expect(roundTrip({ kind: 'matching', filter: {} })).toEqual({
            kind: 'matching',
            filter: {},
        })
    })

    it('keeps the filter away from other fields of the same form', () => {
        const fields = selectionFields({ kind: 'matching', filter: { categoryId: category } })
        expect(fields.every(([name]) => name.startsWith('selection'))).toBe(true)
        const data = form([...fields, ['category', b]])
        expect(readCardSelection(data)).toEqual({
            kind: 'matching',
            filter: { categoryId: category },
        })
    })

    it('drops ids that are not card ids, and duplicates', () => {
        expect(
            readCardSelection(
                form([
                    ['selection.card', a],
                    ['selection.card', 'x'],
                    ['selection.card', a],
                ]),
            ),
        ).toEqual({ kind: 'cards', ids: [a] })
    })

    it('is nothing when no card is picked', () => {
        expect(readCardSelection(form([]))).toBeNull()
        expect(readCardSelection(form([['selection.card', 'nope']]))).toBeNull()
    })
})
