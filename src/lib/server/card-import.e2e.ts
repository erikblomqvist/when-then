// CSV import (#48) through the repository against the local database (run through
// with-db.sh / CI's stack): rows become drafts with reviewed translations and tags, each
// logged as an import, and only admins may import.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { planCardImport, type ImportRow } from '../cards/card-import'
import { localServiceClient } from '../testing/e2e-auth'
import { historyOf } from './audit'
import { getCard } from './cards'
import { categoriesByEnglishName } from './categories'
import { importCards } from './card-import'

const db = localServiceClient()

async function newPerson(role: 'admin' | 'editor') {
    const { data, error } = await db.auth.admin.createUser({
        email: `${role}-${randomUUID()}@example.com`,
        email_confirm: true,
    })
    if (error) throw error
    const inserted = await db.from('user_roles').insert({ user_id: data.user.id, role })
    if (inserted.error) throw inserted.error
    return data.user.id
}

async function planned(csv: string): Promise<ImportRow[]> {
    const plan = planCardImport(csv, await categoriesByEnglishName(db, { includeArchived: true }))
    if (!plan.ok) throw new Error(plan.error)
    return plan.rows
}

const header = 'text_en,decade,year,month,day,category,source_url,source_quote,text_sv,text_nb,tags'

test('valid rows become drafts with reviewed translations, each logged as an import', async () => {
    const admin = await newPerson('admin')
    const tag = `Import${randomUUID().slice(0, 8)}`
    const rows = await planned(
        [
            header,
            `A made-up canal opens ${tag},,1822,5,,Events,https://example.com/canal,Opened in May,En påhittad kanal öppnas,En oppdiktet kanal åpner,canals; ${tag}`,
            `,,1822,,,Events,,,,,`,
            `Made-up Sampleby walls rise ${tag},-49,,,,places,,,,,`,
        ].join('\r\n'),
    )

    const created = await importCards(db, admin, rows, { fileName: 'cards.csv' })

    expect(created.map((card) => card.row)).toEqual([1, 3])
    const [canal, walls] = await Promise.all(created.map((card) => getCard(db, card.id)))
    expect(canal).toMatchObject({
        status: 'draft',
        date: { decade: 1820, year: 1822, month: 5, day: null },
        sourceUrl: 'https://example.com/canal',
        sourceQuote: 'Opened in May',
        translations: {
            en: { text: `A made-up canal opens ${tag}`, status: 'reviewed' },
            sv: { text: 'En påhittad kanal öppnas', status: 'reviewed' },
            nb: { text: 'En oppdiktet kanal åpner', status: 'reviewed' },
        },
    })
    expect(walls).toMatchObject({
        status: 'draft',
        date: { decade: -49, year: null, month: null, day: null },
    })
    const tags = await db.from('cards').select('tags').eq('id', created[0]!.id).single()
    expect(tags.data?.tags).toEqual(['canals', tag])

    const history = await historyOf(db, created[0]!.id)
    const imported = history.filter((entry) => entry.action === 'import')
    expect(imported).toHaveLength(1)
    expect(imported[0]).toMatchObject({
        actorId: admin,
        entity: 'card',
        entityId: created[0]!.id,
        details: { file: 'cards.csv', row: 1 },
    })
})

test('an editor cannot import, and nothing is written', async () => {
    const editor = await newPerson('editor')
    const tag = `Import${randomUUID().slice(0, 8)}`
    const rows = await planned(`${header}\r\nA made-up mill turns ${tag},,1822,,,Events,,,,,`)

    await expect(importCards(db, editor, rows, { fileName: 'cards.csv' })).rejects.toThrow(
        'Only admins can import cards.',
    )
    const found = await db
        .from('card_translations')
        .select('card_id')
        .eq('text', `A made-up mill turns ${tag}`)
    expect(found.data).toEqual([])
})
