// Why the lifecycle service (`#lib/server/game-lifecycle.js`) refused a command, and the words
// the phone shows for each reason, in the player's language.

import { m } from '#lib/paraglide/messages.js'

/** Why a lifecycle command was refused. */
export type GameRefusalCode =
    | 'invalid_name'
    | 'invalid_icon'
    | 'not_found'
    | 'no_seat'
    | 'game_full'
    | 'game_started'
    | 'name_taken'
    | 'icon_taken'

const words: Record<GameRefusalCode, () => string> = {
    invalid_name: m.refusal_invalid_name,
    invalid_icon: m.refusal_invalid_icon,
    not_found: m.refusal_not_found,
    no_seat: m.refusal_no_seat,
    game_full: m.refusal_game_full,
    game_started: m.refusal_game_started,
    name_taken: m.refusal_name_taken,
    icon_taken: m.refusal_icon_taken,
}

/** The message for a refusal, in the current locale. */
export const refusalMessage = (code: GameRefusalCode) => words[code]()
