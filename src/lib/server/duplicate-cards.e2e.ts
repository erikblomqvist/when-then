// Suspected duplicates against the local database (run through with-db.sh / CI's stack): the
// same English text, case, punctuation and spacing aside, never an archived card; the card
// list's filter; and the nearby cards "Add from photo" asks the AI about.

import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { localServiceClient, newPerson } from '../testing/e2e-auth'
import { archiveCard } from './card-lifecycle'
import { matchingCardIds, saveCard } from './cards'
import { listCategories } from './categories'
import { cardsWithSameText, suspectedDuplicates } from './duplicate-cards'
import { findNearbyCards } from './photo-import'

const db = localServiceClient()

async function cardMaker() {
    const actor = (await newPerson()).id
    const [category] = await listCategories(db)
    return (text: string, year = 1895) =>
        saveCard(db, actor, {
            categoryId: category.id,
            date: { decade: Math.floor(year / 10) * 10, year, month: null, day: null },
            sourceUrl: null,
            sourceQuote: null,
            translations: { en: { text } },
        })
}

test('finds the cards with the same text, case, punctuation and spacing aside', async () => {
    const card = await cardMaker()
    const tag = randomUUID().slice(0, 8)
    const first = await card(`A made-up bomb is dropped on Hiroshima ${tag}`)
    const second = await card(`a made-up bomb is dropped on “Hiroshima” ${tag}.`)
    const archived = await card(`A made-up bomb is dropped on Hiroshima ${tag}!`)
    await archiveCard(db, (await newPerson()).id, archived)

    const [same, none] = await cardsWithSameText(db, [
        `A MADE-UP bomb  is dropped on Hiroshima ${tag}`,
        `A made-up bomb is dropped on Nagasaki ${tag}`,
    ])
    // Oldest first; the archived one never counts.
    expect(same.map(({ id }) => id)).toEqual([first, second])
    expect(none).toEqual([])

    // The card being edited is left out.
    const [others] = await cardsWithSameText(
        db,
        [`A made-up bomb is dropped on Hiroshima ${tag}`],
        first,
    )
    expect(others.map(({ id }) => id)).toEqual([second])
})

test('a batch about to be created: repeats of existing cards and of earlier texts', async () => {
    const card = await cardMaker()
    const tag = randomUUID().slice(0, 8)
    const existing = await card(`A made-up ferry sails ${tag}`)

    const found = await suspectedDuplicates(db, [
        `A made-up ferry sails ${tag}`,
        `A made-up kite flies ${tag}`,
        '',
        `A made-up kite flies, ${tag}`,
    ])
    expect(found).toEqual([
        { cards: [{ id: existing, text: `A made-up ferry sails ${tag}` }], earlier: null },
        null,
        null,
        { cards: [], earlier: 1 },
    ])
})

test('the list filters to suspected duplicates, leaving out a card whose twin is archived', async () => {
    const card = await cardMaker()
    const tag = randomUUID().slice(0, 8)
    const kite = await card(`A made-up kite flies ${tag}`)
    const kiteAgain = await card(`A made-up kite flies ${tag}.`)
    const raft = await card(`A made-up raft floats ${tag}`)
    const raftAgain = await card(`A made-up raft floats ${tag}`)
    await archiveCard(db, (await newPerson()).id, raftAgain)
    await card(`A made-up canoe sinks ${tag}`)

    const ids = await matchingCardIds(db, { search: tag, duplicates: true })
    expect(ids.toSorted()).toEqual([kite, kiteAgain].toSorted())
    expect(ids).not.toContain(raft)
})

test('the nearby cards for the AI check: within two years, closest first per year', async () => {
    const card = await cardMaker()
    // A year few other cards have (other runs' cards may share it, so only what must hold).
    const year = 1005 + Math.floor(Math.random() * 40) * 10
    const at = await card(`A made-up tablet is carved ${randomUUID()}`, year)
    const nextYear = await card(`A made-up tablet is copied ${randomUUID()}`, year + 1)
    const twoLater = await card(`A made-up tablet breaks ${randomUUID()}`, year + 2)
    const tooLate = await card(`A made-up tablet is found ${randomUUID()}`, year + 3)

    const near = (await findNearbyCards(db, [year])).map(({ id }) => id)
    expect(near).toEqual(expect.arrayContaining([at, nextYear, twoLater]))
    expect(near).not.toContain(tooLate)

    // One per year: the closest, a card from that very year.
    const { data } = await db.rpc('cards_near_years', { years: [year], per_year: 1 })
    expect(data?.map((row) => row.year)).toEqual([year])
})
