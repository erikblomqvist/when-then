import { describe, expect, it } from 'vite-plus/test'
import {
    leftOf,
    moveToLeftOf,
    reversed,
    rightOf,
    sameSeating,
    seatPoint,
    seatTargetAt,
    startingFrom,
    swapSeats,
} from './seating'

const table = ['astrid', 'bjorn', 'cecilia', 'dag']

describe('seating', () => {
    it('counts the same seating from any player', () => {
        expect(startingFrom(table, 'cecilia')).toEqual(['cecilia', 'dag', 'astrid', 'bjorn'])
        expect(startingFrom(table, 'nobody')).toEqual(table)
    })

    it('treats rotations as the same seating, but not the reverse', () => {
        expect(sameSeating(table, ['dag', 'astrid', 'bjorn', 'cecilia'])).toBe(true)
        expect(sameSeating(table, ['astrid', 'dag', 'cecilia', 'bjorn'])).toBe(false)
        expect(sameSeating(table, ['astrid', 'bjorn', 'cecilia'])).toBe(false)
    })

    it('puts the next player in turn order on your left and your reader on your right', () => {
        expect(leftOf(table, 'astrid')).toBe('bjorn')
        expect(leftOf(table, 'dag')).toBe('astrid')
        expect(rightOf(table, 'astrid')).toBe('dag')
        expect(rightOf(table, 'cecilia')).toBe('bjorn')
    })

    it('swaps two seats', () => {
        expect(swapSeats(table, 'bjorn', 'dag')).toEqual(['astrid', 'dag', 'cecilia', 'bjorn'])
    })

    it('moves a player between two others, shifting the ones in between', () => {
        expect(moveToLeftOf(table, 'bjorn', 'cecilia')).toEqual([
            'astrid',
            'cecilia',
            'bjorn',
            'dag',
        ])
        // Next to the first player, from either side, without moving them.
        expect(moveToLeftOf(table, 'dag', 'astrid')).toEqual(['astrid', 'dag', 'bjorn', 'cecilia'])
        expect(moveToLeftOf(table, 'bjorn', 'dag')).toEqual(['astrid', 'cecilia', 'dag', 'bjorn'])
        expect(moveToLeftOf(table, 'bjorn', 'bjorn')).toEqual(table)
    })

    it('reverses the direction around an anchor', () => {
        expect(reversed(table, 'astrid')).toEqual(['astrid', 'dag', 'cecilia', 'bjorn'])
        expect(reversed(table, 'cecilia')).toEqual(['cecilia', 'bjorn', 'astrid', 'dag'])
    })
})

describe('drawing a round table', () => {
    it('puts seat 0 at the bottom and goes clockwise, to screen-left', () => {
        const bottom = seatPoint(0, 4)
        const next = seatPoint(1, 4)
        expect(bottom.x).toBeCloseTo(0.5)
        expect(bottom.y).toBeGreaterThan(0.5)
        expect(next.x).toBeLessThan(0.5)
        expect(next.y).toBeCloseTo(0.5)
    })

    it('finds the seat or gap under a point', () => {
        const at = (p: { x: number; y: number }) => seatTargetAt(p.x, p.y, 6)
        expect(at(seatPoint(2, 6))).toEqual({ kind: 'seat', seat: 2 })
        expect(at(seatPoint(5.5, 6))).toEqual({ kind: 'gap', after: 5 })
        expect(at(seatPoint(5.9, 6))).toEqual({ kind: 'seat', seat: 0 })
    })

    it('finds nothing at the centre or off the table', () => {
        expect(seatTargetAt(0.5, 0.5, 6)).toBeUndefined()
        expect(seatTargetAt(1.2, 0.5, 6)).toBeUndefined()
    })
})
