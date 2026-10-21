import { describe, expect, it } from 'vite-plus/test'
import {
    draftFromTranslation,
    fillMachineTranslation,
    postedStatus,
    statusOnSave,
    type TranslationDraft,
} from './translation'

const saved = (status: 'machine' | 'reviewed' | 'stale') => ({
    text: 'En påhittad bro öppnas',
    note: null,
    status,
})

const draft = (fields: Partial<TranslationDraft> = {}): TranslationDraft => ({
    text: 'En påhittad bro öppnas',
    note: '',
    reviewed: false,
    machineText: null,
    ...fields,
})

describe('statusOnSave', () => {
    it('is missing when the tab has no text', () => {
        expect(statusOnSave({ draft: draft({ text: '  ' }), englishChanged: false })).toBe(
            'missing',
        )
    })

    it('is reviewed for text a person wrote or edited', () => {
        expect(statusOnSave({ draft: draft(), englishChanged: false })).toBe('reviewed')
        expect(
            statusOnSave({
                saved: saved('machine'),
                draft: draft({ text: 'En påhittad bro invigs' }),
                englishChanged: false,
            }),
        ).toBe('reviewed')
    })

    it('keeps the saved status when nothing but the note changed', () => {
        expect(
            statusOnSave({
                saved: saved('machine'),
                draft: draft({ note: 'Bro, inte brygga' }),
                englishChanged: false,
            }),
        ).toBe('machine')
        expect(statusOnSave({ saved: saved('stale'), draft: draft(), englishChanged: false })).toBe(
            'stale',
        )
    })

    it('is reviewed when ticked, whatever else', () => {
        expect(
            statusOnSave({
                saved: saved('stale'),
                draft: draft({ reviewed: true }),
                englishChanged: true,
            }),
        ).toBe('reviewed')
    })

    it('turns a reviewed translation stale when the English changes and it does not', () => {
        expect(
            statusOnSave({ saved: saved('reviewed'), draft: draft(), englishChanged: true }),
        ).toBe('stale')
        expect(
            statusOnSave({ saved: saved('machine'), draft: draft(), englishChanged: true }),
        ).toBe('machine')
        expect(
            statusOnSave({
                saved: saved('reviewed'),
                draft: draft({ text: 'En påhittad bro invigs' }),
                englishChanged: true,
            }),
        ).toBe('reviewed')
    })

    it('is machine for a machine fill left as it is, reviewed once a person edits it', () => {
        const filled = fillMachineTranslation(draft({ text: '' }), 'En påhittad bro öppnas')
        expect(statusOnSave({ draft: filled, englishChanged: false })).toBe('machine')
        expect(
            statusOnSave({
                saved: saved('reviewed'),
                draft: { ...filled, text: 'En påhittad bro invigs' },
                englishChanged: false,
            }),
        ).toBe('reviewed')
    })
})

describe('fillMachineTranslation', () => {
    it('replaces the text, keeps the note and clears a tick', () => {
        expect(
            fillMachineTranslation(draft({ note: 'Om bron', reviewed: true }), 'Ny text'),
        ).toEqual({ text: 'Ny text', note: 'Om bron', reviewed: false, machineText: 'Ny text' })
    })
})

describe('postedStatus', () => {
    it('names the status only when the person or a machine decided it', () => {
        expect(postedStatus(draft({ reviewed: true }))).toBe('reviewed')
        expect(postedStatus(fillMachineTranslation(draft(), 'Maskintext'))).toBe('machine')
        expect(
            postedStatus({ ...fillMachineTranslation(draft(), 'Maskintext'), text: 'Min text' }),
        ).toBeUndefined()
        expect(postedStatus(draft())).toBeUndefined()
    })
})

describe('draftFromTranslation', () => {
    it('starts from the saved text and note, unticked', () => {
        expect(draftFromTranslation({ ...saved('reviewed'), note: 'Om bron' })).toEqual(
            draft({ note: 'Om bron' }),
        )
        expect(draftFromTranslation(undefined)).toEqual(draft({ text: '' }))
    })
})
