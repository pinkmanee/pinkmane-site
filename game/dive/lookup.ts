// PINK DIVE: THE BIG LOOKUP. When an answer isn't on our own lists (prompts.ts + more*.ts), the server asks Wikidata
// (Wikipedia's database, millions of things) whether it's real and fits the prompt. Every Wikidata item has a short
// description, like "species of fish", "Slovak rock band", "river in Slovakia" or "2016 single by Lil Peep": if the
// description fits the prompt's rule below, the answer counts (as a DEEP CUT: it's not on the list, so it's a rare one).
//
// Only the server uses this (app/api/dive/route.ts). A prompt with no rule here only takes answers from the lists
// (countries, capitals, US states: those lists are already complete; and a few that can't be checked this way).

import { norm } from "./daily";

const OF = "(?:species|genus|family|subfamily|subspecies|order|suborder|tribe|group|common name for (?:several|many|a number of) species|common name) of";
const of = (things: string) => new RegExp(`\\b${OF} (?:\\w+[- ]){0,3}(?:${things})\\b`);

// what a fitting description looks like, per prompt id
export const RULES: Record<string, RegExp[]> = {
  fish: [of("fish|fishes|ray-finned fish|ray-finned fishes|cartilaginous fish|cartilaginous fishes|sharks?|rays?|skates?|eels?|catfish|cichlids?|carps?|salmonids?"), /\b(food|game|aquarium|freshwater|marine) fish\b/, /\bfish species\b/],
  bird: [of("birds?|passerines?|parrots?|owls?|ducks?|raptors?|songbirds?|waterfowl|seabirds?|waders?|penguins?|pigeons?|hawks?|eagles?|gulls?"), /\bbird species\b/, /^(?:large |small |)bird\b/],
  dog: [/\bdog breed\b/, /\bbreed of (?:\w+ ){0,2}dogs?\b/, /\bbreed of (?:hunting|herding|working|toy|sled|guard) dog\b/],
  bug: [of("insects?|beetles?|moths?|butterfl(?:y|ies)|ants?|bees?|wasps?|hornets?|flies|fly|spiders?|arachnids?|bugs?|true bugs|grasshoppers?|crickets?|katydids?|dragonfl(?:y|ies)|damselfl(?:y|ies)|cockroach(?:es)?|termites?|mites?|ticks?|scorpions?|centipedes?|millipedes?|mantis(?:es)?|lice|louse|fleas?|aphids?|weevils?|cicadas?|mayfl(?:y|ies)|earwigs?|stick insects?"), /\binsect species\b/],
  sea: [of("molluscs?|mollusks?|crustaceans?|cephalopods?|octopus(?:es)?|squids?|cuttlefish|crabs?|shrimps?|prawns?|lobsters?|crayfish|jellyfish|corals?|sea stars?|starfish|sea urchins?|sea cucumbers?|sea anemones?|sea slugs?|sea snails?|nudibranchs?|sponges?|cetaceans?|whales?|dolphins?|porpoises?|seals?|sea lions?|walrus(?:es)?|sirenians?|manatees?|dugongs?|marine mammals?|bivalves?|clams?|oysters?|mussels?|scallops?|gastropods?|echinoderms?|cnidarians?|hydrozoans?|barnacles?|krill|isopods?|copepods?|amphipods?|brittle stars?|sea turtles?|sea snakes?|tunicates?|sea squirts?|comb jell(?:y|ies)|ctenophores?|marine worms?|polychaetes?")],
  reptile: [of("reptiles?|snakes?|lizards?|turtles?|tortoises?|terrapins?|crocodil\\w*|alligators?|caimans?|gharials?|geckos?|skinks?|iguanas?|chameleons?|vipers?|pit vipers?|pythons?|boas?|cobras?|rattlesnakes?|monitor lizards?|monitors?|squamates?|colubrids?|elapids?|agamas?|anoles?|tuataras?")],
  farm: [/\bbreed of (?:domestic )?(?:cattle|cows?|sheep|goats?|pigs?|swine|horses?|chickens?|fowl|ducks?|geese|goose|rabbits?|turkeys?|donkeys?|pon(?:y|ies)|water buffalo|llamas?|alpacas?|camels?)\b/, /\b(?:cattle|cow|sheep|goat|pig|horse|chicken|duck|goose|rabbit|turkey|donkey|pony) breed\b/],
  "starts-p": [new RegExp(`\\b(?:${OF}|breed of)\\b`)],
  fruit: [/\bfruits?\b/, /\bberr(?:y|ies)\b/, /\b(?:apple|pear|grape|citrus|banana|mango|plum|cherry|peach|melon|strawberry) cultivar\b/, /\bcultivar of (?:apple|pear|grape|citrus|banana|mango|plum|cherry|peach|melon|strawberry)/],
  veg: [/\bvegetables?\b/, /\b(?:root|leaf|stem|bulb) vegetable\b/, /\bedible (?:plant|root|tuber|leaves|mushroom)\b/, /\blegumes?\b/, /\bchili pepper\b/, /\bcultivar (?:group )?of (?:cabbage|lettuce|potato|tomato|onion|pepper|squash|bean|pea|carrot|beet|radish|brassica)/, /\b(?:potato|tomato|lettuce|onion|squash|pepper) (?:cultivar|variety)\b/],
  pasta: [/\bpasta\b/, /\bnoodles?\b/, /\bdumplings?\b/],
  cheese: [/\bcheeses?\b/],
  "asia-dish": [/\b(?:japanese|chinese|korean|thai|vietnamese|indian|indonesian|malaysian|filipino|taiwanese|pakistani|bangladeshi|nepali|nepalese|sri lankan|burmese|cambodian|khmer|lao|laotian|mongolian|tibetan|uzbek|kazakh|kyrgyz|singaporean|cantonese|sichuan|szechuan|hong kong|okinawan|punjabi|bengali|hyderabadi|keralan|tamil|gujarati|persian|iranian|afghan|turkish|lebanese|arab|uyghur|hakka|teochew|hokkien|peranakan|bruneian|maldivian|bhutanese|georgian|armenian|azerbaijani|israeli|syrian|iraqi|yemeni|saudi|emirati|south asian|east asian|southeast asian|central asian|asian)\b.{0,40}\b(?:dish|dishes|food|cuisine|soup|noodles?|snack|street food|dessert|sweet|bread|dumplings?|curry|stew|salad|pancake|confection|rice|condiment|sauce|beverage|drink|pastry|cake|kebab|skewer)\b/, /\b(?:dish|food|soup|snack|dessert|noodle dish|rice dish|street food) (?:from|of|in|originating in|originating from) (?:\w+ ){0,2}(?:japan|china|korea|thailand|vietnam|india|indonesia|malaysia|the philippines|philippines|taiwan|pakistan|nepal|sri lanka|myanmar|burma|cambodia|laos|mongolia|tibet|singapore|hong kong|macau|iran|afghanistan|asia|bangladesh|bhutan|brunei|uzbekistan|kazakhstan|turkey|lebanon|israel|georgia|armenia)\b/],
  candy: [/\b(?:candy|candies|confection|confectionery|chocolate bars?|chocolate brand|brand of (?:chocolate|candy|confectionery|chewing gum|sweets)|sweets|lollipops?|liquorice|licorice|toffees?|chewing gum|gummies|gummy|marshmallows?|pralines?|nougat|fudge|caramels?|bonbons?|hard candy|jelly beans?|mints?)\b/],
  fastfood: [/\bfast[- ]food\b/, /\brestaurant chains?\b/, /\bchain of (?:\w+ ){0,3}(?:restaurants|cafes|coffeehouses|coffee shops|bakeries|pizzerias|doughnut shops|sandwich shops|stores)\b/, /\b(?:coffeehouse|coffee|pizza|pizzeria|doughnut|donut|bakery|sandwich|burger|hamburger|fried chicken|taco|ice cream|bubble tea|juice|smoothie) (?:chain|franchise)\b/, /\bquick[- ]service restaurant\b/, /\bfast casual\b/],
  strain: [/\bcannabis (?:strain|cultivar|variety)\b/, /\bstrain of cannabis\b/],
  breakfast: [/\bbreakfast\b/, /\b(?:porridge|pancakes?|breakfast cereal|cereal brand|pastry|pastries|egg dish|bread roll|waffles?|crepes?|omelette|sausage|bacon)\b/],
  rapper: [/\brappers?\b/, /\bhip[- ]hop (?:artist|musician|group|duo|recording artist|collective|producer|singer|act)\b/, /\bemcee\b/],
  underground: [/\brappers?\b/, /\bhip[- ]hop (?:artist|musician|group|duo|recording artist|collective|act)\b/],
  genre: [/\b(?:music(?:al)? genre|genre of (?:\w+ ){0,3}music|style of (?:\w+ ){0,3}music|sub-?genre|music style|musical style|fusion genre|genre of electronic dance music|dance music genre|electronic music genre|rock music genre|hip[- ]hop genre|metal genre)\b/],
  instrument: [/\b(?:musical )?instruments?\b/],
  band: [/\bband\b/, /\bmusical (?:group|duo|trio|ensemble|collective|project)\b/, /\bmusic (?:group|duo|collective)\b/, /\b(?:rock|pop|metal|punk|indie|jazz|folk|electronic|hip[- ]hop|rap|boy|girl|vocal|dance|synth-?pop|emo|hardcore|grunge|reggae|ska|blues|country|alternative|psychedelic|post-punk|shoegaze|noise|industrial|gothic|r&b|soul|funk|disco|techno|house|trance) (?:group|duo|trio|quartet|act|collective)\b/],
  singer: [/\bsingers?\b/, /\bvocalists?\b/, /\bsinger-songwriters?\b/, /\bsongstress\b/],
  producer: [/\b(?:record|music|musical|hip[- ]hop|beat|electronic|trap|dance|edm) producers?\b/, /\bbeatmakers?\b/, /\bproducer and (?:dj|rapper|songwriter|musician|singer)\b/, /\b(?:dj|rapper|songwriter|musician|singer|composer),? (?:and )?(?:record )?producer\b/],
  dj: [/\b(?:dj|djs|disc jockey|deejay)\b/],
  peep: [/\blil peep\b/],
  lean: [/\byung lean\b/],
  ghostemane: [/\bghostemane\b/],
  river: [/\brivers?\b/, /\btributary\b/, /\bwatercourse\b/],
  mountain: [/\b(?:mountains?|mountain range|range of mountains|peaks?|volcano|stratovolcano|shield volcano|summit|massif|hills?|highlands|mount|mountain pass|uplands?|plateau)\b/],
  island: [/\b(?:islands?|islets?|atolls?|archipelago|isle|skerry|cay|key) (?:in|of|off|near|located)\b/, /\b(?:volcanic|coral|tidal|private|uninhabited|barrier|river|lake|sea|ocean|tropical|small|large) islands?\b/, /^islands?\b/, /\barchipelago\b/],
  water: [/\b(?:lake|sea|ocean|bay|gulf|lagoon|reservoir|fjord|fiord|strait|loch|lough|pond|marginal sea|inland sea|salt lake|crater lake|glacial lake|bight|cove|estuary|sound) (?:in|of|on|between|located|off|near|bordering)\b/, /^(?:lake|sea|ocean|bay|gulf|lagoon|reservoir|fjord|strait|loch|lough|marginal sea|inland sea|salt lake|crater lake|glacial lake)\b/],
  landmark: [/\b(?:tower|castle|palace|cathedral|church|basilica|chapel|monument|memorial|bridge|museum|temple|shrine|statue|landmark|stadium|arena|square|plaza|mosque|synagogue|fortress|fort|citadel|abbey|monastery|skyscraper|gate|arch|triumphal arch|wall|pyramid|ruins|archaeological site|tourist attraction|amusement park|theme park|national park|waterfall|canyon|gorge|cave|observatory|opera house|lighthouse|mausoleum|tomb|garden|château|chateau|manor house|stately home|villa|theatre|theater|world heritage site|historic site|historic district|old town|ancient city|ancient site|viaduct|aqueduct|dam|canal|street|avenue|boulevard|market|bazaar)\b/],
  simpsons: [/\bsimpsons\b/],
  southpark: [/\bsouth park\b/],
  rickmorty: [/\brick and morty\b/],
  spongebob: [/\bspongebob\b/],
  "classic-toon": [/\b(?:looney tunes|merrie melodies|hanna[- ]barbera|disney|warner bros\.?|fleischer|terrytoons|mgm|walter lantz|nickelodeon|cartoon network|comic strip|cartoon|animated|animation) (?:cartoon )?character\b/, /\bfictional (?:\w+ ){0,3}(?:character|cat|dog|mouse|duck|rabbit|bear|pig|bird|chipmunk|squirrel|skunk|coyote|fox|wolf|lion|tiger|moose|penguin|frog|robot|alien|ghost) (?:in|from|of|created by|appearing in) (?:\w+ ){0,4}(?:cartoons?|animated|animation|comics?|comic strips?|looney tunes|disney|hanna[- ]barbera|nickelodeon|cartoon network)\b/],
  disney: [/\b(?:disney|pixar)\b.{0,40}\b(?:film|movie|feature)\b/, /\b(?:film|movie|feature)\b.{0,40}\b(?:disney|pixar)\b/],
  superhero: [/\bsuper-?heroe?s?\b/, /\bsuperheroine\b/, /\bcomics? (?:book )?character\b/, /\b(?:marvel|dc) comics\b/, /\bcharacter (?:in|from|appearing in) (?:\w+ ){0,3}comics?\b/],
  pokemon: [/\bpok[eé]mon\b/],
  horror: [/\bhorror\b.{0,40}\b(?:film|movie)\b/, /\b(?:film|movie)\b.{0,40}\bhorror\b/],
  anime: [/\banime\b/, /\bmanga\b/],
  // ---- the extra prompts (prompts-extra.ts)
  mammal: [of("mammals?|rodents?|bats?|primates?|monkeys?|apes?|lemurs?|marsupials?|carnivorans?|cats?|felids?|dogs?|canids?|bears?|deer|antelopes?|bovids?|ungulates?|whales?|dolphins?|seals?|shrews?|moles?|hedgehogs?|weasels?|mustelids?|squirrels?|mice|rats?|hares?|rabbits?|pigs?|horses?|rhinoceros(?:es)?|elephants?")],
  bigcat: [of("cats?|felids?|felines?|big cats?|wild cats?|panthera|lynx(?:es)?")],
  primate: [of("primates?|monkeys?|apes?|lemurs?|gibbons?|lorises?|tarsiers?|baboons?|macaques?|marmosets?|tamarins?|colobus|langurs?")],
  snake: [of("snakes?|vipers?|pit vipers?|pythons?|boas?|cobras?|rattlesnakes?|colubrids?|elapids?|kraits?|mambas?|adders?")],
  shark: [of("sharks?|dogfish(?:es)?|requiem sharks?|carpet sharks?|mackerel sharks?|ground sharks?")],
  dino: [/\bdinosaurs?\b/, /\b(?:theropod|sauropod|ornithopod|ceratopsian|hadrosaur|ankylosaur|stegosaur|pterosaur|plesiosaur|ichthyosaur|mosasaur)s?\b/, /\bgenus of (?:\w+ ){0,3}(?:reptiles?|archosaurs?)\b/],
  catbreed: [/\b(?:cat|domestic cat) breed\b/, /\bbreed of (?:domestic )?cats?\b/],
  horse: [/\bhorse breed\b/, /\bbreed of (?:\w+ ){0,2}(?:horses?|pon(?:y|ies))\b/, /\bpony breed\b/],
  aussie: [/\b(?:endemic|native) to australia\b/, /\baustralian (?:\w+ ){0,2}(?:mammal|marsupial|bird|lizard|snake|spider|frog|animal|fish)\b/],
  rodent: [of("rodents?|mice|mouse|rats?|squirrels?|voles?|hamsters?|gerbils?|porcupines?|beavers?|gophers?|dormice|chipmunks?|marmots?|cavies|guinea pigs?|chinchillas?|jerboas?|mole-rats?")],
  extinct: [/\bextinct\b/, /\bfossil (?:genus|species|taxon)\b/, /\bprehistoric (?:\w+ ){0,2}(?:animal|mammal|reptile|bird|fish|shark|genus)\b/],
  drink: [/\bcocktails?\b/, /\bmixed drink\b/, /\balcoholic (?:beverage|drink)\b/],
  beer: [/\bbeers?\b/, /\bbrewery\b/, /\bbrand of (?:\w+ ){0,2}(?:beer|lager|ale|pilsner|stout)\b/, /\b(?:lager|pilsner|pils|ale|stout|porter|bock|weissbier|wheat beer)\b/],
  soda: [/\bsoft drinks?\b/, /\bsoda\b/, /\b(?:carbonated|energy|sports) drink\b/, /\bcola\b/, /\bbrand of (?:\w+ ){0,2}(?:drink|beverage|soda|lemonade)\b/, /\blemonade\b/],
  spice: [/\bspices?\b/, /\bherbs?\b/, /\bspice mix(?:ture)?\b/, /\bseasoning\b/, /\bculinary herb\b/],
  dessert: [/\bdesserts?\b/, /\bcakes?\b/, /\bpastr(?:y|ies)\b/, /\bpuddings?\b/, /\bconfection(?:ery)?\b/, /\b(?:pie|tart|custard|ice cream|sweet dish|sweet)\b/],
  bread: [/\bbreads?\b/, /\bflatbread\b/, /\bbread roll\b/, /\bbuns?\b/],
  sauce: [/\bsauces?\b/, /\bdips?\b/, /\bcondiments?\b/, /\bdressings?\b/, /\bspreads?\b/, /\bsalsa\b/],
  nut: [/\bnuts?\b/, /\bedible seeds?\b/, /\bseeds? of\b/],
  soup: [/\bsoups?\b/, /\bstews?\b/, /\bbroths?\b/, /\bchowder\b/],
  sandwich: [/\bsandwich(?:es)?\b/, /\bburgers?\b/, /\bwraps?\b/],
  cereal: [/\bbreakfast cereals?\b/, /\bcereal brand\b/, /\bbrand of (?:\w+ ){0,2}cereal\b/],
  chips: [/\b(?:potato chips?|crisps|snack food|snacks?|tortilla chips?|corn chips?)\b/, /\bbrand of (?:\w+ ){0,2}(?:chips|crisps|snacks?)\b/],
  italian: [/\bitalian\b.{0,40}\b(?:dish|food|pasta|cuisine|dessert|bread|soup|sauce|pastry|sandwich|cheese|cured meat|appetizer)\b/, /\b(?:dish|food|pasta|dessert|bread|soup|pastry) (?:from|of|in|originating in|originating from) (?:\w+ ){0,2}italy\b/, /\b(?:pasta|pizza|risotto|gnocchi)\b/],
  mexican: [/\bmexican\b.{0,40}\b(?:dish|food|cuisine|dessert|bread|soup|sauce|snack|drink|beverage|street food|stew)\b/, /\b(?:dish|food|dessert|soup|stew|snack) (?:from|of|in|originating in|originating from) (?:\w+ ){0,2}mexico\b/],
  coffee: [/\bcoffee\b/, /\bespresso\b/],
  sushi: [/\bjapanese\b.{0,40}\b(?:dish|food|cuisine|dessert|confection|soup|noodles?|snack|sweet|sauce|condiment|street food)\b/, /\bsushi\b/],
  album: [/\b(?:hip[- ]hop|rap|trap|cloud rap|drill|gangsta rap|conscious hip hop) (?:\w+ ){0,2}(?:album|mixtape)\b/, /\b(?:studio )?album by (?:\w+ ){0,4}(?:rapper|hip[- ]hop)\b/],
  metal: [/\b(?:heavy |thrash |death |black |doom |power |nu |progressive |symphonic |folk |speed |groove |sludge |stoner |gothic |industrial |alternative |post-|melodic death |metalcore |deathcore )?metal (?:band|group|act|musical group)\b/, /\bmetalcore band\b/, /\bdeathcore band\b/, /\bgrindcore band\b/],
  synth: [/\bsynthesi[sz]ers?\b/, /\bdrum machines?\b/, /\b(?:audio |software )?plug-?ins?\b/, /\bsoftware synthesi[sz]er\b/, /\bsampler\b/, /\bgroovebox\b/, /\bvirtual instrument\b/, /\baudio effect\b/],
  label: [/\brecord labels?\b/, /\b(?:music|record) (?:label|company)\b/, /\bimprint\b/],
  kpop: [/\bsouth korean (?:\w+ ){0,2}(?:boy band|girl group|band|group|singer|rapper|idol)\b/, /\bk-?pop\b/],
  festival: [/\bmusic festival\b/, /\b(?:rock|metal|electronic|dance|hip[- ]hop|jazz|folk|arts|open-air|summer) (?:music )?festival\b/, /\bfestival\b/],
  travis: [/\btravis scott\b/],
  carti: [/\bplayboi carti\b/],
  kendrick: [/\bkendrick lamar\b/],
  eminem: [/\beminem\b/],
  daw: [/\bdigital audio workstation\b/, /\b(?:music|audio) (?:production |editing |sequencing )?software\b/, /\btracker\b/, /\bsequencer\b/],
  group: [/\bboy ?band\b/, /\bgirl group\b/, /\b(?:vocal|pop|r&b) group\b/, /\bgirl band\b/],
  desert: [/\bdeserts?\b/, /\bdunes?\b/, /\bsalt flats?\b/],
  planet: [/\b(?:dwarf )?planets?\b/, /\bmoons? of\b/, /\bnatural satellite\b/, /\bstar in the constellation\b/, /\b(?:star|binary star|red giant|red dwarf|supergiant|hypergiant|white dwarf|exoplanet|asteroid|trans-neptunian object|kuiper belt object)\b/],
  flower: [/\bflowers?\b/, /\bflowering plants?\b/, of("plants?|flowering plants?|orchids?|lilies|roses?|daisies|asters?|irises|tulips?|cacti|succulents?|shrubs?|herbaceous plants?"), /\bornamental plant\b/],
  tree: [/\btrees?\b/, of("trees?|conifers?|pines?|oaks?|maples?|palms?|firs?|spruces?|cedars?|cypress(?:es)?|eucalyptus|willows?|birch(?:es)?|figs?|acacias?")],
  gem: [/\bgemstones?\b/, /\bminerals?\b/, /\bvariety of (?:\w+ ){0,2}(?:quartz|beryl|corundum|feldspar|garnet|chalcedony|tourmaline)\b/, /\bsemi-?precious stone\b/, /\bprecious stone\b/],
  language: [/\blanguages?\b/, /\bdialect\b/, /\bconstructed language\b/],
  scifi: [/\bscience fiction\b.{0,40}\b(?:film|movie)\b/, /\bsci-?fi\b.{0,40}\b(?:film|movie)\b/, /\b(?:film|movie)\b.{0,40}\bscience fiction\b/],
  marvel: [/\bmarvel\b.{0,40}\b(?:film|movie)\b/, /\b(?:film|movie)\b.{0,40}\bmarvel\b/, /\bmcu\b/],
  villain: [/\bvillains?\b/, /\bantagonists?\b/, /\bsupervillains?\b/],
  show: [/\b(?:television|tv|web|streaming|animated|anime) (?:\w+ ){0,2}(?:series|show|sitcom|miniseries|programme|program)\b/, /\bsitcom\b/, /\bmini-?series\b/],
  toon: [/\banimated (?:\w+ ){0,3}(?:television |tv |web )?(?:series|show|sitcom)\b/, /\bcartoon (?:series|show)\b/, /\badult animated\b/],
  ghibli: [/\bstudio ghibli\b/, /\bghibli\b/],
  potter: [/\bharry potter\b/, /\bwizarding world\b/, /\bfantastic beasts\b/],
  naruto: [/\bnaruto\b/, /\bboruto\b/],
  onepiece: [/\bone piece\b/],
  dbz: [/\bdragon ball\b/],
  mario: [/\bmario\b/, /\bsuper mario\b/, /\bnintendo character\b/, /\bmushroom kingdom\b/],
  tarantino: [/\b(?:film|movie) (?:directed )?by (?:quentin tarantino|christopher nolan|stanley kubrick|steven spielberg)\b/, /\b(?:quentin tarantino|christopher nolan|stanley kubrick|steven spielberg)\b.{0,30}\b(?:film|movie)\b/],
  sport: [/\bsports?\b/, /\b(?:team|ball|combat|water|winter|motor|board|racket|cue|target|extreme|olympic|individual) sport\b/, /\bmartial arts?\b/, /\bgame played\b/],
  game: [/\bvideo games?\b/, /\b(?:action|adventure|role-playing|platform|puzzle|racing|fighting|shooter|strategy|simulation|survival|horror|indie|rhythm|sports|stealth|sandbox|battle royale|roguelike|roguelite|metroidvania|visual novel|mmorpg|moba) (?:\w+ ){0,2}game\b/, /\bgame (?:developed|published) by\b/, /\bvideo game series\b/, /\bvideo game franchise\b/],
  club: [/\b(?:association )?football club\b/, /\bsoccer (?:club|team)\b/, /\bfootball team\b/, /\bsports club\b/],
  nba: [/\bnational basketball association\b/, /\bnba\b/, /\bbasketball team\b/],
  footballer: [/\b(?:association )?football(?:er| player)\b/, /\bsoccer player\b/, /\bfootballer\b/],
  board: [/\bboard games?\b/, /\bcard games?\b/, /\btabletop (?:role-playing )?game\b/, /\btile-based game\b/, /\bdice game\b/, /\babstract strategy game\b/, /\bcollectible card game\b/, /\btrading card game\b/, /\bparty game\b/],
  console: [/\b(?:video game|home video game|handheld (?:game )?|gaming) consoles?\b/, /\bhandheld game console\b/, /\bhandheld gaming device\b/],
  gamechar: [/\bvideo game characters?\b/, /\bcharacter (?:in|from) (?:\w+ ){0,4}(?:video games?|game series|games?)\b/, /\bprotagonist of (?:\w+ ){0,4}(?:video games?|game series)\b/, /\bmascot\b/],
  f1: [/\bformula one\b/, /\bformula 1\b/, /\bracing driver\b/, /\bracing team\b/, /\b(?:grand prix|f1) driver\b/, /\bconstructor\b/],
  trick: [/\b(?:skateboarding|snowboarding|bmx|freestyle|skiing) (?:trick|manoeuvre|maneuver)\b/, /\btrick in (?:skateboarding|snowboarding|bmx)\b/],
  car: [/\b(?:automobile|car|automotive|motor vehicle|vehicle|sports car|truck|electric vehicle) (?:manufacturer|maker|brand|marque|company)\b/, /\bmarque\b/, /\bcar brand\b/, /\bautomaker\b/],
  brand: [/\b(?:fashion|clothing|apparel|streetwear|sportswear|luxury|footwear|denim|outdoor clothing) (?:brand|label|house|company|retailer|designer)\b/, /\bfashion designer\b/, /\bclothing line\b/],
  sneaker: [/\bsneakers?\b/, /\b(?:athletic|basketball|running|skate) shoes?\b/, /\bshoe (?:model|line)\b/, /\bline of (?:\w+ ){0,2}(?:shoes|sneakers|footwear)\b/],
  app: [/\b(?:mobile |web |social media |messaging |dating |music streaming |video streaming |video-sharing |photo-sharing )?(?:app|application|website|web site|social network(?:ing service)?|online platform|online service|search engine|streaming service|messaging service|web browser)\b/],
  kitchen: [/\bkitchen(?:ware| utensil| appliance| tool)?s?\b/, /\b(?:cookware|utensil|home appliance|household appliance|cooking appliance|tableware|cutlery)\b/],
  job: [/\boccupations?\b/, /\bprofessions?\b/, /\bjob title\b/, /\btrade\b/, /\bprofessional who\b/, /\bperson who\b/],
  color: [/\bcolou?rs?\b/, /\bshade of\b/, /\btint of\b/, /\bhue\b/],
  bodypart: [/\banatomical (?:structure|feature|region|part)\b/, /\bpart of the (?:human )?body\b/, /\bbody part\b/, /\b(?:organ|bone|muscle|gland|joint) (?:of|in) (?:the )?(?:human )?\b/, /\b(?:organ|bone|muscle|gland|joint)\b/],
  painter: [/\bpainters?\b/, /\bsculptors?\b/, /\b(?:visual|graffiti|street|pop|contemporary|conceptual|installation) artist\b/, /\billustrators?\b/, /\bprintmakers?\b/],
};

// a disambiguation page or a person's name is never an answer
const NEVER = /\b(?:disambiguation|wikimedia|family name|surname|given name|male given name|female given name|list of|scientific article|scholarly article|human settlement|village in|town in|city in|commune in|municipality in)\b/;

type WD = { id: string; label?: string; description?: string; match?: { text?: string }; aliases?: string[] };

/** ask Wikidata: is there a thing called `typed` that fits this prompt? Returns its proper name, or null. */
export async function wikidataLookup(promptId: string, typed: string): Promise<string | null> {
  const rules = RULES[promptId];
  const q = typed.trim().slice(0, 60);
  const want = norm(q);
  if (!rules || want.length < 2) return null;
  if (promptId === "starts-p" && !want.startsWith("p")) return null;
  const same = (s?: string): boolean => {
    if (!s) return false;
    if (s.includes(":") && same(s.split(":")[0])) return true; // "Frieren: Beyond Journey's End" = "frieren"
    const k = norm(s).replace(/ \(.*\)$/, "");
    return k === want || k.replace(/ /g, "") === want.replace(/ /g, "") || k === want.replace(/s$/, "") || k + "s" === want || k === want.replace(/es$/, "");
  };
  const url =
    "https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=12&search=" + encodeURIComponent(q);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { headers: { "User-Agent": "PinkDive/1.0 (https://pinkmane.site; daily word game)" }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { search?: WD[] };
    for (const r of data.search ?? []) {
      const desc = (r.description ?? "").toLowerCase();
      if (!desc || NEVER.test(desc)) continue;
      // the name that matched what was typed (a species' main name can be its Latin one: then show the English one typed)
      const name = same(r.label) ? r.label : same(r.match?.text) ? r.match?.text : (r.aliases ?? []).find(same);
      if (!name) continue;
      if (rules.some((re) => re.test(desc))) return name.slice(0, 40);
    }
  } catch {
    // Wikidata didn't answer in time: the answer just doesn't count this time
  }
  return null;
}
