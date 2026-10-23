import { describe, expect, it } from 'vite-plus/test'
import { unappliedMigrations } from './e2e-database-check'

describe('unappliedMigrations', () => {
    it('lists the migration files the database has no version for, in order', () => {
        expect(
            unappliedMigrations(
                [
                    '20261023140000_import_photo_cards_per_card.sql',
                    '20261023085950_delete_any_card.sql',
                    '20261023115047_sweep_lobbies.sql',
                    'README.md',
                ],
                ['20261023085950'],
            ),
        ).toEqual(['20261023115047', '20261023140000'])
    })

    it('is empty when every migration is applied', () => {
        expect(
            unappliedMigrations(['20261023085950_delete_any_card.sql'], ['20261023085950']),
        ).toEqual([])
    })
})
