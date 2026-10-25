import { expect, test } from '@playwright/test'
import { recipeToParams, scenario } from '../../../lib/game/scenario'
import { gotoHydrated } from '../../../lib/testing/e2e-hydration'

test('a recipe URL shows the chosen seat its view, and an impossible one its error', async ({
    page,
}) => {
    const recipe = scenario().players(3).step('placing').absent([2])
    const { state } = recipe.build()
    if (state.phase.name !== 'playing' || state.phase.play.step === 'picking') {
        throw new Error('The scenario has no card to place.')
    }
    const { activeId, play } = state.phase
    const nameOf = (id: string) => state.players.find((player) => player.id === id)!.name
    const card = state.cards[play.cardId]

    // Seen from the active player by default: the card's text is the reader's alone.
    await gotoHydrated(page, `/scenario?${recipeToParams(recipe.recipe)}`)
    await expect(page.getByTestId('seat')).toHaveText(nameOf(activeId))
    await expect(page.getByTestId('card')).toContainText('text hidden')
    await expect(page.getByRole('row', { name: nameOf(state.seating[1]) })).toContainText('absent')

    // From the reader's phone, the text is there and the date still isn't.
    const reader = state.seating.indexOf(play.readerId) + 1
    await gotoHydrated(page, `/scenario?${recipeToParams(recipe.viewer(reader).recipe)}`)
    await expect(page.getByTestId('seat')).toHaveText(nameOf(play.readerId))
    await expect(page.getByTestId('card')).toContainText(card.text)
    await expect(page.getByTestId('card')).toContainText('date hidden')

    await gotoHydrated(page, '/scenario?players=11')
    await expect(page.getByRole('alert')).toHaveText('players: a game has 2 to 10 players')

    await gotoHydrated(page, '/scenario?players=3&colour=blue')
    await expect(page.getByRole('alert')).toContainText('colour: not a recipe field')
})
