// How an audit entry reads in the admin: labels for actions and entities, and a field-by-field
// diff of what changed. Shared by the card history panel and the global audit log.
//
// Every action in `auditActions` has a label here (the type makes sure). Anything else still
// renders, with a label made from its name and its payload shown field by field, so an entry
// from an older or newer writer never breaks the page.

import type { CardLocale } from '../cards/card'
import { formatCardDate, monthNames } from '../cards/date-parts'
import { localeName } from '../cards/translation'
import type { Json } from '../database.types'
import type { AuditAction } from './actions'

/** The parts of an audit entry this module reads (see `AuditEntry` in `#lib/server/audit`). */
export type AuditRecord = {
    entity: string
    entityId: string
    locale: string | null
    action: string
    before: Record<string, Json> | null
    after: Record<string, Json> | null
}

/** Names to show instead of ids: category names and people's emails, by id. */
export type AuditNames = {
    categories: Record<string, string>
    people: Record<string, string>
}

/** One changed field. A null side means empty (not set, or the row did not exist). */
export type FieldChange = {
    field: string
    label: string
    before: string | null
    after: string | null
}

/** 'source_url' → 'Source url', 'ai_translate' → 'Ai translate'. For names we don't know. */
export const humanize = (name: string) => {
    const words = name.replaceAll(/[_-]+/g, ' ').trim()
    return words ? words[0].toUpperCase() + words.slice(1) : name
}

const actionLabels: Record<AuditAction, string> = {
    create: 'Created',
    update: 'Edited',
    delete: 'Deleted',
    publish: 'Published',
    archive: 'Archived',
    unarchive: 'Unarchived',
    verify: 'Verified the date',
    unverify: 'Cleared the date verification',
    invite: 'Invited',
    change_invite: 'Changed invite',
    withdraw_invite: 'Withdrew invite',
    grant: 'Granted role',
    change: 'Changed role',
    revoke: 'Revoked role',
    accept_invite: 'Accepted invite',
    import: 'Imported from CSV',
    import_photo: 'Added from a photo',
    ai_translate: 'Machine translated with AI',
    ai_suggest_date: 'Suggested a date with AI',
    ai_read_photo: 'Read a photo with AI',
    accept_date_suggestion: 'Accepted the AI date suggestion',
    reject_date_suggestion: 'Rejected the AI date suggestion',
}

/** What happened, as a past-tense phrase: 'update' → 'Edited'. Unknown actions humanized. */
export const actionLabel = (action: string) =>
    Object.hasOwn(actionLabels, action) ? actionLabels[action as AuditAction] : humanize(action)

const entityLabels: Record<string, string> = {
    card: 'Card',
    card_translation: 'Card text',
    category: 'Category',
    category_translation: 'Category name',
    user_role: 'Role',
    role_invite: 'Invite',
    photo: 'Photo',
}

/** 'sv' → 'Swedish'; a locale we don't know stays as it is. */
const localeLabel = (locale: string) =>
    Object.hasOwn(localeName, locale) ? localeName[locale as CardLocale] : locale

/** What the entry is about: 'Card', 'Card text (Swedish)'. Unknown entities humanized. */
export function entityLabel(entity: string, locale: string | null = null) {
    const label = entityLabels[entity] ?? humanize(entity)
    return locale ? `${label} (${localeLabel(locale)})` : label
}

/** Where the admin can see the thing an entry is about, if it has a page. */
export function entityHref(entity: string, entityId: string): string | null {
    if (entity === 'card' || entity === 'card_translation') return `/admin/cards/${entityId}`
    return null
}

const fieldLabels: Record<string, string> = {
    text: 'Text',
    note: 'Note',
    status: 'Status',
    category_id: 'Category',
    decade: 'Decade',
    year: 'Year',
    month: 'Month',
    day: 'Day',
    source_url: 'Source URL',
    source_quote: 'Source quote',
    difficulty: 'Difficulty',
    tags: 'Tags',
    verified_by: 'Verified by',
    verified_at: 'Verified at',
    archived_by: 'Archived by',
    archived_at: 'Archived at',
    position: 'Position',
    icon: 'Icon',
    colour: 'Colour',
    name: 'Name',
    role: 'Role',
    email: 'Email',
    invited_by: 'Invited by',
    // AI calls (details of `ai_*` entries)
    outcome: 'Outcome',
    model: 'Model',
    input_tokens: 'Input tokens',
    output_tokens: 'Output tokens',
    cost_usd: 'Cost',
    locales: 'Languages',
    error: 'Error',
    calls: 'Model calls',
    // AI date suggestions (#42)
    via: 'Found via',
    confidence: 'Confidence',
    sources: 'Sources retrieved',
    request_id: 'Suggestion request',
    suggested_year: 'Suggested year',
}

export const fieldLabel = (field: string) => fieldLabels[field] ?? humanize(field)

const timeFormat = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
})

/** An audit time, the same on the server and in the browser: '22 Oct 2026, 14:05 UTC'. */
export const formatTime = (iso: string) => {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? iso : `${timeFormat.format(date)} UTC`
}

const isPersonField = (field: string) =>
    field.endsWith('_by') || field === 'actor_id' || field === 'user_id'

/** A stored value as text, or null for empty. Ids become names where we know them. */
export function formatValue(
    field: string,
    value: Json | undefined,
    names?: AuditNames,
): string | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'number') {
        if (field === 'month' && Number.isInteger(value) && monthNames[value - 1]) {
            return monthNames[value - 1]
        }
        if (field === 'year')
            return formatCardDate({ decade: null, year: value, month: null, day: null })
        if (field === 'decade')
            return formatCardDate({ decade: value, year: null, month: null, day: null })
        if (field === 'cost_usd') return `$${value}`
        return String(value)
    }
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'string') {
        if (field === 'category_id') return names?.categories[value] ?? value
        if (isPersonField(field)) return names?.people[value] ?? value
        if (field.endsWith('_at')) return formatTime(value)
        if (field === 'status' || field === 'role' || field === 'outcome') return humanize(value)
        if (field === 'locales') return localeLabel(value)
        return value
    }
    if (Array.isArray(value)) {
        const items = value.map((item) => formatValue(field, item, names)).filter((item) => item)
        return items.length ? items.join(', ') : null
    }
    return JSON.stringify(value)
}

// Bookkeeping, not content: the triggers stamp these on every write.
const bookkeeping = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by'])

/**
 * What an entry changed, field by field: for an edit only the fields that differ, for a
 * create the fields it set, for a delete the fields it had. Leaves out bookkeeping, the
 * entry's locale and the key that points back at the entity (a translation's card_id).
 */
export function fieldChanges(entry: AuditRecord, names?: AuditNames): FieldChange[] {
    const before = entry.before ?? {}
    const after = entry.after ?? {}
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return fields
        .filter((field) => !bookkeeping.has(field))
        .filter((field) => !(field === 'locale' && entry.locale))
        .filter((field) => (after[field] ?? before[field]) !== entry.entityId)
        .map((field) => ({
            field,
            label: fieldLabel(field),
            before: formatValue(field, before[field], names),
            after: formatValue(field, after[field], names),
        }))
        .filter((change) => change.before !== change.after)
}

/** Extra facts on app-written entries (an AI call's model and cost), as label and value. */
export function detailItems(details: Json | null): { label: string; value: string }[] {
    if (details === null || details === undefined) return []
    if (typeof details === 'object' && !Array.isArray(details)) {
        return Object.entries(details)
            .map(([key, value]) => ({ label: fieldLabel(key), value: formatValue(key, value) }))
            .filter((item): item is { label: string; value: string } => item.value !== null)
    }
    const value = formatValue('details', details)
    return value === null ? [] : [{ label: 'Details', value }]
}
