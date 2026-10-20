# When Then?

## Basic idea

A game played on your phone called "When Then?"  
Someone hosts a game in their phone's browser and friends can join via a code. The game takes inspiration from the Swedish boardgame "När då då?" where the idea is to get a statement and they guess which year that statement belongs to on a timelime that keeps on growing as you guess where those statements belong.

People should be playing this game when they are physically together, because things like reading a card is done out loud, not on someone’s screen.

## How to host a game

A person, from their phone, navigates to the game’s base URL (TBD). They get two options:

- Create a game  
- Join a game

When creating a game, you get both a code that you can copy and a link (with the code). A QR code should also be generated.

When at least 1 other player have joined, the host can click “Start game” which prevents more players from joining. The next step is deciding where people are seated.

## How to join a game

Scan QR code on hosts device or enter a game code, then enter your preferred name + icon

## How to choose seats

Two options:

- Choose manually from a set number of seats  
- Utilize the compass on a person’s phone (should be possible via `DeviceOrientationEvent.requestPermission()` and `event.webkitCompassHeading` on iOS and `deviceorientationabsolute` on Android. This way, all users can just point their device to the middle of the table at a given time and hopefully this could detect where people are seated in relation to each other. **[research]**

## Game objective

The game objective is to place historical events on a timeline. There are different categories; “Prylar, nyheter och uppfinningar”, “Kända personer och händelser”, “Underhållning” and “Sport, fritid och blandat” (these categories are not set in stone and it should be easy for an admin to edit, add and remove). Score X amount of points before all others. X could be a variable in the setup of a game.

## Game rules

At the start of the game, each player gets a random year assigned, as a “hook” to place the cards they are dealt during the game in relation to. The random year should be within the range of existing game cards’ years, or not exceed those bounds by much. (In the original version of the game, the player draws a card at random, representing their first year on the timeline. That card is automatically locked, but not counted towards the total points. We don’t need to “burn” a card like that digitally.) The game rotates clockwise. When it’s your turn, a category is either:

A. Randomly chosen for you  
B. Chosen by the player who’s going to read the card  
C. Chosen by you

To decide which, let *n* be the number of categories, numbered 1 to *n*. Draw a random whole number *r* from 1 to *n* + 2, with every number equally likely. If *r* = 1, it’s C. If *r* = 2, it’s B. Otherwise it’s A, and the category number is *r* - 1\.  
The person before you then reads a statement from a card in the chosen category, e.g. “Albert Einstein is born” or “The Summer Olympics is hosted in London for the first time”. It’s now up to you to place the card correctly on the timeline on your screen in relation to the cards you already have. If you guess correctly where it belongs, it’s placed on the timeline but it doesn’t get locked. You then get to choose if you want to continue and thus gamble all your unlocked cards if you answer the next question incorrectly, or if you want to lock all unlocked cards and give up your turn. For each correct guess that turn, you get 1 point.

## Togglable house rules at setup

- Lock in a card directly if you get the guess exactly right (correct year)  
- Streaks/combos? Either points or just an effect  
- Filter on a year span, or how obscure the knowledge required to know the answer is  
- Select a specific time range, maybe with a minimum to ensure there are enough questions – could be dynamic based on how many questions are found as you define the range  
  - Hardcore mode? Do months instead of years inside of a small time range

## Game features

- Question theme/package selector (Science, Fashion, Sports, whathaveyou…) – see this in context of the preexisting category concept: could we for instance give the asker some other type of advantage if the responder rolls a 1, since this kind of conflicts with the category concept if we keep it as-is?  
- Some sort of voting system enabling the user to see less of a certain card type  
- Multi-lingual support (English, Swedish and Norwegian) for the UI. Cards could potentially support this as well (TBD)

## Things to decide on/reason about

- If 2+ players reach the winning score the same round  
- Players who want to leave/join during an active game  
- Changing house rules mid-game  
- The possibility to test and verify different game states visually

## Design

We provide the screens from Claude Design. Prototyping is reserved for concepts we can’t answer or when interaction and feel of the UX is of importance.  
The admin interface does not need to follow this pattern at all. It can be a more generic shadcn type of interface.

## Tech stack

- Progressive Web App  
- Svelte 5 + SvelteKit  
- TypeScript  
- Native CSS (no Tailwind)  
- Realtime database? Supabase? Other options?  
- Vercel  
- Vite+ (pnpm, oxlint)  
- Lucide icons  
- Component library (Storybook)

