// Shrinks photos in the browser before "Add from photo" (#60) uploads them: a phone photo is
// several megabytes, more than the AI reads anyway (it scales images down to about 1568 px on
// the long edge). Turned upright by its EXIF orientation and sent as a JPEG.
//
// The photos read at once go up in one request, and a request to the server can be at most
// 4.5 MB (Vercel), so a batch that would be bigger is shrunk a step further, then another: a
// card's print stays readable well below the AI's own size.

/** A size to shrink to: the long edge in pixels and the JPEG quality. */
export type PhotoSize = { longEdge: number; quality: number }

/** Tried in turn until the batch fits; the first is the most the AI reads. */
export const photoSizes: PhotoSize[] = [
    { longEdge: 1568, quality: 0.85 },
    { longEdge: 1280, quality: 0.8 },
    { longEdge: 1024, quality: 0.75 },
    { longEdge: 800, quality: 0.7 },
]

/** Under Vercel's 4.5 MB request limit, with room for the rest of the form. */
export const uploadBudget = 4 * 1024 * 1024

/** The photo as a smaller JPEG, or the photo itself when the browser can't decode it. */
export async function shrinkPhoto(file: File, size: PhotoSize = photoSizes[0]): Promise<File> {
    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
        return file
    }
    const scale = Math.min(1, size.longEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', size.quality),
    )
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}

/**
 * The photos shrunk to the largest size at which they fit `budget` together (the smallest size
 * when none does: the server then says the upload is too big).
 */
export async function shrinkPhotos(files: File[], budget = uploadBudget): Promise<File[]> {
    let shrunk: File[] = []
    for (const size of photoSizes) {
        shrunk = await Promise.all(files.map((file) => shrinkPhoto(file, size)))
        if (shrunk.reduce((total, file) => total + file.size, 0) <= budget) break
    }
    return shrunk
}
