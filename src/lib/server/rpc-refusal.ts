// The admin rpcs refuse on purpose with `raise exception '<code>' using detail = '<reason>'`
// (P0001: the code is the message). Each repository keeps a table of the codes it expects and
// the words its page shows, and `checkRpc` turns a refusal into that repository's error class;
// anything else is a real failure and is rethrown as a plain Error.

import type { PostgrestError } from '@supabase/supabase-js'

/** A refusal the database raised on purpose; `message` is fit to show the admin. */
export class RpcRefusal extends Error {
    constructor(
        readonly code: string,
        message: string,
        options?: ErrorOptions,
    ) {
        super(message, options)
        this.name = new.target.name
    }
}

/**
 * Refusal code → the words to show, or a function of the database's detail when the reason
 * comes from there (the publish rule's blockers). A unique violation is keyed by its
 * constraint's name.
 */
export type Refusals = Readonly<Record<string, string | ((details: string) => string)>>

type RefusalClass = new (code: string, message: string, options?: ErrorOptions) => RpcRefusal

const constraintOf = (error: PostgrestError) =>
    error.code === '23505' ? /constraint "([^"]+)"/.exec(error.message)?.[1] : undefined

/** Throws `Refusal` for a refusal in `refusals`, a plain Error for any other error. */
export function checkRpc(
    error: PostgrestError | null,
    refusals: Refusals,
    Refusal: RefusalClass,
): void {
    if (!error) return
    const code = constraintOf(error) ?? error.message
    const words = Object.hasOwn(refusals, code) ? refusals[code] : undefined
    if (words === undefined) throw new Error(error.message, { cause: error })
    const message = typeof words === 'function' ? words(error.details || code) : words
    throw new Refusal(code, message, { cause: error })
}
