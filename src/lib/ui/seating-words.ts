// The words on the seating table and its editor. The app passes them in the player's language
// (`#lib/game/seating-words.js`); stories and tests get these English ones.

export type SeatingWords = {
    /** The chip on your own seat. */
    you: string
    /** "You" after a preposition: "between you and Bo". */
    youObject: string
    /** In the middle of the table. */
    turnsGoLeft: string
    undo: string
    reverse: string
    letGoToCancel: string
    swap: (a: string, b: string) => string
    moveBetween: (who: string, a: string, b: string) => string
    acrossFromYou: (name: string) => string
    yourNeighbours: (left: string, right: string) => string
}

export const englishSeatingWords: SeatingWords = {
    you: 'You',
    youObject: 'you',
    turnsGoLeft: 'Turns go to the left',
    undo: 'Undo',
    reverse: 'Reverse',
    letGoToCancel: 'Let go off the table to cancel',
    swap: (a, b) => `Swap ${a} and ${b}`,
    moveBetween: (who, a, b) => `Move ${who} between ${a} and ${b}`,
    acrossFromYou: (name) => `${name} sits across from you.`,
    yourNeighbours: (left, right) => `${left} is on your left, ${right} on your right.`,
}
