// A card's history at a glance (the card page's sidebar): its audit entries grouped by save,
// each summed up in a line, and when it happened relative to now. The full entries, with their
// diffs, are in the history dialog.

import type { CardLocale } from '../cards/card'
import { localeName } from '../cards/translation'
import { actionLabel, fieldChanges, type AuditNames, type AuditRecord } from './display'

/** The parts of an audit entry a summary reads (see `AuditEntry` in `#lib/server/audit`). */
export type HistoryRecord = AuditRecord & { id: number; at: string; actorId: string | null }

/** One save: entries written together (by one person, in one transaction), newest first. */
export type HistoryChange<Entry extends HistoryRecord = HistoryRecord> = {
    entries: Entry[]
    at: string
    actorId: string | null
}

/**
 * Groups entries (newest first) into saves: neighbours by the same person at the same moment,
 * like a card and its English text written by one save. The database stamps every row of a
 * transaction with the same time.
 */
export function groupChanges<Entry extends HistoryRecord>(
    entries: Entry[],
): HistoryChange<Entry>[] {
    const changes: HistoryChange<Entry>[] = []
    for (const entry of entries) {
        const last = changes.at(-1)
        if (last && last.at === entry.at && last.actorId === entry.actorId) {
            last.entries.push(entry)
        } else {
            changes.push({ entries: [entry], at: entry.at, actorId: entry.actorId })
        }
    }
    return changes
}

// The triggers' row writes; any other action was written by the app and names the step.
const rowWrites = new Set(['create', 'update', 'delete'])

const localeLabel = (locale: string) =>
    Object.hasOwn(localeName, locale) ? localeName[locale as CardLocale] : locale

/** A field as the summary names it: 'Year', or 'Swedish text' for a translation's text. */
const fieldName = (entry: AuditRecord, label: string) =>
    entry.locale ? `${localeLabel(entry.locale)} ${label.toLowerCase()}` : label

/**
 * What a save did, for one line: the action ('Edited', 'Published', 'Created'), and for an edit
 * the fields it changed ('Year', 'Swedish text'). A step the app logged (import, AI) names
 * the save over the row writes it caused; creating the card names it over its texts.
 */
export function summarizeChange(
    change: HistoryChange,
    names?: AuditNames,
): { action: string; fields: string[] } {
    const steps = [...new Set(change.entries.map((entry) => entry.action))]
    const named = steps.filter((action) => !rowWrites.has(action))
    if (named.length > 0) return { action: named.map(actionLabel).join(', '), fields: [] }
    // A translation created on its own (the first Swedish text) reads as an edit of the card.
    if (change.entries.some((entry) => entry.entity === 'card' && entry.action === 'create')) {
        return { action: actionLabel('create'), fields: [] }
    }
    if (steps.includes('delete') && !steps.includes('update')) {
        return { action: actionLabel('delete'), fields: fieldsOf(change, names) }
    }
    return { action: actionLabel('update'), fields: fieldsOf(change, names) }
}

function fieldsOf(change: HistoryChange, names?: AuditNames) {
    const fields = change.entries.flatMap((entry) =>
        fieldChanges(entry, names).map((field) => fieldName(entry, field.label)),
    )
    return [...new Set(fields)]
}

const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' })
const minute = 60_000
const hour = 60 * minute
const day = 24 * hour

const ago = (count: number, unit: string) => `${count} ${unit}${count === 1 ? '' : 's'} ago`

/**
 * When, relative to `now`: 'just now', '5 minutes ago', '3 hours ago', 'yesterday', '4 days
 * ago', then the date ('23 Oct 2026').
 */
export function relativeTime(iso: string, now: Date | number = Date.now()) {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    const elapsed = Number(now) - date.getTime()
    if (elapsed < minute) return 'just now'
    if (elapsed < hour) return ago(Math.floor(elapsed / minute), 'minute')
    if (elapsed < day) return ago(Math.floor(elapsed / hour), 'hour')
    if (elapsed < 2 * day) return 'yesterday'
    if (elapsed < 7 * day) return ago(Math.floor(elapsed / day), 'day')
    return dateFormat.format(date)
}
