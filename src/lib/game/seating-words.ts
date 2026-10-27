// The seating table's and editor's words (`#lib/ui/seating-words.js`), in the player's language.

import { m } from '#lib/paraglide/messages.js'
import type { SeatingWords } from '../ui/seating-words'

export const seatingWords = (): SeatingWords => ({
    you: m.you(),
    youObject: m.seating_you_object(),
    turnsGoLeft: m.seating_turns_go_left(),
    undo: m.seating_undo(),
    reverse: m.seating_reverse(),
    letGoToCancel: m.seating_let_go_to_cancel(),
    pickSwap: (name) => m.seating_pick_swap({ name }),
    swap: (a, b) => m.seating_swap({ a, b }),
    moveBetween: (who, a, b) => m.seating_move_between({ who, a, b }),
    acrossFromYou: (name) => m.seating_across_from_you({ name }),
    yourNeighbours: (left, right) => m.seating_your_neighbours({ left, right }),
})
