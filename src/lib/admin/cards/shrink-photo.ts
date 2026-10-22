// Shrinks a photo in the browser before "Add from photo" (#60) uploads it: a phone photo is
// several megabytes, more than the AI reads anyway (it scales images down to about 1568 px on
// the long edge). Turned upright by its EXIF orientation and sent as a JPEG.

/** The long edge the AI reads at; bigger only costs upload time. */
const longEdge = 1568
const quality = 0.85

/** The photo as a smaller JPEG, or the photo itself when the browser can't decode it. */
export async function shrinkPhoto(file: File): Promise<File> {
    let bitmap: ImageBitmap
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
        return file
    }
    const scale = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
}
