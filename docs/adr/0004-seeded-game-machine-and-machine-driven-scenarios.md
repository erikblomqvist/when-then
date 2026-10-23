# The game is a seeded pure machine, and scenarios are built by playing it

The rules are one pure function, `apply(state, command)`, that returns the next state or a refusal code. All chance (category draws, anchors, the starting player, card order) comes from a PRNG whose seed and position live inside the game state, so a game is fully determined by its seed and its commands, and a test or story only has to pick a seed. The deck is snapshotted at Start as one shuffled queue per category, and dealing pops the front, so how cards are chosen (weighting, avoiding repeats across games) is decided when the queues are built, outside the machine. Because the seed and the queues predict every card still to come, `redact(state, seat)` always strips them, and phones only ever get its separate `SeatView` type.

The scenario builder makes its states by playing the real machine against a synthetic deck whose dates it knows, choosing correct or wrong slots on purpose: `scenario().players(4).activePlayer(2).unlocked(2)` runs Start, Confirm seating and real turns. A scenario is a flat, serialisable recipe (seed, players, active player, step, scores, viewer seat, named helper steps), so the fluent API, Storybook controls and the dev `/scenario` URL are three spellings of the same recipe. A recipe the rules can't reach is an error rather than a clamped state.

## Considered options

- **A fresh `random()` passed into each `apply`**: simpler, but a game couldn't be replayed from its state, and every scenario would need its own way to fix the dice.
- **An unordered pool picked from when dealing**: keeps the picking policy inside the machine, where it would need the seed-aware weighting the queues give for free.
- **Building scenario states by hand and checking them with an invariant validator**: faster to write a single state, but the validator becomes a second copy of the rules that can disagree with the first. The invariant check is kept only as a safety net in tests.

## Consequences

- The state carries a `schema` number. A deploy that changes the shape ships an upgrade function that runs on load, and a game that can't be upgraded is ended with no winner.
