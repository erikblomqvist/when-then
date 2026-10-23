import { describe, expect, it } from 'vite-plus/test'
import { photoSizes, shrinkPhoto, shrinkPhotos } from './shrink-photo'

/** A noisy photo-sized PNG (noise keeps the JPEG from compressing to nothing). */
async function photo(width = 4000, height = 3000): Promise<File> {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(width, height)
    for (let index = 0; index < pixels.data.length; index += 1) {
        pixels.data[index] = index % 4 === 3 ? 255 : Math.floor(Math.random() * 256)
    }
    context.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
    )
    return new File([blob], 'card.png', { type: 'image/png' })
}

const longEdge = async (file: File) => {
    const bitmap = await createImageBitmap(file)
    const edge = Math.max(bitmap.width, bitmap.height)
    bitmap.close()
    return edge
}

describe('shrinkPhoto', () => {
    it('makes a JPEG no longer than the AI reads', async () => {
        const shrunk = await shrinkPhoto(await photo())
        expect(shrunk.type).toBe('image/jpeg')
        expect(shrunk.name).toBe('card.jpg')
        expect(await longEdge(shrunk)).toBe(photoSizes[0].longEdge)
    })

    it('leaves a file it cannot decode as it is', async () => {
        const text = new File(['not a photo'], 'notes.txt', { type: 'text/plain' })
        expect(await shrinkPhoto(text)).toBe(text)
    })
})

describe('shrinkPhotos', () => {
    it('keeps the largest size when the batch fits', async () => {
        const [shrunk] = await shrinkPhotos([await photo()])
        expect(await longEdge(shrunk)).toBe(photoSizes[0].longEdge)
    })

    it('shrinks a step further until the batch fits the budget', async () => {
        const photos = [await photo(), await photo()]
        const largest = await Promise.all(photos.map((one) => shrinkPhoto(one)))
        const budget = largest.reduce((total, one) => total + one.size, 0) - 1

        const shrunk = await shrinkPhotos(photos, budget)
        expect(shrunk.reduce((total, one) => total + one.size, 0)).toBeLessThanOrEqual(budget)
        expect(await longEdge(shrunk[0])).toBeLessThan(photoSizes[0].longEdge)
    })
})
