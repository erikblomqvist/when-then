// Why the lifecycle service (`#lib/server/game-lifecycle.js`) or the game machine (`./machine`)
// refused a command, and the words the phone shows for each reason, in the player's language.

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
    | 'not_seating'
    | 'invalid_seating'
    | 'not_your_turn'
    | 'not_picking'
    | 'not_your_pick'
    | 'category_unavailable'
    | 'not_placing'
    | 'invalid_slot'
    | 'lock_in_unavailable'
    | 'continue_unavailable'
    | 'not_stealing'
    | 'not_your_steal'
    | 'game_over'
    | 'nothing_to_skip'
    | 'no_other_reader'
    | 'not_system'
    | 'too_few_players'
    | 'stale_version'
    | 'not_started'
    | 'not_over'

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
    not_seating: m.refusal_not_seating,
    invalid_seating: m.refusal_invalid_seating,
    not_your_turn: m.refusal_not_your_turn,
    not_picking: m.refusal_not_picking,
    not_your_pick: m.refusal_not_your_pick,
    category_unavailable: m.refusal_category_unavailable,
    not_placing: m.refusal_not_placing,
    invalid_slot: m.refusal_invalid_slot,
    lock_in_unavailable: m.refusal_lock_in_unavailable,
    continue_unavailable: m.refusal_continue_unavailable,
    not_stealing: m.refusal_not_stealing,
    not_your_steal: m.refusal_not_your_steal,
    game_over: m.refusal_game_over,
    nothing_to_skip: m.refusal_nothing_to_skip,
    no_other_reader: m.refusal_no_other_reader,
    not_system: m.refusal_not_system,
    too_few_players: m.refusal_too_few_players,
    stale_version: m.refusal_stale_version,
    not_started: m.refusal_not_started,
    not_over: m.refusal_not_over,
}

/** The message for a refusal, in the current locale. */
export const refusalMessage = (code: GameRefusalCode) => words[code]()
