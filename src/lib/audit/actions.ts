// Every action the audit log records, in one list: the triggers' create/update/delete and the
// card lifecycle names (migrations 003700, 003800), role changes (004500), CSV imports (004800)
// and the app-written AI rows (#41, #42). `display.ts` labels each one; app code that writes a
// row through `record_audit` names its action with this type.

export const auditActions = [
    // Triggers on cards, categories and their translations
    'create',
    'update',
    'delete',
    // Card lifecycle and verification (the card trigger names these)
    'publish',
    'archive',
    'unarchive',
    'verify',
    'unverify',
    // People and roles
    'invite',
    'change_invite',
    'withdraw_invite',
    'grant',
    'change',
    'revoke',
    'accept_invite',
    // CSV import, one per card created
    'import',
    // AI calls and what the editor did with a suggestion
    'ai_translate',
    'ai_suggest_date',
    'accept_date_suggestion',
    'reject_date_suggestion',
] as const

export type AuditAction = (typeof auditActions)[number]

/** An AI call's action; every `ai_*` row counts towards the AI rate limit. */
export type AiAuditAction = Extract<AuditAction, `ai_${string}`>
