import { describe, expect, it } from 'vite-plus/test'
import { auditLogHref, readAuditLogQuery } from './query'

const actor = '11111111-1111-4111-8111-111111111111'
const read = (search: string) => readAuditLogQuery(new URLSearchParams(search))

describe('readAuditLogQuery', () => {
    it('reads the filters and a cursor from the address', () => {
        expect(read(`actor=${actor}&entity=card&action=update&before=120`)).toEqual({
            filters: { actor, entity: 'card', action: 'update' },
            before: 120,
            after: undefined,
        })
        expect(read('after=7').after).toBe(7)
    })

    it('ignores empty, malformed and unsafe values', () => {
        expect(read('actor=not-a-uuid&entity=&action=&before=12x&after=-3')).toEqual({
            filters: {},
            before: undefined,
            after: undefined,
        })
    })
})

describe('auditLogHref', () => {
    it('keeps the filters and sets one cursor', () => {
        expect(auditLogHref({ actor, action: 'update' }, { before: 40 })).toBe(
            `/admin/audit?actor=${actor}&action=update&before=40`,
        )
        expect(auditLogHref({ entity: 'card' }, { after: 41 })).toBe(
            '/admin/audit?entity=card&after=41',
        )
        expect(auditLogHref({})).toBe('/admin/audit')
    })
})
