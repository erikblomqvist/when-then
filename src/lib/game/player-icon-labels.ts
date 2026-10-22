// The name of each player icon (`./player.ts`), in the player's language, for screen readers.

import { m } from '#lib/paraglide/messages.js'
import { playerIcons, type PlayerIcon } from './player'

const iconWords: Record<PlayerIcon, () => string> = {
    cat: m.player_icon_cat,
    dog: m.player_icon_dog,
    bird: m.player_icon_bird,
    fish: m.player_icon_fish,
    rabbit: m.player_icon_rabbit,
    turtle: m.player_icon_turtle,
    squirrel: m.player_icon_squirrel,
    snail: m.player_icon_snail,
    apple: m.player_icon_apple,
    cherry: m.player_icon_cherry,
    carrot: m.player_icon_carrot,
    pizza: m.player_icon_pizza,
    coffee: m.player_icon_coffee,
    'ice-cream-cone': m.player_icon_ice_cream_cone,
    sun: m.player_icon_sun,
    moon: m.player_icon_moon,
    flame: m.player_icon_flame,
    flower: m.player_icon_flower,
    'tree-pine': m.player_icon_tree_pine,
    anchor: m.player_icon_anchor,
    bike: m.player_icon_bike,
    sailboat: m.player_icon_sailboat,
    ghost: m.player_icon_ghost,
    guitar: m.player_icon_guitar,
}

/** Every player icon's name, in the current locale, for screen readers. */
export const playerIconLabels = (): Record<PlayerIcon, string> =>
    Object.fromEntries(playerIcons.map((icon) => [icon, iconWords[icon]()])) as Record<
        PlayerIcon,
        string
    >
