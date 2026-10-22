/**
 * A thrown value as text for the server log. Supabase hands back errors as plain objects
 * (`{ message, code, details, hint }`), which the default logging prints as `[object Object]`.
 */
export function describeError(error: unknown): string {
    if (error instanceof Error) return error.stack ?? `${error.name}: ${error.message}`
    try {
        return JSON.stringify(error) ?? String(error)
    } catch {
        return String(error)
    }
}
