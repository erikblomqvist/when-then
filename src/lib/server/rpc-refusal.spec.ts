import type { PostgrestError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vite-plus/test'
import { checkRpc, RpcRefusal } from './rpc-refusal'

const pgError = (message: string, more: Partial<PostgrestError> = {}) =>
    ({ message, details: '', hint: '', code: 'P0001', ...more }) as PostgrestError

class ThingError extends RpcRefusal {}

const refusals = {
    not_admin: 'Only admins can do things.',
    publish_blocked: (details: string) => details,
    things_name_key: 'Another thing already has that name.',
}

describe('checkRpc', () => {
    it('does nothing without an error', () => {
        expect(() => checkRpc(null, refusals, ThingError)).not.toThrow()
    })

    it('turns a refusal the table names into the error class, with its words and code', () => {
        let caught: unknown
        try {
            checkRpc(pgError('not_admin'), refusals, ThingError)
        } catch (error) {
            caught = error
        }
        expect(caught).toBeInstanceOf(ThingError)
        expect(caught).toMatchObject({
            code: 'not_admin',
            message: 'Only admins can do things.',
        })
    })

    it('words a refusal from the database detail when the table says so', () => {
        expect(() =>
            checkRpc(
                pgError('publish_blocked', { details: 'Add the English text.' }),
                refusals,
                ThingError,
            ),
        ).toThrow(new ThingError('publish_blocked', 'Add the English text.'))
    })

    it('names a unique violation by its constraint', () => {
        expect(() =>
            checkRpc(
                pgError('duplicate key value violates unique constraint "things_name_key"', {
                    code: '23505',
                }),
                refusals,
                ThingError,
            ),
        ).toThrow(ThingError)
    })

    it('rethrows anything else as a plain error', () => {
        let caught: unknown
        try {
            checkRpc(pgError('something broke', { code: 'XX000' }), refusals, ThingError)
        } catch (error) {
            caught = error
        }
        expect(caught).not.toBeInstanceOf(RpcRefusal)
        expect(caught).toMatchObject({ message: 'something broke' })
    })
})
