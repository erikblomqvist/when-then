// "Add from photo" (#60) on a phone opens the camera straight from the link (Home, Cards), so
// the photo is taken before the photo page opens. It waits here, in the browser, until the page
// takes it.

let waiting: File[] = []

export function handOverPhotos(files: File[]) {
    waiting = files
}

/** The photos taken on the way to the photo page, once; empty after that. */
export function takeHandedPhotos(): File[] {
    const files = waiting
    waiting = []
    return files
}

/** A touch screen, where a photo is taken with the camera rather than picked from files. */
export const usesCamera = () =>
    typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
