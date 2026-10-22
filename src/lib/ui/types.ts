import type { CategoryLook } from '../categories/look'

export type { CategoryColour, CategoryIconName, CategoryLook } from '../categories/look'

/**
 * Made-up categories in the seed's looks, for stories and placeholders. Real categories come
 * from the database (managed on the admin's categories page), named in the card language.
 */
export const sampleCategories = {
    events: { name: 'Events', icon: 'zap', colour: 'red' },
    people: { name: 'People', icon: 'user', colour: 'blue' },
    inventions: { name: 'Inventions', icon: 'lightbulb', colour: 'amber' },
    places: { name: 'Places', icon: 'map-pin', colour: 'green' },
} as const satisfies Record<string, CategoryLook>

export type CardSize = 'sm' | 'md' | 'lg' | 'xl'
