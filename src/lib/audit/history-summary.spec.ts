import { describe, expect, it } from 'vite-plus/test'
import { groupChanges, relativeTime, summarizeChange, type HistoryRecord } from './history-summary'

const cardId = '11111111-1111-4111-8111-111111111111'
const hein = '22222222-2222-4222-8222-222222222222'
const erik = '33333333-3333-4333-8333-333333333333'
const noNames = { categories: {}, people: {} }

let nextId = 1
const entry = (overrides: Partial<HistoryRecord>): HistoryRecord => ({
    id: nextId++,
    at: '2026-10-23T08:00:00.000Z',
    actorId: hein,
    entity: 'card',
    entityId: cardId,
    locale: null,
    action: 'update',
    before: null,
    after: null,
    ...overrides,
})

describe('groupChanges', () => {
    it('puts entries by one person at one moment together, keeping the order', () => {
        const textEntry = entry({ entity: 'card_translation', locale: 'en', action: 'create' })
        const cardEntry = entry({ action: 'create' })
        const publish = entry({ action: 'publish', at: '2026-10-23T09:00:00.000Z' })
        const byErik = entry({ actorId: erik, at: '2026-10-23T09:00:00.000Z' })

        const changes = groupChanges([byErik, publish, textEntry, cardEntry])

        expect(changes.map((change) => change.entries)).toEqual([
            [byErik],
            [publish],
            [textEntry, cardEntry],
        ])
        expect(changes[2]).toMatchObject({ at: '2026-10-23T08:00:00.000Z', actorId: hein })
    })
})

describe('summarizeChange', () => {
    const summary = (...entries: HistoryRecord[]) =>
        summarizeChange(groupChanges(entries)[0], noNames)

    it('names creating a card once, over the texts written with it', () => {
        expect(
            summary(
                entry({
                    entity: 'card_translation',
                    locale: 'en',
                    action: 'create',
                    after: { text: 'A kite' },
                }),
                entry({ action: 'create', after: { year: 1969 } }),
            ),
        ).toEqual({ action: 'Created', fields: [] })
    })

    it('lists the fields an edit changed, a translation’s with its language', () => {
        expect(
            summary(
                entry({
                    entity: 'card_translation',
                    locale: 'sv',
                    before: { text: 'En drake', status: null },
                    after: { text: 'En drake flyger', status: 'reviewed' },
                }),
                entry({ before: { year: 1969 }, after: { year: 1970 } }),
            ),
        ).toEqual({ action: 'Edited', fields: ['Swedish text', 'Swedish status', 'Year'] })
    })

    it('reads a first translation as an edit of the card', () => {
        expect(
            summary(
                entry({
                    entity: 'card_translation',
                    locale: 'nb',
                    action: 'create',
                    after: { text: 'En drage' },
                }),
            ),
        ).toEqual({ action: 'Edited', fields: ['Norwegian text'] })
    })

    it('names a step the app logged over the row writes it caused', () => {
        expect(
            summary(
                entry({
                    action: 'publish',
                    before: { status: 'draft' },
                    after: { status: 'published' },
                }),
            ),
        ).toEqual({ action: 'Published', fields: [] })
        expect(
            summary(
                entry({ action: 'ai_translate' }),
                entry({
                    entity: 'card_translation',
                    locale: 'sv',
                    action: 'create',
                    after: { text: 'En drake' },
                }),
            ),
        ).toEqual({ action: 'Machine translated with AI', fields: [] })
    })
})

describe('relativeTime', () => {
    const now = new Date('2026-10-23T12:00:00.000Z')
    const before = (ms: number) => new Date(now.getTime() - ms).toISOString()
    const minute = 60_000
    const hour = 60 * minute
    const day = 24 * hour

    it('says how long ago, then gives the date', () => {
        expect(relativeTime(before(20_000), now)).toBe('just now')
        expect(relativeTime(before(minute), now)).toBe('1 minute ago')
        expect(relativeTime(before(45 * minute), now)).toBe('45 minutes ago')
        expect(relativeTime(before(3 * hour), now)).toBe('3 hours ago')
        expect(relativeTime(before(30 * hour), now)).toBe('yesterday')
        expect(relativeTime(before(4 * day), now)).toBe('4 days ago')
        expect(relativeTime('2026-09-01T10:00:00.000Z', now)).toBe('1 Sept 2026')
    })

    it('leaves a time it cannot read as it is', () => {
        expect(relativeTime('not a time', now)).toBe('not a time')
    })
})
