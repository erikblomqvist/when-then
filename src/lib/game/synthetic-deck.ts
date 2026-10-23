// The synthetic deck the scenario builder (`./scenario`) plays with: made-up cards with text of
// mixed lengths in every card language, eight in each of five categories, with dates drawn from the
// seed. Synthetic only; no real cards from production.

import type { CardLocale } from '../cards/card'
import { roll } from './random'
import { standardDate, type DeckCard } from './state'

/** The synthetic deck's categories, after the seed's looks plus one more. */
export const syntheticCategories = ['events', 'people', 'inventions', 'places', 'culture'] as const

/** A card's text in each card language. */
type CardText = Record<CardLocale, string>

const texts: Record<(typeof syntheticCategories)[number], CardText[]> = {
    events: [
        {
            en: 'Exampleton holds its first harvest race',
            sv: 'Exampleton håller sin första skördekapplöpning',
            nb: 'Exampleton holder sitt første innhøstingsløp',
        },
        {
            en: 'A storm floods the lower town of Sampleby',
            sv: 'En storm översvämmar nedre Sampleby',
            nb: 'En storm oversvømmer nedre Sampleby',
        },
        {
            en: 'The twin towns of Northmoor and Southmoor sign a treaty to share one bridge, one bell and one mayor between them',
            sv: 'Tvillingstäderna Northmoor och Southmoor skriver under ett fördrag om att dela en bro, en klocka och en borgmästare',
            nb: 'Tvillingbyene Northmoor og Southmoor signerer en avtale om å dele én bro, én klokke og én ordfører',
        },
        {
            en: 'A fair in Lindham lasts forty days',
            sv: 'En marknad i Lindham pågår i fyrtio dagar',
            nb: 'Et marked i Lindham varer i førti dager',
        },
        {
            en: 'The great fire of Ashford burns for three nights',
            sv: 'Den stora branden i Ashford brinner i tre nätter',
            nb: 'Den store brannen i Ashford brenner i tre netter',
        },
        {
            en: 'Fishermen from Gullvik refuse to sail until the harbour tax is halved, and the whole coast goes without herring for a winter',
            sv: 'Fiskarna i Gullvik vägrar segla tills hamnskatten halveras, och hela kusten blir utan sill en vinter',
            nb: 'Fiskerne i Gullvik nekter å seile til havneskatten halveres, og hele kysten står uten sild en vinter',
        },
        {
            en: 'Two rival choirs settle a feud with a singing contest',
            sv: 'Två rivaliserande körer avgör en fejd med en sångtävling',
            nb: 'To rivaliserende kor avgjør en strid med en sangkonkurranse',
        },
        {
            en: 'Kettleford elects its first town council',
            sv: 'Kettleford väljer sitt första kommunfullmäktige',
            nb: 'Kettleford velger sitt første bystyre',
        },
    ],
    people: [
        {
            en: 'A made-up clockmaker builds a clock that runs backwards',
            sv: 'En påhittad urmakare bygger en klocka som går baklänges',
            nb: 'En oppdiktet urmaker bygger en klokke som går baklengs',
        },
        {
            en: 'A fictional poet reads the longest poem ever recited aloud',
            sv: 'En påhittad poet läser den längsta dikt som någonsin lästs upp',
            nb: 'En oppdiktet poet leser det lengste diktet som noen gang er lest høyt',
        },
        {
            en: 'Captain Ida Brask maps the Sample Sea',
            sv: 'Kapten Ida Brask kartlägger Samplehavet',
            nb: 'Kaptein Ida Brask kartlegger Samplehavet',
        },
        {
            en: 'Weaver Tomas Lind becomes the first person to sell a pattern by post, sending each customer one row at a time',
            sv: 'Vävaren Tomas Lind blir först med att sälja ett mönster per post och skickar en rad i taget till varje kund',
            nb: 'Veveren Tomas Lind blir den første som selger et mønster per post, og sender én rad om gangen til hver kunde',
        },
        {
            en: 'An invented astronomer names a comet after her cat',
            sv: 'En påhittad astronom döper en komet efter sin katt',
            nb: 'En oppdiktet astronom kaller opp en komet etter katten sin',
        },
        {
            en: 'A baker in Exampleton wins a medal',
            sv: 'En bagare i Exampleton vinner en medalj',
            nb: 'En baker i Exampleton vinner en medalje',
        },
        {
            en: 'A made-up explorer walks from the northern cape to the southern cape without once sleeping indoors',
            sv: 'En påhittad upptäcktsresande går från norra udden till södra udden utan att sova inomhus en enda natt',
            nb: 'En oppdiktet oppdagelsesreisende går fra nordkappen til sørkappen uten å sove innendørs en eneste natt',
        },
        {
            en: 'A fictional queen abdicates to keep bees',
            sv: 'En påhittad drottning abdikerar för att hålla bin',
            nb: 'En oppdiktet dronning abdiserer for å holde bier',
        },
    ],
    inventions: [
        {
            en: 'The folding ladder is patented',
            sv: 'Den hopfällbara stegen patenteras',
            nb: 'Den sammenleggbare stigen patenteres',
        },
        {
            en: 'A made-up workshop sells the first pocket compass with a light',
            sv: 'En påhittad verkstad säljer den första fickkompassen med lampa',
            nb: 'Et oppdiktet verksted selger det første lommekompasset med lys',
        },
        {
            en: 'A mill in Lindham runs a loom on wind alone, and the weavers walk out in protest the very same week',
            sv: 'En kvarn i Lindham driver en vävstol enbart med vind, och vävarna går ut i protest samma vecka',
            nb: 'En mølle i Lindham driver en vevstol på vind alene, og veverne går ut i protest samme uke',
        },
        {
            en: 'Sampleby builds a steam-driven ferry',
            sv: 'Sampleby bygger en ångdriven färja',
            nb: 'Sampleby bygger en dampdrevet ferje',
        },
        {
            en: 'The self-stirring pot goes on sale',
            sv: 'Den självomrörande grytan börjar säljas',
            nb: 'Den selvrørende gryta kommer i salg',
        },
        {
            en: 'An invented printer cuts a typeface small enough to fit a whole almanac on one sheet',
            sv: 'En påhittad boktryckare skär ett typsnitt så litet att en hel almanacka ryms på ett ark',
            nb: 'En oppdiktet boktrykker skjærer en skrift så liten at en hel almanakk får plass på ett ark',
        },
        {
            en: 'A fictional brewery cools its cellars with ice from the lake',
            sv: 'Ett påhittat bryggeri kyler sina källare med is från sjön',
            nb: 'Et oppdiktet bryggeri kjøler kjellerne sine med is fra innsjøen',
        },
        {
            en: 'The rain-proof map is invented',
            sv: 'Den regntåliga kartan uppfinns',
            nb: 'Det regnsikre kartet blir oppfunnet',
        },
    ],
    places: [
        {
            en: 'The made-up port of Sampleby lights its first lighthouse',
            sv: 'Den påhittade hamnen Sampleby tänder sitt första fyrtorn',
            nb: 'Den oppdiktede havnen Sampleby tenner sitt første fyrtårn',
        },
        {
            en: 'The made-up Samplebridge opens to horse carts',
            sv: 'Den påhittade Samplebron öppnas för hästkärror',
            nb: 'Den oppdiktede Samplebroa åpnes for hestekjerrer',
        },
        {
            en: 'Northmoor gets its own post office',
            sv: 'Northmoor får ett eget postkontor',
            nb: 'Northmoor får sitt eget postkontor',
        },
        {
            en: 'A canal joins Lake Lind to the sea, and the town at its mouth doubles in size within a single summer',
            sv: 'En kanal förbinder Lindsjön med havet, och staden vid mynningen fördubblas på en enda sommar',
            nb: 'En kanal knytter Lindsjøen til havet, og byen ved utløpet dobles i størrelse på én eneste sommer',
        },
        {
            en: 'Kettleford Castle is finished',
            sv: 'Kettlefords slott står färdigt',
            nb: 'Kettleford slott står ferdig',
        },
        {
            en: 'The island of Gullholm is first settled',
            sv: 'Ön Gullholm blir bebodd för första gången',
            nb: 'Øya Gullholm blir bosatt for første gang',
        },
        {
            en: 'A road over the Ashford pass opens all year round after a tunnel is cut through the last ridge',
            sv: 'En väg över Ashfordpasset hålls öppen året runt sedan en tunnel sprängts genom den sista åsen',
            nb: 'En vei over Ashford-passet holdes åpen hele året etter at en tunnel er sprengt gjennom den siste åsen',
        },
        {
            en: 'Southmoor market square is paved',
            sv: 'Torget i Southmoor stenläggs',
            nb: 'Torget i Southmoor blir brolagt',
        },
    ],
    culture: [
        {
            en: 'The Exampleton Players stage their first comedy',
            sv: 'Exampleton-teatern sätter upp sin första komedi',
            nb: 'Exampleton-teatret setter opp sin første komedie',
        },
        {
            en: 'A made-up dance sweeps the harbour towns',
            sv: 'En påhittad dans sprider sig i hamnstäderna',
            nb: 'En oppdiktet dans sprer seg i havnebyene',
        },
        {
            en: 'A fictional novel about a lighthouse keeper sells out in a week',
            sv: 'En påhittad roman om en fyrvaktare säljer slut på en vecka',
            nb: 'En oppdiktet roman om en fyrvokter blir utsolgt på en uke',
        },
        {
            en: 'The Lindham choir sings at a royal wedding, then refuses to sing anywhere else for ten years',
            sv: 'Lindhams kör sjunger på ett kungligt bröllop och vägrar sedan sjunga någon annanstans på tio år',
            nb: 'Lindham-koret synger i et kongelig bryllup og nekter deretter å synge noe annet sted i ti år',
        },
        {
            en: 'A painter shows a canvas of the sea',
            sv: 'En målare ställer ut en duk av havet',
            nb: 'En maler stiller ut et lerret av havet',
        },
        {
            en: 'The first Sampleby song contest is held',
            sv: 'Den första sångtävlingen i Sampleby hålls',
            nb: 'Den første sangkonkurransen i Sampleby blir holdt',
        },
        {
            en: 'An invented board game about trading spices becomes so popular that the town council bans it on market days',
            sv: 'Ett påhittat brädspel om kryddhandel blir så populärt att fullmäktige förbjuder det på marknadsdagar',
            nb: 'Et oppdiktet brettspill om krydderhandel blir så populært at bystyret forbyr det på markedsdager',
        },
        {
            en: 'A puppet show tours the islands',
            sv: 'En dockteater turnerar bland öarna',
            nb: 'Et dukketeater turnerer blant øyene',
        },
    ],
}

/**
 * The synthetic deck in `language`, with each card's date drawn from `seed`: most from 1500 on,
 * by year, and about a quarter earlier, by decade.
 */
export function syntheticDeck(seed: number, language: CardLocale): DeckCard[] {
    const dice = roll({ seed: seed >>> 0, position: 0 })
    return syntheticCategories.flatMap((category) =>
        texts[category].map((text, i) => ({
            id: `${category}-${i + 1}`,
            category,
            text: text[language],
            date: standardDate(
                dice.random() < 0.75 ? 1500 + dice.int(526) : -1999 + dice.int(3499),
            ),
        })),
    )
}
