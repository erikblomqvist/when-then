// The admin's form shortcuts: Cmd (Mac) or Ctrl + S saves, and Cmd/Ctrl + Enter publishes
// (in the card editor). `Keys` shows them on the buttons.

export type ShortcutKey = 'mod' | 's' | 'enter'

/** For a button's `aria-keyshortcuts`: either modifier works on every platform. */
export const ariaKeyshortcuts = (keys: readonly ShortcutKey[]) => {
    const rest = keys.filter((key) => key !== 'mod').map((key) => (key === 's' ? 'S' : 'Enter'))
    return ['Control', 'Meta'].map((mod) => [mod, ...rest].join('+')).join(' ')
}

/** Which form shortcut a keydown is: 'save' (Cmd/Ctrl + S), 'publish' (+ Enter) or null. */
export function formShortcut(event: KeyboardEvent): 'save' | 'publish' | null {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null
    if (event.key === 'Enter') return 'publish'
    if (event.key.toLowerCase() === 's') return 'save'
    return null
}
