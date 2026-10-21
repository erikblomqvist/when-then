import { describe, expect, it } from 'vite-plus/test'
import { moveItem, parseCategoryForm } from './category-form'

const form = (fields: Record<string, string>) => {
    const data = new FormData()
    for (const [name, value] of Object.entries(fields)) data.set(name, value)
    return data
}

describe('parseCategoryForm', () => {
    it('reads the look and the names, trimmed, with blank translations cleared', () => {
        const parsed = parseCategoryForm(
            form({
                icon: 'crown',
                colour: 'purple',
                name_en: ' Royals ',
                name_sv: '',
                name_nb: 'Kongelige',
            }),
        )

        expect(parsed).toEqual({
            input: {
                icon: 'crown',
                colour: 'purple',
                names: { en: 'Royals', sv: null, nb: 'Kongelige' },
            },
        })
    })

    it('asks for an English name and a known icon and colour, keeping what was typed', () => {
        const parsed = parseCategoryForm(
            form({ icon: 'skull', colour: 'black', name_en: '  ', name_sv: 'Kungligheter' }),
        )

        expect(parsed).toEqual({
            errors: {
                name_en: 'Enter an English name.',
                icon: 'Pick an icon.',
                colour: 'Pick a colour.',
            },
            values: {
                icon: 'skull',
                colour: 'black',
                name_en: '  ',
                name_sv: 'Kungligheter',
                name_nb: '',
            },
        })
    })
})

describe('moveItem', () => {
    const order = ['a', 'b', 'c', 'd']

    it('moves an item down, to the place of the one it was dropped on', () => {
        expect(moveItem(order, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    })

    it('moves an item up', () => {
        expect(moveItem(order, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    })

    it('leaves the order alone for a drop in place or out of range', () => {
        expect(moveItem(order, 1, 1)).toEqual(order)
        expect(moveItem(order, 1, 9)).toEqual(order)
        expect(moveItem(order, -1, 0)).toEqual(order)
    })
})
