import { describe, expect, it } from 'vite-plus/test'
import {
    actionLabel,
    detailItems,
    entityHref,
    entityLabel,
    fieldChanges,
    formatTime,
    humanize,
    type AuditRecord,
} from './display'
import { auditActions } from './actions'

const cardId = '11111111-1111-4111-8111-111111111111'
const noNames = { categories: {}, people: {} }

const entry = (overrides: Partial<AuditRecord>): AuditRecord => ({
    entity: 'card',
    entityId: cardId,
    locale: null,
    action: 'update',
    before: null,
    after: null,
    ...overrides,
})

describe('fieldChanges', () => {
    it('lists only the fields an update changed, with readable labels', () => {
        const changes = fieldChanges(
            entry({
                before: { id: cardId, year: 1969, month: 7, source_url: 'https://example.com/a' },
                after: { id: cardId, year: 1969, month: null, source_url: 'https://example.com/b' },
            }),
            noNames,
        )
        expect(changes).toEqual([
            { field: 'month', label: 'Month', before: 'July', after: null },
            {
                field: 'source_url',
                label: 'Source URL',
                before: 'https://example.com/a',
                after: 'https://example.com/b',
            },
        ])
    })

    it('a created translation lists what it set, without its card, locale or bookkeeping', () => {
        const changes = fieldChanges(
            entry({
                entity: 'card_translation',
                locale: 'sv',
                action: 'create',
                after: {
                    card_id: cardId,
                    locale: 'sv',
                    text: 'En påhittad händelse',
                    note: null,
                    status: 'machine',
                    created_at: '2026-10-22T10:00:00Z',
                    updated_by: '22222222-2222-4222-8222-222222222222',
                },
            }),
            noNames,
        )
        expect(changes).toEqual([
            { field: 'text', label: 'Text', before: null, after: 'En påhittad händelse' },
            { field: 'status', label: 'Status', before: null, after: 'Machine' },
        ])
    })

    it('a deleted row lists what it had', () => {
        const changes = fieldChanges(entry({ action: 'delete', before: { id: cardId, day: 4 } }))
        expect(changes).toEqual([{ field: 'day', label: 'Day', before: '4', after: null }])
    })

    it('shows category names, people and BC dates instead of raw values', () => {
        const categoryId = '33333333-3333-4333-8333-333333333333'
        const personId = '44444444-4444-4444-8444-444444444444'
        const changes = fieldChanges(
            entry({
                before: { category_id: null, year: 1492, decade: 1490, verified_by: null },
                after: { category_id: categoryId, year: -44, decade: -49, verified_by: personId },
            }),
            { categories: { [categoryId]: 'Events' }, people: { [personId]: 'ada@example.com' } },
        )
        expect(changes.map(({ label, before, after }) => [label, before, after])).toEqual([
            ['Category', null, 'Events'],
            ['Year', '1492', '44 BC'],
            ['Decade', '1490s', '40s BC'],
            ['Verified by', null, 'ada@example.com'],
        ])
    })

    it('renders fields and values it does not know', () => {
        const changes = fieldChanges(
            entry({ before: { reading_level: null }, after: { reading_level: { min: 2 } } }),
        )
        expect(changes).toEqual([
            { field: 'reading_level', label: 'Reading level', before: null, after: '{"min":2}' },
        ])
    })
})

describe('labels', () => {
    it('names known actions and humanizes new ones', () => {
        expect(actionLabel('update')).toBe('Edited')
        expect(actionLabel('revoke')).toBe('Revoked role')
        expect(actionLabel('ai_suggestion_accepted')).toBe('Ai suggestion accepted')
    })

    it('names a CSV import', () => {
        expect(actionLabel('import')).toBe('Imported from CSV')
    })

    it('gives every action something writes its own label', () => {
        const humanized = auditActions.filter((action) => actionLabel(action) === humanize(action))
        expect(humanized).toEqual([])
    })

    it('names entities with their language, and humanizes new ones', () => {
        expect(entityLabel('card')).toBe('Card')
        expect(entityLabel('card_translation', 'nb')).toBe('Card text (Norwegian)')
        expect(entityLabel('csv_import')).toBe('Csv import')
    })

    it('links cards and their translations to the card', () => {
        expect(entityHref('card_translation', cardId)).toBe(`/admin/cards/${cardId}`)
        expect(entityHref('role_invite', 'ada@example.com')).toBeNull()
    })

    it('formats times in UTC', () => {
        expect(formatTime('2026-10-22T14:05:00Z')).toBe('22 Oct 2026, 14:05 UTC')
    })
})

describe('detailItems', () => {
    it('lists the details of an app-written entry, whatever they are', () => {
        expect(
            detailItems({ model: 'claude-sonnet-5-5', cost_usd: 0.0042, cached: false }),
        ).toEqual([
            { label: 'Model', value: 'claude-sonnet-5-5' },
            { label: 'Cost', value: '$0.0042' },
            { label: 'Cached', value: 'No' },
        ])
        expect(detailItems(['a', 'b'])).toEqual([{ label: 'Details', value: 'a, b' }])
        expect(detailItems(null)).toEqual([])
    })

    it('reads an AI call: the action, its outcome, languages and cost in dollars', () => {
        expect(actionLabel('ai_translate')).toBe('Machine translated with AI')
        expect(
            detailItems({
                outcome: 'ok',
                model: 'claude-opus-5-5',
                input_tokens: 500,
                output_tokens: 100,
                cost_usd: 0.004,
                locales: ['sv', 'nb'],
            }),
        ).toEqual([
            { label: 'Outcome', value: 'Ok' },
            { label: 'Model', value: 'claude-opus-5-5' },
            { label: 'Input tokens', value: '500' },
            { label: 'Output tokens', value: '100' },
            { label: 'Cost', value: '$0.004' },
            { label: 'Languages', value: 'Swedish, Norwegian' },
        ])
    })
})
