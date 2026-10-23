// Why the lifecycle service (`#lib/server/game-lifecycle.js`) refused a command, and the words
// the phone shows for each reason, in the player's language.

import { m } from '#lib/paraglide/messages.js'
import { maxPlayers } from './player'
import { maxTargetScore, minTargetScore } from './settings'

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
    | 'not_host'
    | 'no_player'
    | 'host_cannot_leave'
    | 'removed'
    | 'invalid_target_score'
    | 'invalid_card_language'

const words: Record<GameRefusalCode, () => string> = {
    invalid_name: m.refusal_invalid_name,
    invalid_icon: m.refusal_invalid_icon,
    not_found: m.refusal_not_found,
    no_seat: m.refusal_no_seat,
    game_full: () => m.refusal_game_full({ max: maxPlayers }),
    game_started: m.refusal_game_started,
    name_taken: m.refusal_name_taken,
    icon_taken: m.refusal_icon_taken,
    not_host: m.refusal_not_host,
    no_player: m.refusal_no_player,
    host_cannot_leave: m.refusal_host_cannot_leave,
    removed: m.refusal_removed,
    invalid_target_score: () =>
        m.refusal_invalid_target_score({ min: minTargetScore, max: maxTargetScore }),
    invalid_card_language: m.refusal_invalid_card_language,
}

/** The message for a refusal, in the current locale. */
export const refusalMessage = (code: GameRefusalCode) => words[code]()
