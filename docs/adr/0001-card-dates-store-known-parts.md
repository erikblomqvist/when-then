# Cards store the date parts that are known; game modes decide the granularity asked for

A card stores its date as separate, nullable `decade`, `year`, `month` and `day` parts, filled down to the finest level actually known about the event (`day` needs `month`, `month` needs `year`; the decade is derived from the year when there is one). There is deliberately no `precision` column: how precisely a card is *known* is a fact about the event, while how precisely it is *placed* belongs to the game mode. The standard mode places cards by year from 1500 and by decade before; a future month-precise mode simply skips cards without a month, rather than needing every card re-authored. Cards from 1500 onwards must have at least a year before they can be published.

Decades are stored by their earliest year (1490s → 1490, 490s BC → −499, "0s" → 1, "0s BC" → −9), with no year 0, so "0s" and "0s BC" never collide. Coarser-than-decade dates (e.g. "the wheel is invented") are not representable yet; a century part can be added when a game mode wants it.

## Considered options

- **A `precision` enum on the card** (`decade | year | month`): rejected because it binds the card to how it's played today, and a new mode would need cards re-classified.
- **A full date with a precision flag**: rejected because it invites fake precision (1 January for year-only events).
