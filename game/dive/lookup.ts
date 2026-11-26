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
