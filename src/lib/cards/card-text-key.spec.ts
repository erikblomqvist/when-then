import { describe, expect, it } from 'vite-plus/test'
import { cardTextKey, earlierSameText } from './card-text-key'

describe('cardTextKey', () => {
    it('sets case, punctuation and spacing aside', () => {
        expect(cardTextKey('The atomic bomb is dropped on “Hiroshima”!  ')).toBe(
            'the atomic bomb is dropped on hiroshima',
        )
        expect(cardTextKey('Smörgåsbord — är gott')).toBe('smörgåsbord är gott')
        expect(cardTextKey(' … ')).toBe('')
    })
})

describe('earlierSameText', () => {
    it('points a repeat at the first text it repeats', () => {
        expect(
            earlierSameText([
                'Vasa sinks',
                'Galileo builds a telescope',
                'Vasa sinks.',
                'vasa SINKS',
            ]),
        ).toEqual([null, null, 0, 0])
    })

    it('never matches empty texts', () => {
        expect(earlierSameText(['', ''])).toEqual([null, null])
    })
})
