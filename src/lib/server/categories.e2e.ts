// The category repository against the local database (run through with-db.sh / CI's stack):
// category management (#44) through the module the categories page uses. Other tests run in
// parallel against the same database, so each test makes its own categories with unique names
// and only looks at those.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { localServiceClient, newPerson } from '../testing/e2e-auth'
import { historyOf } from './audit'
import { saveCard } from './cards'
import {
    categoriesByEnglishName,
    englishNameKey,
    deleteCategory,
    listCategories,
    reorderCategories,
    saveCategory,
    setCategoryArchived,
    type CategoryInput,
} from './categories'

const db = localServiceClient()

const input = (name: string, extra: Partial<CategoryInput> = {}): CategoryInput => ({
    icon: 'crown',
    colour: 'purple',
    names: { en: name },
    ...extra,
})

const unique = (label: string) => `${label} ${randomUUID().slice(0, 8)}`

async function find(id: string) {
    const all = await listCategories(db, { includeArchived: true })
    return all.find((category) => category.id === id)
}

test('an admin creates a category: last in the draw, with its names, look and an audit row', async () => {
    const admin = (await newPerson('admin')).id
    const name = unique('Royals')
    const before = await listCategories(db, { includeArchived: true })

    const id = await saveCategory(
        db,
        admin,
        input(name, { names: { en: name, sv: 'Kungligheter' } }),
    )

    const created = await find(id)
    const lastBefore = Math.max(...before.map((category) => category.position))
    expect(created?.position).toBeGreaterThan(lastBefore)
    expect(created).toMatchObject({
        name,
        names: { en: name, sv: 'Kungligheter' },
        icon: 'crown',
        colour: 'purple',
        archived: false,
        cardCount: 0,
    })
    const history = await historyOf(db, id)
    expect(history.map(({ entity, action, actorId }) => [entity, action, actorId])).toEqual(
        expect.arrayContaining([
            ['category', 'create', admin],
            ['category_translation', 'create', admin],
        ]),
    )
})

test('renaming per locale keeps English required and drops a cleared translation', async () => {
    const admin = (await newPerson('admin')).id
    const name = unique('Ships')
    const id = await saveCategory(db, admin, input(name, { names: { en: name, nb: 'Skip' } }))

    const renamed = unique('Vessels')
    await saveCategory(
        db,
        admin,
        input(renamed, { names: { en: renamed, sv: 'Fartyg', nb: '' } }),
        id,
    )

    expect((await find(id))?.names).toEqual({ en: renamed, sv: 'Fartyg' })
    await expect(saveCategory(db, admin, input('', { names: { en: ' ' } }), id)).rejects.toThrow(
        'A category needs an English name.',
    )
})

test('two categories cannot share an English name, whatever the case', async () => {
    const admin = (await newPerson('admin')).id
    const name = unique('Rivers')
    await saveCategory(db, admin, input(name))

    await expect(saveCategory(db, admin, input(` ${name.toUpperCase()} `))).rejects.toThrow(
        'Another category already has that English name.',
    )
})

test('CSV import finds a category by its English name, ignoring case and spaces', async () => {
    const admin = (await newPerson('admin')).id
    const name = unique('Mountains')
    const id = await saveCategory(db, admin, input(name))

    const byName = await categoriesByEnglishName(db)

    expect(byName.get(englishNameKey(`  ${name.toUpperCase()}`))?.id).toBe(id)
    expect(byName.get(englishNameKey('events'))?.name).toBe('Events')
})

test('reordering moves categories among their own positions and is audited', async () => {
    const admin = (await newPerson('admin')).id
    const a = await saveCategory(db, admin, input(unique('First')))
    const b = await saveCategory(db, admin, input(unique('Second')))
    const c = await saveCategory(db, admin, input(unique('Third')))
    const positions = async () =>
        Promise.all([a, b, c].map(async (id) => (await find(id))?.position))
    const held = await positions()

    await reorderCategories(db, admin, [c, a, b])

    expect(await positions()).toEqual([held[1], held[2], held[0]])
    expect((await historyOf(db, c))[0]).toMatchObject({
        entity: 'category',
        action: 'update',
        actorId: admin,
        before: { position: held[2] },
        after: { position: held[0] },
    })
})

test('archiving takes a category out of the draw list and unarchiving brings it back', async () => {
    const admin = (await newPerson('admin')).id
    const id = await saveCategory(db, admin, input(unique('Storms')))

    await setCategoryArchived(db, admin, id, true)
    expect((await listCategories(db)).some((category) => category.id === id)).toBe(false)
    expect(await find(id)).toMatchObject({ archived: true })

    await setCategoryArchived(db, admin, id, false)
    expect((await listCategories(db)).some((category) => category.id === id)).toBe(true)
    expect((await historyOf(db, id))[0]).toMatchObject({
        action: 'update',
        actorId: admin,
        after: { archived_at: null, archived_by: null },
    })
})

test('only a category without cards can be deleted', async () => {
    const admin = (await newPerson('admin')).id
    const full = await saveCategory(db, admin, input(unique('Harbours')))
    await saveCard(db, admin, {
        categoryId: full,
        date: { decade: 1960, year: null, month: null, day: null },
        sourceUrl: null,
        sourceQuote: null,
        translations: { en: { text: 'A made-up harbour opens' } },
    })
    const empty = await saveCategory(db, admin, input(unique('Lighthouses')))

    expect((await find(full))?.cardCount).toBe(1)
    await expect(deleteCategory(db, admin, full)).rejects.toThrow(
        'This category has cards, so it can only be archived, not deleted.',
    )
    await deleteCategory(db, admin, empty)

    expect(await find(full)).toBeDefined()
    expect(await find(empty)).toBeUndefined()
    expect((await historyOf(db, empty)).map(({ entity, action }) => [entity, action])).toEqual(
        expect.arrayContaining([
            ['category', 'delete'],
            ['category_translation', 'delete'],
        ]),
    )
})

test('editors cannot manage categories', async () => {
    const admin = (await newPerson('admin')).id
    const editor = (await newPerson('editor')).id
    const id = await saveCategory(db, admin, input(unique('Bridges')))
    const refused = 'Only admins can manage categories.'

    await expect(saveCategory(db, editor, input(unique('Tunnels')))).rejects.toThrow(refused)
    await expect(setCategoryArchived(db, editor, id, true)).rejects.toThrow(refused)
    await expect(reorderCategories(db, editor, [id])).rejects.toThrow(refused)
    await expect(deleteCategory(db, editor, id)).rejects.toThrow(refused)
})
