// How a category looks: an icon from a curated Lucide set and a colour from a fixed palette
// (issue #14). Stored on the category by name; the game (`#lib/ui/CategoryIcon.svelte`) and the
// admin's categories page render from these names. Shared by both, so no components or CSS here:
// the icon components live in `#lib/ui/category-icons.ts`, the colours in
// `#lib/styles/category-colours.css` as `.cat-<colour>` scopes.

/** Lucide icon names (kebab-case, as on lucide.dev) a category can use. */
export const categoryIcons = [
    'zap',
    'user',
    'lightbulb',
    'map-pin',
    'landmark',
    'crown',
    'swords',
    'flag',
    'globe',
    'rocket',
    'music',
    'palette',
    'book-open',
    'trophy',
    'film',
    'flask-conical',
    'heart-pulse',
    'castle',
    'ship',
    'atom',
] as const

export type CategoryIconName = (typeof categoryIcons)[number]

/** Palette colours a category can use, each a 500/700 pair in the design tokens. */
export const categoryColours = [
    'red',
    'orange',
    'amber',
    'green',
    'teal',
    'blue',
    'purple',
    'pink',
] as const

export type CategoryColour = (typeof categoryColours)[number]

export const isCategoryIcon = (value: unknown): value is CategoryIconName =>
    categoryIcons.some((icon) => icon === value)

export const isCategoryColour = (value: unknown): value is CategoryColour =>
    categoryColours.some((colour) => colour === value)

/** What the game needs to show a category: its name in the card language, icon and colour. */
export type CategoryLook = { name: string; icon: CategoryIconName; colour: CategoryColour }
