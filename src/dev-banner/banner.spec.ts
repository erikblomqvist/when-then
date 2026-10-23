import { describe, expect, it } from 'vite-plus/test'
import { banner, dealHand, deck, visibleWidth, type BannerOptions } from './banner'

const card = (text: string) => deck.find((c) => c.text === text)!

const options: BannerOptions = {
    urls: { local: 'http://localhost:5173/', network: 'http://192.168.0.2:5173/' },
    hand: [
        card('The Berlin Wall falls'),
        card('The Eiffel Tower opens'),
        card('Marie Curie wins her second Nobel Prize'),
    ],
    anchor: 1940,
    revealed: false,
    colour: false,
}

describe('dev banner', () => {
    it('hides the dealt card’s year until it has turned over', () => {
        const hidden = banner(options).join('\n')
        expect(hidden).toContain('The Berlin Wall falls')
        expect(hidden).toContain('????')
        expect(hidden).not.toContain('1989')

        const revealed = banner({ ...options, revealed: true }).join('\n')
        expect(revealed).toContain('1989')
        expect(revealed).not.toContain('????')
    })

    it('labels every placed card and the anchor year on the timeline', () => {
        const labels = banner(options).find((line) => line.includes('????'))
        expect(labels).toMatch(/1889.*1911.*1940.*\?{4}/)
    })

    it('makes the wordmark band, stripe and timeline equally wide, in colour or not', () => {
        for (const colour of [false, true]) {
            const lines = banner({ ...options, colour })
            const timeline = lines.find((line) => line.includes('Then'))!
            const width = visibleWidth(timeline)
            expect(lines.slice(0, 6).map(visibleWidth)).toEqual(Array(6).fill(width))
        }
    })

    it('keeps a long dealt card on the timeline', () => {
        const long = card('Astrid Lindgren publishes Pippi Longstocking')
        const lines = banner({ ...options, hand: [long, ...options.hand.slice(1)] })
        const timeline = lines.find((line) => line.includes('Then'))!
        const above = lines.find((line) => line.includes(long.text))!
        expect(visibleWidth(above)).toBeLessThanOrEqual(visibleWidth(timeline))
    })

    it('leaves out the network URL when the server isn’t exposed', () => {
        const lines = banner({ ...options, urls: { local: 'http://localhost:5173/' } })
        expect(lines.at(-1)?.trim()).toBe('➜ http://localhost:5173/')
    })

    it('writes no colour codes without colour', () => {
        expect(banner(options).join('')).not.toContain('\u001b')
        expect(banner({ ...options, colour: true }).join('')).toContain('\u001b')
    })

    it('deals three different cards and an anchor, far enough apart to label', () => {
        for (let i = 0; i < 200; i++) {
            const { hand, anchor } = dealHand()
            expect(new Set(hand).size).toBe(3)
            const years = [...hand.map((c) => c.year), anchor].sort((a, b) => a - b)
            for (let j = 1; j < years.length; j++)
                expect(years[j] - years[j - 1]).toBeGreaterThanOrEqual(12)
        }
    })
})
