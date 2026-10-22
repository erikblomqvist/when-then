import { encode } from 'uqr'

/** A QR code for `value` as one SVG path of unit squares, with its side in modules. */
export function qrPath(value: string): { size: number; path: string } {
    const qr = encode(value, { border: 2 })
    const path = qr.data
        .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
        .join('')
    return { size: qr.size, path }
}
