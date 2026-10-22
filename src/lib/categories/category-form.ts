// The categories page's form: what an admin typed, read into what `saveCategory` takes.

import { cardLocales, type CardLocale } from '../cards/card'
import {
    isCategoryColour,
    isCategoryIcon,
    type CategoryColour,
    type CategoryIconName,
} from './look'

/** What the categories page saves: the look, and names per locale (English required). */
/** How CSV import (#48) matches a category name: by English name, ignoring case and spaces. */
export const englishNameKey = (name: string) => name.trim().toLocaleLowerCase('en')

export type CategoryInput = {
    icon: CategoryIconName
    colour: CategoryColour
    /** A locale given as null or blank loses its name; locales left out keep theirs. */
    names: Partial<Record<CardLocale, string | null>> & { en: string }
}

/** The form's fields as typed, to show again after a refusal. */
export type CategoryFormValues = {
    icon: string
    colour: string
    name_en: string
    name_sv: string
    name_nb: string
}

export type CategoryFormErrors = Partial<Record<keyof CategoryFormValues, string>>

export const emptyCategoryFormValues: CategoryFormValues = {
    icon: '',
    colour: '',
    name_en: '',
    name_sv: '',
    name_nb: '',
}

const text = (form: FormData, name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : ''
}

/** The form read into a `CategoryInput`, or the errors and what was typed. */
export function parseCategoryForm(
    form: FormData,
): { input: CategoryInput } | { errors: CategoryFormErrors; values: CategoryFormValues } {
    const values: CategoryFormValues = {
        icon: text(form, 'icon'),
        colour: text(form, 'colour'),
        name_en: text(form, 'name_en'),
        name_sv: text(form, 'name_sv'),
        name_nb: text(form, 'name_nb'),
    }
    const { icon, colour } = values
    const en = values.name_en.trim()
    if (!en || !isCategoryIcon(icon) || !isCategoryColour(colour)) {
        const errors: CategoryFormErrors = {}
        if (!en) errors.name_en = 'Enter an English name.'
        if (!isCategoryIcon(icon)) errors.icon = 'Pick an icon.'
        if (!isCategoryColour(colour)) errors.colour = 'Pick a colour.'
        return { errors, values }
    }

    const names: CategoryInput['names'] = { en }
    for (const locale of cardLocales) {
        if (locale !== 'en') names[locale] = values[`name_${locale}`].trim() || null
    }
    return { input: { icon, colour, names } }
}

/** What `parseCategoryForm` would find wrong with these values, for live validation. */
export function categoryFormErrors(values: CategoryFormValues): CategoryFormErrors {
    const form = new FormData()
    for (const [name, value] of Object.entries(values)) form.set(name, value)
    const parsed = parseCategoryForm(form)
    return 'errors' in parsed ? parsed.errors : {}
}

/** `list` with the item at `from` moved to index `to` (a drag and drop); unchanged if either is out of range. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
    const inRange = (index: number) => index >= 0 && index < list.length
    if (!inRange(from) || !inRange(to) || from === to) return [...list]
    const moved = [...list]
    const [item] = moved.splice(from, 1)
    moved.splice(to, 0, item as T)
    return moved
}
