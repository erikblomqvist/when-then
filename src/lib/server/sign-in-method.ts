// How a session signed in decides whether the admin accepts it. Production only knows Google:
// email/password sign-up stays on (the e2e helper needs the email provider), and with
// confirmations off anyone could make a password account with an invited person's email,
// which Supabase may later link to that person's Google identity. So a password session
// is accepted only against the local stack, where e2e signs in that way.

/** Whether a Supabase URL is the stack on this machine (`localhost` or `127.0.0.1`). */
export function isLocalSupabase(url: string | undefined): boolean {
    if (!url) return false
    try {
        const { hostname } = new URL(url)
        return hostname === '127.0.0.1' || hostname === 'localhost'
    } catch {
        return false
    }
}

/** The sign-in methods in the JWT's `amr` claim. Only decodes: validate the session first. */
function signInMethods(accessToken: string): string[] {
    const payload = accessToken.split('.')[1]
    if (!payload) return []
    try {
        const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
        const amr = claims && typeof claims === 'object' && 'amr' in claims ? claims.amr : null
        if (!Array.isArray(amr)) return []
        return amr.flatMap((entry: unknown) =>
            entry &&
            typeof entry === 'object' &&
            'method' in entry &&
            typeof entry.method === 'string'
                ? [entry.method]
                : [],
        )
    } catch {
        return []
    }
}

/**
 * Whether the admin accepts a validated session with this access token: signed in with
 * Google (OAuth) on any stack, or with a password only on the local stack (`supabaseUrl`).
 * Anything else counts as signed out.
 */
export function acceptsAdminSession(accessToken: string, supabaseUrl: string | undefined): boolean {
    const methods = signInMethods(accessToken)
    if (methods.includes('oauth')) return true
    return methods.includes('password') && isLocalSupabase(supabaseUrl)
}
