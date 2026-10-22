import type { AppRole } from './roles'

const roles: readonly AppRole[] = ['editor', 'admin']

/** A text field of the form, or '' when it is missing (or a file). */
export function field(form: FormData, name: string): string {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
}

/** The `email` field, trimmed and lower-cased as invites are matched, or null if it isn't one. */
export function readEmail(form: FormData): string | null {
    const email = field(form, 'email').trim().toLowerCase()
    return /^[^\s@]+@[^\s@]+$/.test(email) ? email : null
}

/** The `role` field when it is `editor` or `admin`, otherwise null. */
export function readRole(form: FormData): AppRole | null {
    const role = form.get('role')
    return roles.find((known) => known === role) ?? null
}
