// Playwright's global setup (playwright.config.ts): before any e2e test, checks that the LOCAL
// database can give a true result, and stops the run with what to do when it can't.
//
// - Every migration in supabase/migrations is applied (a teammate's new one otherwise fails
//   tests far from the cause): `vpr db:migrate`.
// - Test users haven't piled up. Every run creates fresh users (`#lib/testing/e2e-auth.ts`,
//   about 450 a full run) and none can be deleted: the audit log and the cards keep who did
//   what. Lists such as People and the audit log's actors stop at 1,000 rows (`max_rows` in
//   supabase/config.toml), so past that tests can't find the user they just made:
//   `vpr db:reset` starts over.

import { readdirSync } from 'node:fs'
import postgres from 'postgres'
import { isLocalSupabase } from '../server/sign-in-method'

/** The Supabase CLI's local database, on every machine and in CI. */
const localDatabase = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

/** Above this, the next full run would push a user list past 1,000 rows. */
export const maxUsersBeforeRun = 550

/** The migrations in the folder that the database hasn't applied, by version. */
export function unappliedMigrations(files: string[], applied: string[]): string[] {
    const done = new Set(applied)
    return files
        .filter((file) => file.endsWith('.sql'))
        .map((file) => file.split('_')[0])
        .filter((version) => !done.has(version))
        .sort()
}

export default async function checkE2eDatabase() {
    const url = process.env.PUBLIC_SUPABASE_URL ?? ''
    if (!isLocalSupabase(url)) {
        throw new Error(`e2e runs only against a local Supabase stack, not ${url || 'none'}`)
    }
    const sql = postgres(localDatabase, { max: 1, onnotice: () => {} })
    try {
        const applied = await sql<{ version: string }[]>`
            select version from supabase_migrations.schema_migrations`
        const missing = unappliedMigrations(
            readdirSync('supabase/migrations'),
            applied.map(({ version }) => version),
        )
        if (missing.length > 0) {
            throw new Error(
                `The local database is missing ${missing.length} migration(s): ${missing.join(', ')}. Run \`vpr db:migrate\`, then run the tests again.`,
            )
        }

        const [{ users }] = await sql<{ users: number }[]>`
            select count(*)::int as users from auth.users`
        if (users > maxUsersBeforeRun) {
            throw new Error(
                `The local database has ${users} users, left by earlier test runs. Lists stop at 1,000 rows, so tests would fail for no real reason. Run \`vpr db:reset\` (it wipes local data), then run the tests again.`,
            )
        }
    } finally {
        await sql.end()
    }
}
