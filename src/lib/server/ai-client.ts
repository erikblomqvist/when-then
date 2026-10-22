// The real model client and ledger for `callModel` (`./ai`). The only module that reads the
// Anthropic key, so the key stays on the server (private env, `src/lib/server`).

import Anthropic from '@anthropic-ai/sdk'
import { ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL } from '$app/env/private'
import { AiUnavailableError, type AiDeps, type CreateMessage } from './ai'
import { dbLedger } from './ai-ledger'
import { supabaseService } from './supabase'

let client: Anthropic | undefined

/** Sends Messages requests with the server's key; `AiUnavailableError` when none is set. */
export function aiClient(): CreateMessage {
    if (!ANTHROPIC_API_KEY) {
        throw new AiUnavailableError(
            'AI help is off: ANTHROPIC_API_KEY is not set on the server (see src/env.ts).',
        )
    }
    client ??= new Anthropic({
        apiKey: ANTHROPIC_API_KEY,
        baseURL: ANTHROPIC_BASE_URL ?? null,
        timeout: 60_000,
    })
    const anthropic = client
    return (params) => anthropic.beta.messages.create(params)
}

/** `callModel` dependencies for a request: the real client and the audit-log ledger. */
export const aiDeps = (): AiDeps => ({
    createMessage: aiClient(),
    ledger: dbLedger(supabaseService()),
})
