// PINK DIVE: every prompt and every answer it accepts.
//
// Each prompt has 5 tiers of answers, from the most obvious to the rarest:
//   [0] PLANKTON  (everyone says it)        10 m
//   [1] SCHOOL    (common)                  25 m
//   [2] RARE                                45 m
//   [3] DEEP CUT  (you really know it)      70 m
//   [4] ONE IN A MILLION                   100 m
// (the points and names are in TIERS below)
//
// Answers are separated by commas. Other names for the same answer go after a "|":
//   "hippopotamus|hippo" accepts "hippo" too (and scores the same).
// Small typos are forgiven, and "the" in front doesn't matter.
//
// TO ADD A PROMPT: copy one, change the question and the answers. TO ADD AN ANSWER: put it in the tier that fits.
// Every day 7 prompts are picked from this list (game/dive/daily.ts), the same for everyone.

export type Cat = "ANIMALS" | "FOOD" | "MUSIC" | "EARTH" | "FILM & CARTOONS";

export type Prompt = { id: string; cat: Cat; q: string; t: [string, string, string, string, string] };

export const TIERS = [
  { name: "PLANKTON", depth: 10, color: "#9fe8ff" },
  { name: "SCHOOL FISH", depth: 25, color: "#56c8ff" },
  { name: "RARE", depth: 45, color: "#ff5fd2" },
  { name: "DEEP CUT", depth: 70, color: "#b77cff" },
  { name: "ONE IN A MILLION", depth: 100, color: "#ffd84a" },
] as const;

export const PROMPTS: Prompt[] = [
  // ------------------------------------------------------------------ ANIMALS
  {
    id: "fish",
    cat: "ANIMALS",
    q: "NAME A FISH",
    t: [
      "salmon, tuna, shark, goldfish, clownfish|nemo, cod",
      "trout, catfish, swordfish, piranha, carp, pufferfish|puffer fish|blowfish, sardine, mackerel, bass, angelfish, stingray",
      "halibut, herring, anchovy, tilapia, pike, barracuda, marlin, eel, guppy, betta|betta fish|siamese fighting fish, koi, haddock, sole, sturgeon, perch, sunfish|mola, hammerhead shark|hammerhead, great white shark|great white, swordtail",
      "grouper, snapper|red snapper, mahi mahi|dorado, monkfish, anglerfish, flounder, lionfish, seahorse, wahoo, zander, walleye, bream, plaice, turbot, mullet, roach, minnow, tetra|neon tetra, molly, platy, gar, arowana, oscar, discus, bluegill, triggerfish, parrotfish, wrasse, tang|blue tang, goby, remora, lamprey, hagfish",
      "coelacanth, oarfish, blobfish, barreleye, sarcastic fringehead, frogfish, handfish, mudskipper, archerfish, snakehead, tarpon, bonefish, opah|moonfish, lumpsucker, wobbegong, goblin shark, frilled shark, sawfish, paddlefish, bowfin, arapaima, payara, pacu, candiru, stonefish, gurnard, john dory, dragonet, mandarinfish, gulper eel, viperfish, dragonfish, lanternfish, icefish, hatchetfish, flashlight fish, shovelnose, bichir, lungfish, sheepshead",
    ],
  },
  {
    id: "bird",
    cat: "ANIMALS",
    q: "NAME A BIRD",
    t: [
      "eagle, parrot, pigeon, penguin, owl, chicken",
      "crow, duck, flamingo, ostrich, robin, swan, sparrow, seagull|gull, peacock, hummingbird, turkey, hawk, falcon, pelican, toucan",
      "goose, raven, woodpecker, blue jay, cardinal, magpie, stork, heron, vulture, emu, canary, budgie|budgerigar, finch, cockatoo, macaw, kiwi, condor, puffin, albatross, swallow, dove, starling",
      "kingfisher, cormorant, osprey, kestrel, buzzard, crane, ibis, egret, roadrunner, nightingale, wren, lark, mockingbird, oriole, jay, quail, pheasant, partridge, grouse, cassowary, rhea, lovebird, cockatiel, kookaburra, hornbill, warbler, thrush, blackbird, bluebird, tit|great tit|blue tit, nuthatch",
      "shoebill, hoatzin, kakapo, quetzal, secretary bird, lyrebird, bowerbird, frigatebird, booby|blue footed booby, potoo, tawny frogmouth|frogmouth, oilbird, takahe, kea, hoopoe, bee eater, roller, wryneck, dipper, treecreeper, shrike, waxwing, bunting, grosbeak, tanager, avocet, curlew, godwit, sandpiper, plover, lapwing, bittern, spoonbill, jacana, coot, moorhen, grebe, loon, merganser, wigeon, gannet, skua, auk, guillemot, nightjar, swift, capercaillie, ptarmigan",
    ],
  },
  {
    id: "dog",
    cat: "ANIMALS",
    q: "NAME A DOG BREED",
    t: [
      "labrador|lab|labrador retriever, golden retriever, german shepherd, chihuahua, pug, poodle, bulldog",
      "husky|siberian husky, beagle, rottweiler, dachshund|sausage dog, pitbull|pit bull, doberman, french bulldog|frenchie, corgi, boxer, great dane, dalmatian, border collie, shih tzu, yorkshire terrier|yorkie",
      "pomeranian, maltese, cocker spaniel, bichon frise|bichon, schnauzer, shiba inu|shiba, akita, saint bernard|st bernard, bernese mountain dog|bernese, chow chow, bull terrier, jack russell|jack russell terrier, greyhound, malamute|alaskan malamute, collie, samoyed, mastiff, cane corso, australian shepherd|aussie",
      "basset hound, bloodhound, whippet, weimaraner, vizsla, newfoundland, shar pei, sheltie|shetland sheepdog, papillon, cavalier king charles spaniel|cavalier, lhasa apso, west highland terrier|westie, scottish terrier|scottie, boston terrier, staffordshire terrier|staffy|amstaff, belgian malinois|malinois, dogo argentino, rhodesian ridgeback, pointer, setter|irish setter, irish wolfhound, afghan hound, borzoi, basenji, airedale",
      "xoloitzcuintli|xolo, komondor, puli, bergamasco, leonberger, tibetan mastiff, kuvasz, saluki, sloughi, azawakh, otterhound, lagotto romagnolo, spinone, norwegian elkhound, finnish spitz, keeshond, schipperke, affenpinscher, brussels griffon, coton de tulear, bolognese, lowchen, chinese crested, peruvian inca orchid, catahoula, mudi, pumi, slovak cuvac|cuvac, czechoslovakian wolfdog, kai ken, kishu, jindo, thai ridgeback, bedlington terrier, dandie dinmont, sealyham, glen of imaal",
    ],
  },
  {
    id: "africa-animal",
    cat: "ANIMALS",
    q: "NAME AN ANIMAL THAT LIVES IN AFRICA",
    t: [
      "lion, elephant, giraffe, zebra",
      "cheetah, hippopotamus|hippo, rhinoceros|rhino, gorilla, leopard, hyena, crocodile, chimpanzee|chimp, flamingo, ostrich, meerkat",
      "wildebeest|gnu, gazelle, antelope, warthog, baboon, buffalo|cape buffalo, impala, camel, lemur, vulture, cobra, black mamba|mamba, jackal",
      "okapi, aardvark, pangolin, mandrill, bonobo, kudu, oryx, springbok, eland, wild dog|african wild dog|painted dog, caracal, serval, fennec fox|fennec, honey badger, mongoose, dik dik, topi, puff adder, secretary bird, shoebill, marabou stork|marabou, hornbill, nile monitor",
      "aye aye, fossa, klipspringer, bongo, sitatunga, gerenuk, bontebok, nyala, hartebeest, duiker, galago|bushbaby, hyrax, aardwolf, civet, genet, gelada, colobus, mangabey, naked mole rat, pygmy hippo, african penguin, quelea, hamerkop, ground hornbill, ratel, zorilla, springhare, sengi|elephant shrew",
    ],
  },
  {
    id: "bug",
    cat: "ANIMALS",
    q: "NAME AN INSECT OR A BUG",
    t: [
      "ant, bee, fly, butterfly, mosquito, spider",
      "ladybug|ladybird, cockroach|roach, beetle, wasp, grasshopper, dragonfly, moth, cricket, caterpillar, flea, termite",
      "firefly, praying mantis|mantis, stick insect, bumblebee, hornet, tick, scorpion, centipede, millipede, louse|lice, bed bug, silverfish, earwig, cicada, aphid, weevil",
      "stag beetle, dung beetle, june bug, katydid, locust, mayfly, damselfly, lacewing, horsefly, gnat, midge, sawfly, water strider, firebug, stink bug|shield bug, leafhopper, thrips, woodlouse, harvestman|daddy long legs, tarantula, black widow",
      "hercules beetle, goliath beetle, atlas moth, luna moth, weta, assassin bug, orchid mantis, leaf insect, antlion, dobsonfly, scorpionfly, caddisfly, stonefly, springtail, bristletail, booklouse, velvet ant, tarantula hawk, bullet ant, army ant, leafcutter ant, botfly, tsetse fly, robber fly, bombardier beetle, rhinoceros beetle, jewel beetle, click beetle, tiger beetle, whip scorpion, camel spider|solifuge, pseudoscorpion, peacock spider",
    ],
  },
  {
    id: "sea",
    cat: "ANIMALS",
    q: "NAME A SEA CREATURE THAT ISN'T A FISH",
    t: [
      "dolphin, whale, octopus, jellyfish, crab, shark",
      "starfish|sea star, squid, lobster, shrimp, turtle|sea turtle, seal, orca|killer whale, sea lion, blue whale, otter|sea otter",
      "walrus, manatee, sea urchin, oyster, clam, mussel, coral, narwhal, beluga, humpback whale|humpback, sperm whale, anemone|sea anemone, sea cucumber, krill, scallop, penguin",
      "cuttlefish, nautilus, hermit crab, king crab, mantis shrimp, barnacle, sponge, dugong, porpoise, sea slug|nudibranch, sea snake, horseshoe crab, sand dollar, conch, box jellyfish, man o war|portuguese man o war, elephant seal, leopard seal, sea pen",
      "vampire squid, dumbo octopus, blue ringed octopus, giant isopod, sea butterfly|pteropod, comb jelly|ctenophore, salp, siphonophore, sea angel, yeti crab, coconut crab, spider crab|japanese spider crab, tube worm, bobbit worm, christmas tree worm, feather star|crinoid, brittle star, sea lily, vaquita, bowhead whale, beaked whale, pilot whale, hooded seal, squat lobster, sea spider, tardigrade, coral polyp, glass sponge, olm",
    ],
  },
  {
    id: "reptile",
    cat: "ANIMALS",
    q: "NAME A REPTILE",
    t: [
      "snake, crocodile, lizard, turtle, alligator",
      "tortoise, chameleon, iguana, gecko, cobra, python, komodo dragon, rattlesnake",
      "anaconda, boa|boa constrictor, viper, black mamba|mamba, gila monster, monitor lizard|monitor, bearded dragon, sea turtle, caiman, garter snake, king cobra, skink",
      "gharial, leatherback, snapping turtle, box turtle, tuatara, basilisk, frilled lizard, thorny devil, horned lizard, anole, corn snake, milk snake, king snake, taipan, adder, coral snake, sea snake, copperhead, cottonmouth|water moccasin, sidewinder, galapagos tortoise",
      "slow worm, glass lizard, amphisbaena|worm lizard, flying dragon|draco, flying snake, mata mata, softshell turtle, alligator snapping turtle, blind snake, sunbeam snake, rinkhals, boomslang, bushmaster, fer de lance, gaboon viper, mangrove snake, uromastyx, tegu, chuckwalla, leopard gecko, crested gecko, tokay gecko, panther chameleon, marine iguana, false gharial, dwarf crocodile",
    ],
  },
  {
    id: "farm",
    cat: "ANIMALS",
    q: "NAME A FARM ANIMAL",
    t: [
      "cow, pig, chicken, horse, sheep",
      "goat, duck, donkey, turkey, rooster, goose, bull, lamb",
      "llama, alpaca, rabbit, pony, ox|oxen, mule, cat, dog, calf, piglet, hen",
      "water buffalo|buffalo, yak, quail, guinea fowl, pheasant, bees|bee, peacock, emu, ostrich, camel, mini pig, hog, boar, ram, ewe, heifer, steer",
      "zebu, reindeer, guinea pig, chinchilla, silkworm, snail, catfish, tilapia, carp, bison, angora goat, highland cow, wagyu, jersey cow, holstein, berkshire pig, mangalica, silkie chicken, muscovy duck, pekin duck, hinny, zonkey",
    ],
  },
  {
    id: "starts-p",
    cat: "ANIMALS",
    q: "NAME AN ANIMAL THAT STARTS WITH P",
    t: [
      "panda, penguin, pig, parrot",
      "panther, polar bear, puppy, peacock, pigeon, pony, puma, python, pelican",
      "porcupine, platypus, pufferfish|puffer fish, piranha, possum, porpoise, poodle, puffin, pheasant, prawn, praying mantis, pug, pike",
      "pangolin, pika, peccary, pronghorn, ptarmigan, partridge, perch, plaice, pollock, pomeranian, pine marten, polecat, prairie dog, ball python|royal python, pit viper",
      "pademelon, pudu, potoo, potto, pacu, paca, puku, pygmy hippo, pied tamarin, proboscis monkey, peregrine falcon, pipit, plover, pochard, puffbird, purple martin, pyrosome, pteranodon, pupfish, peacock spider",
    ],
  },

  // ------------------------------------------------------------------ FOOD
  {
    id: "fruit",
    cat: "FOOD",
    q: "NAME A FRUIT",
    t: [
      "apple, banana, orange, strawberry, grape, watermelon",
      "mango, pineapple, peach, pear, cherry, lemon, kiwi, blueberry, raspberry, coconut, plum",
      "melon, lime, grapefruit, pomegranate, papaya, apricot, fig, avocado, tomato, cantaloupe, blackberry, nectarine, cranberry, tangerine|mandarin, passion fruit, honeydew",
      "lychee, dragon fruit|pitaya, guava, persimmon, kumquat, date, quince, gooseberry, currant|redcurrant|blackcurrant, mulberry, elderberry, star fruit|carambola, jackfruit, clementine, olive, plantain, boysenberry, acai, goji",
      "durian, rambutan, mangosteen, longan, salak|snake fruit, cherimoya, soursop|guanabana, sapodilla, feijoa, loquat, jabuticaba, tamarind, ackee, breadfruit, pawpaw, medlar, yuzu, buddha's hand, physalis|cape gooseberry, miracle fruit, horned melon|kiwano, cloudberry, lingonberry, rowan, sea buckthorn, ugli fruit, pomelo, bergamot",
    ],
  },
  {
    id: "veg",
    cat: "FOOD",
    q: "NAME A VEGETABLE",
    t: [
      "carrot, potato, broccoli, tomato, onion, lettuce",
      "cucumber, pepper|bell pepper, corn, peas, spinach, cabbage, garlic, mushroom, cauliflower, celery, zucchini|courgette",
      "eggplant|aubergine, pumpkin, beans|green beans, kale, sweet potato, asparagus, radish, beetroot|beet, brussels sprouts, leek, artichoke, squash, chili|chilli, avocado",
      "turnip, parsnip, okra, fennel, bok choy|pak choi, arugula|rocket, endive, chard, kohlrabi, shallot, spring onion|scallion, watercress, rhubarb, yam, cassava|yuca, edamame, butternut squash",
      "celeriac, salsify, jicama, daikon, romanesco, sunchoke|jerusalem artichoke, taro, lotus root, bamboo shoot, bitter melon, chayote, rutabaga|swede, mizuna, tatsoi, samphire, nettle, fiddlehead, cardoon, oca, mashua, ulluco, purslane, sorrel, kai lan|chinese broccoli",
    ],
  },
  {
    id: "pasta",
    cat: "FOOD",
    q: "NAME A PASTA SHAPE",
    t: [
      "spaghetti, penne, macaroni, lasagna|lasagne",
      "fusilli, ravioli, tortellini, fettuccine, linguine, farfalle|bow tie, rigatoni",
      "tagliatelle, gnocchi, cannelloni, orzo, conchiglie|shells, pappardelle, vermicelli, angel hair|capellini, ziti",
      "orecchiette, bucatini, ditalini, cavatappi, rotini, gemelli, paccheri, tortelloni, agnolotti, manicotti, radiatori, campanelle, stelline, anelli",
      "trofie, strozzapreti, casarecce, malloreddus, fregola, pici, bigoli, garganelli, mafaldine|reginette, lumache, cappelletti, mezzelune, culurgiones, corzetti, scialatielli, sagne, tripoline, fileja, lorighittas, passatelli, spaetzle",
    ],
  },
  {
    id: "cheese",
    cat: "FOOD",
    q: "NAME A CHEESE",
    t: [
      "cheddar, mozzarella, parmesan, brie",
      "gouda, feta, swiss, camembert, blue cheese, cream cheese, edam, ricotta",
      "gorgonzola, roquefort, halloumi, mascarpone, emmental, gruyere, provolone, stilton, cottage cheese, monterey jack, pecorino, burrata",
      "manchego, comte, raclette, taleggio, fontina, havarti, jarlsberg, paneer, queso fresco, asiago, grana padano, red leicester, wensleydale, oaxaca, colby, boursin, munster, reblochon",
      "bryndza, oscypek, korbacik, parenica, epoisses, vacherin, livarot, pont l'eveque, tomme, cantal, saint nectaire, beaufort, appenzeller, tete de moine, limburger, casu marzu, stracchino, robiola, caciocavallo, scamorza, castelo branco, idiazabal, mahon, kashkaval, sirene, gjetost|brunost, cotija, chhena, mimolette, shropshire blue, cashel blue",
    ],
  },
  {
    id: "pizza",
    cat: "FOOD",
    q: "NAME A PIZZA TOPPING",
    t: [
      "pepperoni, cheese, mushroom, ham, pineapple",
      "sausage, olives, onion, peppers, bacon, chicken, tomato, salami, jalapeno",
      "spinach, anchovies, basil, garlic, beef, tuna, corn, egg, rocket|arugula, bbq sauce",
      "prosciutto, artichoke, capers, ricotta, gorgonzola, chorizo, nduja, sun dried tomato, feta, goat cheese, meatballs, shrimp|prawns",
      "truffle, figs, honey, pistachio, burrata, potato, kimchi, pear, walnut, zucchini flower, smoked salmon, clams, egg yolk, speck, mortadella, broccoli rabe|rapini, caramelised onion, hot honey, chilli flakes",
    ],
  },
  {
    id: "asia-dish",
    cat: "FOOD",
    q: "NAME A DISH FROM ASIA",
    t: [
      "sushi, ramen, fried rice, curry",
      "pad thai, dumplings, spring rolls, kimchi, pho, noodles, teriyaki, dim sum",
      "tempura, bibimbap, satay, biryani, butter chicken, kung pao chicken, peking duck, laksa, tikka masala, udon, miso soup, bao|bao buns",
      "katsu curry, tom yum, green curry, banh mi, nasi goreng, rendang, okonomiyaki, takoyaki, gyoza, bulgogi, korean fried chicken, tteokbokki, samosa, dal|dahl, naan, sashimi, onigiri, mapo tofu, char siu, xiao long bao",
      "khao soi, larb, som tam|papaya salad, nasi lemak, mohinga, adobo, sinigang, lechon, balut, bun cha, cao lau, hainanese chicken rice, char kway teow, roti canai, dosa, idli, vada pav, pani puri, momo, plov, laghman, manti, natto, unagi don, japchae, sundubu, jjajangmyeon",
    ],
  },
  {
    id: "candy",
    cat: "FOOD",
    q: "NAME A CANDY OR A CHOCOLATE BAR",
    t: [
      "snickers, kitkat|kit kat, m&ms|m and ms|mnms, twix, skittles",
      "mars, reese's|reeses, haribo, milky way, toblerone, bounty, kinder, lollipop, maltesers, smarties",
      "milka, oreo, twizzlers, starburst, nerds, gummy bears, hershey's|hersheys, ferrero rocher, mentos, tic tac, sour patch kids, butterfinger, chupa chups",
      "3 musketeers|three musketeers, baby ruth, almond joy, kinder bueno, lion, aero, crunch, wonka, jolly rancher, airheads, swedish fish, jelly belly, cadbury, galaxy, ritter sport, raffaello, lindt, after eight, polo, werthers",
      "horalky, kofila, deli, tatranky, mila, studentska pecet, fidorka, bebe, kinder country, rolo, crunchie, flake, wispa, double decker, caramac, toffee crisp, picnic, boost, curly wurly, fruitella, chewits, haribo starmix, pocky, hi chew, koala march, botan rice candy, kasugai, kinder joy",
    ],
  },
  {
    id: "fastfood",
    cat: "FOOD",
    q: "NAME A FAST FOOD CHAIN",
    t: [
      "mcdonalds|mcdonald's|mcd, burger king, kfc, subway",
      "wendys|wendy's, taco bell, dominos|domino's, pizza hut, starbucks, five guys, popeyes, chick fil a",
      "dunkin|dunkin donuts, papa johns|papa john's, chipotle, in n out, arbys|arby's, sonic, nandos|nando's, little caesars, dairy queen, jack in the box, panda express, shake shack",
      "white castle, carls jr|carl's jr, hardees, whataburger, culvers, jollibee, wingstop, raising canes, del taco, panera, tim hortons, greggs, pret|pret a manger, wimpy, quick",
      "jersey mikes, jimmy johns, el pollo loco, bojangles, churchs chicken, steak n shake, freddys, cook out, zaxbys, mos burger, lotteria, max burgers, hesburger, telepizza, vapiano, nordsee",
    ],
  },
  {
    id: "strain",
    cat: "FOOD",
    q: "NAME A WEED STRAIN",
    t: [
      "og kush, purple haze, sour diesel, blue dream, white widow",
      "gelato, girl scout cookies|gsc|cookies, gorilla glue|gg4|gorilla glue 4, pineapple express, northern lights, amnesia haze|amnesia, ak 47|ak47, wedding cake, runtz, zkittlez|skittlez|skittles, lemon haze, kush",
      "jack herer, super lemon haze, super silver haze, granddaddy purple|gdp|grand daddy purple, green crack, durban poison, skywalker og|skywalker, bubba kush, trainwreck, maui wowie|maui waui, acapulco gold, cheese|uk cheese, blueberry, strawberry cough, bruce banner, sunset sherbet|sherbet|sherbert, do si dos|dosidos, mimosa, gmo|gmo cookies|garlic cookies, purple punch, ice cream cake, critical|critical mass, hindu kush, afghan kush|afghani, chemdawg|chemdog, haze, white rhino, gushers, biscotti, pink runtz, white runtz",
      "headband, tangie, mac|miracle alien cookies|mac 1, london pound cake|pound cake, apple fritter, cereal milk, gary payton, jealousy, rainbow belts, rs11|rainbow sherbet 11, zoap, permanent marker, lemon cherry gelato, la confidential, la kush cake, kush mints, animal mints, animal cookies, thin mint, cherry pie, forbidden fruit, tropicana cookies|trop cookies, papaya, mango kush, banana kush, strawberry banana, grape ape, purple kush, purple urkle|urkle, mendo breath, platinum og, king louis xiii|king louis, tahoe og, sfv og, fire og, wifi og|white fire og, ghost og, alien og, stardawg, sour tangie, super skunk, skunk|skunk 1, lemon skunk, cinderella 99|c99, harlequin, acdc, charlottes web, g13, alaskan thunder fuck|atf, chocolope, laughing buddha, lambs bread|lambs breath, thai stick|thai, colombian gold, panama red, malawi gold, moby dick, gorilla zkittlez, slurricane, sundae driver, wedding crasher, peanut butter breath, oreoz, gelato 41, gelato 33|larry bird, black cherry gelato, lava cake, motor breath, grease monkey, tropicanna punch, blue cheese, blue zushi|zushi, cali kush, lemon tree, pink kush, death bubba, tom ford pink kush, black domina, blackberry kush, bubblegum, juicy fruit, ny diesel|nyc diesel, sour og, sour kush, critical kush, amnesia lemon, silver haze, neville's haze|nevilles haze, white russian, great white shark, snow white, big bud, power plant, jack frost, white berry, ice, blue mystic, kali mist",
      "pink panties, khalifa kush|kk, biscotti mintz, superboof, blockberry, cap junky, dante's inferno|dantes inferno, runtz muffin, obama runtz, georgia pie, marshmallow og, ice cream man, pure michigan, garlic breath, gmo zkittlez, donny burger, han solo burger, dulce de uva, lemon pepper, chimera, modified grapes, grape gasoline, jet fuel gelato, candy rain, gello, y griega, mochi|mochi gelato, guava, guava gelato, gelonade, ether, runtz og, sherb cream pie, sherbacio, zacks pie, bacio gelato, moonbow, the soap, trufflez|white truffle|truffle, black truffle, horchata, jokerz, project 4516, starburst og, e85, zerbert, bubble bath, compound z, waiting game, grandi guava, pave|the pave, pressure, pink certz, la pop rocks, cheetah piss, cat piss, gelato cake, wedding pie, triangle kush, triangle mints, cuban linx, face off og, pre 98 bubba, master kush, vanilla kush, lavender, lsd, hash plant, afghan skunk, shiva skunk, hawaiian snow, utopia haze, amnesia core cut, dr grinspoon, nepalese, nevil's wreck, swazi gold, durban kush, red congolese, kilimanjaro, lemon thai, chocolate thai, hawaiian haze, mexican sativa, romulan, mk ultra, blue moonshine, purple afghani, querkle, plushberry, agent orange, pinkmane kush",
    ],
  },
  {
    id: "breakfast",
    cat: "FOOD",
    q: "NAME A BREAKFAST FOOD",
    t: [
      "eggs, pancakes, cereal, toast, bacon",
      "waffles, croissant, oatmeal|porridge, yogurt, french toast, bagel, sausage, omelette, muffin",
      "scrambled eggs, granola, avocado toast, hash browns, smoothie, fruit salad, eggs benedict, muesli, beans|baked beans, donut",
      "full english, shakshuka, crepes, english muffin, grits, biscuits and gravy, breakfast burrito, quiche, kippers, black pudding, porridge oats, chia pudding, acai bowl",
      "huevos rancheros, chilaquiles, congee, natto, khachapuri, menemen, poha, upma, paratha, dosa, ful medames, kaya toast, migas, frittata, kedgeree, bubble and squeak, rösti|rosti, pain au chocolat, kaiserschmarrn, halusky, kasha, syrniki",
    ],
  },

  // ------------------------------------------------------------------ MUSIC
  {
    id: "rapper",
    cat: "MUSIC",
    q: "NAME A RAPPER",
    t: [
      "eminem, drake, travis scott, kendrick lamar|kendrick, 50 cent",
      "snoop dogg, lil wayne, jay z|jay-z, nicki minaj, tupac|2pac, j cole, post malone, cardi b, future, lil uzi vert|uzi, playboi carti|carti, a$ap rocky|asap rocky, xxxtentacion|x, juice wrld, lil peep|peep",
      "notorious big|biggie|biggie smalls, 21 savage, young thug, gunna, lil baby, dababy, megan thee stallion, doja cat, tyler the creator|tyler, mac miller, nas, ice cube, dr dre, lil nas x, pop smoke, roddy ricch, metro boomin, ski mask the slump god|ski mask, lil yachty, migos, offset, quavo, takeoff, kodak black, nba youngboy|youngboy",
      "ken carson, destroy lonely, yeat, lil tecca, trippie redd, denzel curry, jid, earl sweatshirt, mf doom, wu tang clan, method man, ghostface killah, rza, gza, ol dirty bastard, outkast, andre 3000, big boi, missy elliott, lauryn hill, schoolboy q, ab soul, vince staples, freddie gibbs, danny brown, joey badass, smokepurpp, lil pump, 6ix9ine, comethazine, ghostemane, $uicideboy$|suicideboys|suicide boys, bones, pouya, yung lean|lean, bladee",
      "rx papi, che, nettspend, osamason, summrs, autumn, kankan, lucki, pierre bourne, sematary, ecco2k, thaiboy digital|thaiboy, lil tracy|tracy, night lovell, scarlxrd, xavier wulf, chris travis, zillakami, city morgue, 2hollis, tombfell, o1m4de, slowthai, little simz, stormzy, dave, central cee, skepta, aitch, jpegmafia, billy woods, mike, earl, mavi, westside gunn, conway the machine, benny the butcher, boldy james, mach hommy, ka, roc marciano, rakim, krs one, big daddy kane, slick rick, kool g rap, rah digga, pinkmane",
    ],
  },
  {
    id: "genre",
    cat: "MUSIC",
    q: "NAME A MUSIC GENRE",
    t: [
      "rap|hip hop|hiphop, pop, rock, jazz, country, edm",
      "rnb|r&b|r and b, techno, house, metal, classical, reggae, trap, blues, punk, disco, kpop|k-pop",
      "drill, reggaeton, dubstep, drum and bass|dnb, funk, soul, gospel, indie, grunge, emo, folk, latin, afrobeats, lofi|lo-fi, opera",
      "cloud rap, rage, plugg, phonk, hyperpop, shoegaze, trance, garage|uk garage, grime, ska, bossa nova, salsa, flamenco, dancehall, synthwave, vaporwave, trip hop, ambient, hardstyle, jersey club, boom bap, emo rap, new wave, post punk",
      "pluggnb, jerk, digicore, witch house, chopped and screwed, memphis rap, footwork, juke, gqom, amapiano, baile funk, kuduro, vaporwave mallsoft|mallsoft, glitch hop, breakcore, idm, gabber, chiptune, math rock, sludge metal, black metal, doom metal, noise rock, krautrock, zouk, cumbia, bachata, highlife, mbalax, qawwali, enka, polka, fado, chalga, manele",
    ],
  },
  {
    id: "instrument",
    cat: "MUSIC",
    q: "NAME A MUSICAL INSTRUMENT",
    t: [
      "guitar, piano, drums, violin",
      "bass|bass guitar, trumpet, saxophone|sax, flute, cello, keyboard, harmonica, ukulele",
      "clarinet, harp, trombone, tuba, accordion, banjo, xylophone, triangle, tambourine, synthesizer|synth, organ, oboe, viola, bongos",
      "double bass, french horn, bassoon, piccolo, mandolin, sitar, bagpipes, cowbell, marimba, glockenspiel, timpani, cymbal, didgeridoo, steel drum|steelpan, kalimba, theremin, 808|tr 808, sampler, turntables",
      "hurdy gurdy, theorbo, lute, oud, kora, balalaika, shamisen, koto, erhu, pipa, guzheng, tabla, mridangam, djembe, cajon, darbuka, bodhran, ocarina, pan flute, shakuhachi, fujara, zither, celesta, harpsichord, clavichord, ondes martenot, hang drum|handpan, mellotron, vocoder, talkbox, keytar, otamatone",
    ],
  },
  {
    id: "band",
    cat: "MUSIC",
    q: "NAME A BAND",
    t: [
      "the beatles|beatles, queen, nirvana, coldplay, linkin park, metallica",
      "ac/dc|acdc, the rolling stones|rolling stones, imagine dragons, gorillaz, maroon 5, red hot chili peppers|rhcp, green day, guns n roses, arctic monkeys, led zeppelin, pink floyd, bts",
      "radiohead, the strokes|strokes, foo fighters, blink 182, oasis, u2, my chemical romance, fall out boy, slipknot, system of a down, evanescence, daft punk, abba, blackpink, one direction, the killers",
      "tame impala, twenty one pilots, paramore, panic at the disco, muse, the cure, joy division, depeche mode, kraftwerk, black sabbath, iron maiden, deftones, korn, rammstein, tool, the clash, ramones, sex pistols, talking heads, fleetwood mac, the doors, the white stripes, the smiths, pixies",
      "drain gang, death grips, mbv|my bloody valentine, slowdive, cocteau twins, swans, godspeed you black emperor, neutral milk hotel, sonic youth, black midi, black country new road, king gizzard, idles, fontaines dc, turnstile, have a nice life, duster, alice in chains, mudhoney, melvins, bauhaus, siouxsie and the banshees, the stooges, mc5, can, neu, wu tang clan, the fugees, outkast",
    ],
  },
  {
    id: "singer",
    cat: "MUSIC",
    q: "NAME A FEMALE SINGER",
    t: [
      "taylor swift, beyonce, rihanna, ariana grande, billie eilish, adele",
      "lady gaga, dua lipa, katy perry, sza, selena gomez, olivia rodrigo, shakira, madonna, miley cyrus, britney spears, sabrina carpenter",
      "nicki minaj, doja cat, lana del rey, whitney houston, mariah carey, celine dion, christina aguilera, alicia keys, lorde, sia, halsey, camila cabello, charli xcx, chappell roan, gracie abrams",
      "amy winehouse, aaliyah, erykah badu, lauryn hill, janet jackson, tina turner, aretha franklin, cher, bjork, florence welch|florence, tinashe, kehlani, summer walker, jhene aiko, ice spice, doechii, grimes, rosalia, kali uchis, solange, normani, ella mai, h.e.r.|her, victoria monet",
      "fka twigs, caroline polachek, arca, sevdaliza, ethel cain, mitski, phoebe bridgers, japanese breakfast, weyes blood, julia holter, kate bush, nina simone, billie holiday, ella fitzgerald, etta james, sade, elizabeth fraser, liz phair, joni mitchell, nico, dolores o'riordan, karen carpenter, minnie riperton, chaka khan, tkay maidza, yeule, ashnikko, slayyyter",
    ],
  },
  {
    id: "producer",
    cat: "MUSIC",
    q: "NAME A MUSIC PRODUCER",
    t: [
      "metro boomin, dr dre, timbaland, pharrell|pharrell williams",
      "southside, wheezy, tay keith, mike will made it|mike will, murda beatz, zaytoven, pi'erre bourne|pierre bourne, max martin, rick rubin, quincy jones, j dilla, the alchemist|alchemist",
      "london on da track, cubeatz, nick mira, taz taylor, f1lthy, oogie mane, 808 mafia, sonny digital, dj mustard|mustard, hit-boy|hit boy, boi-1da|boi 1da, 40|noah 40 shebib, no i.d.|no id, just blaze, madlib, 9th wonder, kenny beats, ronny j, jake one",
      "harry fraud, take a daytrip, ojivolta, dez wright, outtatown, cash cobain, cardo, bnyx, ok its jojo|okitsjojo, lex luger, dj paul, juicy j, mannie fresh, swizz beatz, scott storch, the neptunes, darkchild, dj premier, pete rock, rza, havoc, flying lotus, kaytranada, mount kimbie, mura masa",
      "art dealer, star boy, loesoe, ssort, lukrative, warpstar, mexikodro, kashpaid, kc supreme, smokey|smokeylegendary, synthetic, foreverolling, hagan, nick papz, bobby raps, gab3, juke wong, gibbo, jetsonmade, dj smokey, dj spinz, wondagurl, sevn thomas, cirkut, danja, sounwave, cardiak, cool and dre, skinny, popstar benny, whitearmor|white armor, yung gud|gud, yung sherman, nedarb, smokeasac, fish narc, bighead, pinkmane",
    ],
  },
  {
    id: "dj",
    cat: "MUSIC",
    q: "NAME A DJ",
    t: [
      "david guetta, calvin harris, marshmello, avicii, skrillex, tiesto",
      "martin garrix, dj khaled, deadmau5, diplo, alan walker, kygo, steve aoki, zedd, the chainsmokers|chainsmokers, armin van buuren",
      "afrojack, hardwell, swedish house mafia, fred again, peggy gou, carl cox, alesso, don diablo, dimitri vegas, nicky romero, black coffee, solomun, fisher, john summit, dom dolla",
      "boris brejcha, charlotte de witte, amelie lens, nina kraviz, richie hawtin, adam beyer, jamie xx, kaytranada, four tet, flume, porter robinson, madeon, rezz, excision, subtronics, illenium, seven lions, kungs, purple disco machine, mochakk",
      "dj screw, dj paul, dj spinn, dj rashad, dj shadow, kool herc, grandmaster flash, frankie knuckles, larry levan, ron hardy, derrick may, juan atkins, jeff mills, robert hood, ben klock, marcel dettmann, blawan, objekt, ben ufo, joy orbison, sherelle, eris drew, dj stingray, dj harvey, dj koze, dj tennis, villalobos|ricardo villalobos, dj snake",
    ],
  },
  {
    id: "studio",
    cat: "MUSIC",
    q: "NAME SOMETHING YOU FIND IN A MUSIC STUDIO",
    t: [
      "microphone|mic, headphones, speakers, computer|laptop",
      "keyboard|midi keyboard, mixer|mixing desk, monitors|studio monitors, audio interface|interface, cables, pop filter, guitar",
      "fl studio, ableton, logic pro|logic, pro tools, synthesizer|synth, drum machine, mic stand, acoustic panels|foam, sofa|couch, vocal booth, subwoofer",
      "compressor, equalizer|eq, preamp, serum, kontakt, auto tune|autotune, mpc, launchpad, sampler, turntables, patch bay, reflection filter, di box, studio chair, plug ins|plugins",
      "neve 1073, la-2a|la2a, 1176, ssl console|ssl, u87|neumann u87, sm7b|shure sm7b, sm58, ns10|yamaha ns10, tape machine, reel to reel, spring reverb, plate reverb, ribbon mic, mellotron, moog, tr 808, tr 909, sp 1200, mpc 2000, omnisphere, ozone, fabfilter, waves, soundtoys, vocoder, metronome, lava lamp, incense",
    ],
  },
  {
    id: "underground",
    cat: "MUSIC",
    q: "NAME AN UNDERGROUND RAPPER",
    t: [
      "lil peep|peep, xxxtentacion|x, $uicideboy$|suicideboys|suicide boys, juice wrld",
      "yung lean|lean, ghostemane, bones, playboi carti|carti, ken carson, lil uzi vert|uzi, ski mask the slump god|ski mask, denzel curry, pouya, yeat",
      "bladee, lil tracy|tracy, destroy lonely, night lovell, scarlxrd, city morgue, zillakami, sosmula, trippie redd, lil skies, smokepurpp, fat nick, shakewell, ramirez, germ, craig xen, wifisfuneral, robb banks, lil b|based god, yung bans, lucki",
      "ecco2k, thaiboy digital|thaiboy, wicca phase springs eternal|wicca phase, cold hart, horse head|horsehead, xavier wulf, chris travis, eddy baker, black kray, corbin|spooky black, sematary, osamason, nettspend, 2hollis, che, summrs, autumn, kankan, yung bruh, killstation, guardin, nothing nowhere, lil lotus, brennan savage, lil xan, lil aaron, 93feetofsmoke, convolk, shinigami, savage ga$p|savage gasp",
      "tombfell, pinkmane, o1m4de, stutters, nick prosper, mackned, jpdreamthug, doves, yawns, fish narc, nedarb, lederrick, bexey, omenxiii, lil zubin|zubin, jon simmons, cat soup, smrtdeath, parv0, getter, wavy jone$|wavy jones, baker ya maker, bill $aber|bill saber, mikey the magician, yung simmie, raider klan, spaceghostpurrp, amber london, key nyata, dylan ross, yung gud, whitearmor, hackle, 6 dogs, kid trash, haunted mound",
    ],
  },
  {
    id: "collective",
    cat: "MUSIC",
    q: "NAME SOMEONE FROM GOTHBOICLIQUE, DRAIN GANG OR SAD BOYS",
    t: [
      "lil peep|peep",
      "yung lean|lean, bladee",
      "lil tracy|tracy, ecco2k, thaiboy digital|thaiboy",
      "wicca phase springs eternal|wicca phase, cold hart, horse head|horsehead, whitearmor|white armor, yung gud|gud, yung sherman|sherman",
      "mackned, doves, yawns, fish narc, jpdreamthug, lil zubin|zubin",
    ],
  },
  {
    id: "peep",
    cat: "MUSIC",
    q: "NAME A LIL PEEP SONG",
    t: [
      "star shopping, awful things, save that shit, falling down",
      "benz truck, beamer boy, the brightside|brightside, witchblade, crybaby|cry baby, white wine, hellboy, life is beautiful",
      "gym class, girls, kiss, nineteen, yesterday, ghost girl, problems, better off dying|better off, u said, 16 lines, cry alone, runaway, sex with my ex, ive been waiting, spotlight, lil jeep, absolute in doubt, white tee, the way i see things",
      "driveway, big city blues, walk away as the door slams, the song they played when i crashed into the wall, omfg, belgium, moving on, when i lie, keep my coo, lil kennedy, praying to the sky, about u, right here, giving girls cocaine, haunt u, your favorite dress, we think too much, broken smile, leanin, worlds away, interlude, fucked up, castles, i crash u crash, hate me",
      "nuts, life, veins, flannel, toxic city, high school, feelz, another song, angeldust, shiver, skyscrapers, move on be strong, drive by, old me, red drop shawty, switch up, m.o.s.|mos, five degrees, beat it, nose ring, come around, california world, live forever, dreams and nightmares, suck my blood, hollywood dreaming, on the wall, let me bleed, cobain",
    ],
  },
  {
    id: "lean",
    cat: "MUSIC",
    q: "NAME A YUNG LEAN SONG",
    t: [
      "ginseng strip 2002|ginseng strip, kyoto",
      "yoshi city, agony, hurt, red bottom sky, afghanistan",
      "hoover, miami ultras, sandman, volt, ghosttown|ghost town, diamonds, gatorade, emails, oreomilkshake|oreo milkshake, motorola, monster, bliss, hennessy and sailor moon|hennessy & sailor moon, boylife in eu, violence",
      "lightsaber saber, blommor, crystal clear ice, highway patrol, eye contact, friday the 13th, metallic intuition, af1s, yayo, pikachu, trashy, iceman, sunrise angel, vendetta, french hotel, fire, happy feet, skimask, outta my head, lazy summer day, my agenda, pearl fountain, dogboy, all the things, summertime blood, red velvet, leanworld, creep creeps, solarflare, nitevision, greygoose, 5th element, dark side of the moon",
      "smirnoff ice, muddy sea, push lost weekend|push, starz2therainbow, bender girlfriend, drop it scooter, kirby, princess daisy, heal you bladerunner|bladerunner, damn gud, deep fried, lemonade, lucifer love, nekobasu, plastic boy, racks on racks, salute, sauron, tokyo drift, wrist cry, yellowman, hocus pocus, eyes closed, stay down, total eclipse, waterfall, yung tourist, forever young, bathtub, low, trip, paradise lost",
    ],
  },
  {
    id: "ghostemane",
    cat: "MUSIC",
    q: "NAME A GHOSTEMANE SONG",
    t: [
      "mercury|mercury retrograde",
      "nihil, andromeda, squeeze, venom",
      "bonesaw, flesh, gatteka, hades, kali yuga, euronymous, to whom it may concern, rake, 1000 rounds, elixir, lazaretto, fed up, ai",
      "dread|d r ead, vagabond, hexada, sacrilege, hydrochloride, anti social masochistic rage|asmr, melancholic|melanchoholic, calamity, hellrap, my heart of glass, intro desolation|desolation, i duckinf hatw you, nails, carbomb, broken, plague doctor, kybalion, blackmage, john dee, kreep, tartarus, d e a t h|death",
      "omnis, stick out, arcane, scissorhands, polaris, rituals, niagara, crucifix, the singularity|singularity, black blood, inferno, rip, im ready, ouroboros, basement, pentagrams, taurus, d i e|die, dahlia i, fertilizer, human err0r|human error, nectar, to me from me",
    ],
  },

  // ------------------------------------------------------------------ EARTH
  {
    id: "europe",
    cat: "EARTH",
    q: "NAME A COUNTRY IN EUROPE",
    t: [
      "france, germany, italy, spain, uk|united kingdom|england|britain",
      "poland, portugal, netherlands|holland, sweden, greece, switzerland, belgium, ireland, norway, austria, ukraine, russia",
      "denmark, finland, czechia|czech republic, hungary, romania, croatia, serbia, turkey, iceland, scotland, wales, bulgaria, slovakia",
      "slovenia, bosnia|bosnia and herzegovina, montenegro, albania, north macedonia|macedonia, moldova, belarus, lithuania, latvia, estonia, luxembourg, cyprus, malta, kosovo",
      "andorra, monaco, liechtenstein, san marino, vatican|vatican city|holy see, gibraltar, faroe islands, georgia, armenia, azerbaijan, northern ireland, transnistria, isle of man, jersey, guernsey, aland",
    ],
  },
  {
    id: "africa-country",
    cat: "EARTH",
    q: "NAME A COUNTRY IN AFRICA",
    t: [
      "egypt, nigeria, south africa, kenya",
      "morocco, ghana, ethiopia, algeria, tunisia, senegal, cameroon, madagascar, uganda, tanzania",
      "somalia, sudan, libya, congo|dr congo|drc, ivory coast|cote d'ivoire, zimbabwe, zambia, angola, mozambique, rwanda, namibia, botswana, mali",
      "niger, chad, burkina faso, guinea, sierra leone, liberia, togo, benin, gabon, malawi, south sudan, eritrea, mauritania, lesotho, eswatini|swaziland, burundi, central african republic",
      "djibouti, comoros, cape verde|cabo verde, sao tome and principe|sao tome, seychelles, mauritius, equatorial guinea, guinea bissau, gambia, western sahara, somaliland, republic of the congo|congo brazzaville",
    ],
  },
  {
    id: "capital",
    cat: "EARTH",
    q: "NAME A CAPITAL CITY",
    t: [
      "london, paris, washington|washington dc, tokyo, berlin, rome, madrid",
      "moscow, beijing, ottawa, canberra, vienna, amsterdam, lisbon, athens, dublin, bratislava, prague, warsaw, budapest, cairo",
      "brussels, copenhagen, stockholm, oslo, helsinki, bern, seoul, bangkok, new delhi|delhi, mexico city, buenos aires, brasilia, lima, nairobi, ankara, kyiv|kiev, bucharest, belgrade, zagreb",
      "ljubljana, sarajevo, podgorica, tirana, skopje, chisinau, minsk, vilnius, riga, tallinn, reykjavik, valletta, nicosia, tbilisi, yerevan, baku, tehran, baghdad, riyadh, doha, abu dhabi, muscat, kabul, islamabad, dhaka, hanoi, manila, jakarta, kuala lumpur, wellington, santiago, bogota, caracas, quito, havana",
      "ulaanbaatar, thimphu, naypyidaw, vientiane, phnom penh, dili, bishkek, dushanbe, ashgabat, tashkent, astana|nur sultan, sanaa, nouakchott, bamako, ouagadougou, niamey, ndjamena, bangui, malabo, libreville, kigali, bujumbura, lilongwe, maputo, gaborone, windhoek, maseru, mbabane, antananarivo, moroni, asmara, djibouti, mogadishu, port moresby, honiara, funafuti, majuro, palikir, ngerulmud, apia, nukualofa, suva, tarawa, vaduz, andorra la vella, san marino, monaco",
    ],
  },
  {
    id: "us-state",
    cat: "EARTH",
    q: "NAME A US STATE",
    t: [
      "california, texas, florida, new york",
      "hawaii, alaska, washington, nevada, arizona, georgia, ohio, michigan, illinois",
      "colorado, oregon, utah, new jersey, massachusetts, virginia, north carolina, pennsylvania, tennessee, louisiana, kentucky, alabama",
      "minnesota, wisconsin, missouri, kansas, oklahoma, iowa, indiana, maryland, south carolina, mississippi, arkansas, new mexico, connecticut, maine",
      "vermont, new hampshire, rhode island, delaware, west virginia, north dakota, south dakota, nebraska, montana, wyoming, idaho",
    ],
  },
  {
    id: "river",
    cat: "EARTH",
    q: "NAME A RIVER",
    t: [
      "nile, amazon, mississippi, thames",
      "danube, seine, rhine, ganges, yangtze, colorado, hudson",
      "volga, tigris, euphrates, mekong, congo, zambezi, niger, missouri, rio grande, jordan, tiber, elbe, vltava|moldau",
      "indus, yellow river|huang he, ob, yenisei, lena, amur, dnieper, don, oder, vistula, loire, rhone, po, ebro, tagus, douro, shannon, severn, mersey, st lawrence, yukon, mackenzie, columbia, ohio, orinoco, parana, limpopo, orange river",
      "vah, hron, morava, tisza|tisa, drava, sava, mur, inn, isar, main, moselle, garonne, dordogne, guadalquivir, arno, adige, neretva, irtysh, syr darya, amu darya, brahmaputra, irrawaddy, salween, chao phraya, murray, darling, waikato, okavango, senegal river, ubangi, kasai, essequibo, magdalena, sao francisco, fraser",
    ],
  },
  {
    id: "mountain",
    cat: "EARTH",
    q: "NAME A MOUNTAIN OR A MOUNTAIN RANGE",
    t: [
      "everest|mount everest, alps, himalayas, kilimanjaro, rocky mountains|rockies",
      "andes, mont blanc, fuji|mount fuji, k2, matterhorn, appalachians, olympus|mount olympus",
      "tatras|high tatras|tatra, pyrenees, carpathians, urals, atlas, vesuvius, etna, denali, mckinley, aconcagua, elbrus, uhuru peak",
      "kangchenjunga, lhotse, makalu, annapurna, nanga parbat, eiger, jungfrau, zugspitze, ben nevis, snowdon, sierra nevada, cascades, mount rainier, mount st helens, table mountain, sinai, ararat, kosciuszko, dolomites, grossglockner, monte rosa|dufourspitze, gran paradiso, teide|el teide|pico del teide, mulhacen, aneto, picos de europa, stromboli, gran sasso|corno grande, marmolada, tre cime|tre cime di lavaredo|drei zinnen, ortler, monch, black forest|schwarzwald, massif central, vosges, jura|jura mountains, scafell pike, carrauntoohil, cairngorms, pennines, scottish highlands|highlands, galdhopiggen, kebnekaise, hekla, eyjafjallajokull, kazbek, julian alps, bernese alps, transylvanian alps|southern carpathians, rila, pirin, rhodopes|rhodope mountains, pindus, parnassus|mount parnassus, mount athos|athos, rock of gibraltar|gibraltar, low tatras|nizke tatry, mala fatra|little fatra, beskids|beskydy, sudetes|sudety, giant mountains|krkonose|karkonosze, ore mountains|erzgebirge|krusne hory",
      "gerlach|gerlachovsky stit|gerlachovsky, lomnicky stit|lomnica|lomnicky|lomsky stit|lomnicak, krivan, rysy, triglav, musala, mauna kea, mauna loa, chimborazo, cotopaxi, huascaran, ojos del salado, vinson|vinson massif, puncak jaya|carstensz, rwenzori, drakensberg, hindu kush, karakoram, pamir, tian shan, altai, zagros, caucasus, apennines, balkan mountains, dinaric alps, scandinavian mountains, brooks range, transantarctic, ladovy stit|ladovy, slavkovsky stit|slavkovsky, kezmarsky stit|kezmarsky, vysoka, koncista, satan, bystra, banikov, predne solisko|solisko, ostrva, jahnaci stit, havran, zdiarska vidla, baranec, volovec, ostry rohac, placlive, salatin, brestova, sivy vrch, dumbier, chopok, derese, kralova hola, velky krivan, maly krivan, velky rozsutec|rozsutec, maly rozsutec, stoh, velky choc|choc, babia hora|babia gora, pilsko, velka raca, zobor, sitno, polana, vtacnik, klak, strazov, velka javorina, inovec, devinska kobyla, kamzik, borisov, ostredok, krizna, rakytov, ploska, tlsta, sip, mincol, martinske hole, kojsovska hola, stolica, kremenec, sninsky kamen, tri koruny, kralova studna, skalnate pleso, western tatras|zapadne tatry|rohace, belianske tatry|belianske tatras, velka fatra|great fatra, slovak paradise|slovensky raj, pieniny, little carpathians|male karpaty, white carpathians|biele karpaty, slovak ore mountains|slovenske rudohorie, kremnicke vrchy, stiavnicke vrchy, chocske vrchy, strazovske vrchy, tribec, povazsky inovec, muranska planina, vihorlat, bukovske vrchy, cergov, branisko, levocske vrchy, spisska magura, oravska magura, javorniky, kysucke beskydy, slanske vrchy, snezka|sniezka, praded, jeseniky, lysa hora, radhost, sumava|bohemian forest, kasprowy wierch, giewont, swinica, bieszczady, kekes, matra, bukk, hoverla, moldoveanu, negoiu, fagaras, retezat, bucegi, apuseni, vihren, vitosha, botev, stara planina, mytikas, taygetus, durmitor, bobotov kuk, prokletije|accursed mountains, korab, sar mountains|sar planina, velebit, dinara, maglic, kopaonik, karawanks|karavanke, kamnik alps, wildspitze, dachstein, watzmann, grossvenediger, hohe tauern|high tauern, bavarian alps, feldberg, grosser arber, fichtelberg, harz, brocken, dom, weisshorn, piz bernina|bernina, finsteraarhorn, aletschhorn, grand combin, dent blanche, breithorn, piz buin, santis, pilatus, rigi, titlis, schilthorn, pennine alps, grandes jorasses, aiguille du midi, mont ventoux, puy de dome, monte viso|monviso, monte baldo, monte perdido, montserrat, veleta, sierra de guadarrama, serra da estrela, mount pico|pico, ben macdui, slieve donard, glittertind, jotunheimen, halti, hvannadalshnukur, snaefellsjokull, katla, shkhara, dykh tau, ushba, narodnaya, crimean mountains",
    ],
  },
  {
    id: "island",
    cat: "EARTH",
    q: "NAME AN ISLAND",
    t: [
      "hawaii, madagascar, greenland, iceland, bali, jamaica",
      "cuba, ireland, sicily, crete, ibiza, mallorca|majorca, tasmania, sri lanka, japan, great britain",
      "sardinia, corsica, cyprus, malta, santorini, mykonos, tenerife, gran canaria, borneo, sumatra, java, maui, puerto rico, bahamas, barbados, fiji, tahiti, new zealand, phuket",
      "rhodes, corfu, capri, elba, lanzarote, fuerteventura, madeira, azores, faroe islands, isle of skye|skye, isle of man, jersey, guernsey, zanzibar, mauritius, seychelles, maldives, galapagos, easter island|rapa nui, bora bora, new guinea, sulawesi, luzon, mindanao, honshu, hokkaido, okinawa, kodiak, baffin island",
      "svalbard, jan mayen, novaya zemlya, sakhalin, kamchatka, socotra, pitcairn, tristan da cunha, st helena, ascension, kerguelen, south georgia, bouvet island, lord howe, norfolk island, christmas island, cocos islands, nauru, tuvalu, kiribati, palau, yap, guam, saipan, attu, ellesmere, devon island, sable island, anticosti, tierra del fuego, chiloe",
    ],
  },
  {
    id: "asia-country",
    cat: "EARTH",
    q: "NAME A COUNTRY IN ASIA",
    t: [
      "china, japan, india, south korea|korea, thailand",
      "vietnam, indonesia, philippines, pakistan, north korea, malaysia, singapore, saudi arabia, iran, iraq, israel, turkey",
      "nepal, bangladesh, sri lanka, afghanistan, mongolia, cambodia, laos, myanmar|burma, taiwan, kazakhstan, uae|united arab emirates|dubai, qatar, kuwait, jordan, lebanon, syria, yemen, oman",
      "bhutan, maldives, brunei, east timor|timor leste, uzbekistan, kyrgyzstan, tajikistan, turkmenistan, georgia, armenia, azerbaijan, bahrain, palestine, cyprus",
      "hong kong, macau, russia",
    ],
  },
  {
    id: "latam",
    cat: "EARTH",
    q: "NAME A COUNTRY IN SOUTH OR CENTRAL AMERICA",
    t: [
      "brazil, argentina, mexico, colombia",
      "chile, peru, venezuela, cuba, ecuador, bolivia, uruguay, paraguay",
      "costa rica, panama, guatemala, honduras, el salvador, nicaragua, jamaica, dominican republic, puerto rico",
      "belize, guyana, suriname, haiti, trinidad and tobago|trinidad, bahamas, barbados",
      "french guiana, falkland islands|falklands, grenada, st lucia|saint lucia, dominica, antigua, st kitts, st vincent, aruba, curacao, bonaire",
    ],
  },
  {
    id: "water",
    cat: "EARTH",
    q: "NAME AN OCEAN, A SEA OR A BIG LAKE",
    t: [
      "pacific|pacific ocean, atlantic|atlantic ocean, indian ocean|indian, mediterranean|mediterranean sea",
      "arctic ocean|arctic, southern ocean|antarctic ocean, caribbean sea|caribbean, red sea, dead sea, black sea, baltic sea|baltic, north sea",
      "caspian sea|caspian, lake superior, lake michigan, great lakes, lake victoria, lake titicaca, lake baikal, lake geneva, adriatic sea|adriatic, aegean sea|aegean, south china sea, gulf of mexico, bering sea",
      "lake tanganyika, lake malawi, lake erie, lake ontario, lake huron, lake como, lake garda, loch ness, lake balaton|balaton, ionian sea, tyrrhenian sea, ligurian sea, sea of japan, yellow sea, arabian sea, coral sea, tasman sea, sargasso sea, barents sea, kara sea",
      "aral sea, lake chad, lake volta, lake ladoga, lake onega, great salt lake, lake eyre, lake nicaragua, lake maracaibo, lake van, lake toba, lake inle, lake bled, plitvice, white sea, laptev sea, chukchi sea, beaufort sea, weddell sea, ross sea, sea of okhotsk, sea of marmara, sea of azov, celebes sea, banda sea, timor sea, andaman sea, labrador sea",
    ],
  },
  {
    id: "landmark",
    cat: "EARTH",
    q: "NAME A FAMOUS LANDMARK",
    t: [
      "eiffel tower, statue of liberty, big ben, pyramids|pyramids of giza|great pyramid, great wall|great wall of china, colosseum",
      "taj mahal, leaning tower of pisa|tower of pisa, sydney opera house, golden gate bridge, christ the redeemer, machu picchu, stonehenge, mount rushmore",
      "burj khalifa, empire state building, tower bridge, buckingham palace, sagrada familia, acropolis|parthenon, petra, angkor wat, brandenburg gate, louvre, arc de triomphe, notre dame, times square, hollywood sign",
      "chichen itza, neuschwanstein, alhambra, kremlin|red square, st basils cathedral, forbidden city, terracotta army, hagia sophia, blue mosque, golden temple, sagrada, space needle, cn tower, grand canyon, niagara falls, victoria falls, uluru|ayers rock, moai|easter island heads",
      "bratislava castle, ufo bridge|most snp, devin castle, spis castle|spissky hrad, bojnice castle, charles bridge, prague castle, atomium, manneken pis, little mermaid, sanssouci, mont saint michel, pont du gard, meteora, borobudur, bagan, potala palace, shwedagon, fushimi inari, itsukushima, wat arun, bran castle, alcazar, burj al arab, lotus temple, gateway of india, great sphinx|sphinx, abu simbel",
    ],
  },

  // ------------------------------------------------------------------ FILM & CARTOONS
  {
    id: "simpsons",
    cat: "FILM & CARTOONS",
    q: "NAME A SIMPSONS CHARACTER",
    t: [
      "homer|homer simpson, bart|bart simpson, marge|marge simpson, lisa|lisa simpson, maggie|maggie simpson",
      "mr burns|burns, ned flanders|flanders, milhouse, moe|moe szyslak, apu, krusty|krusty the clown, smithers|waylon smithers, barney|barney gumble",
      "nelson|nelson muntz, ralph|ralph wiggum, chief wiggum|wiggum, principal skinner|skinner, edna krabappel|mrs krabappel, sideshow bob, grandpa|abe simpson|grampa, patty, selma, otto, groundskeeper willie|willie, comic book guy, lenny, carl",
      "martin prince|martin, kearney, jimbo, dolph, todd flanders|todd, rod flanders|rod, maude flanders, dr hibbert|hibbert, dr nick|nick riviera, troy mcclure, lionel hutz, mayor quimby|quimby, reverend lovejoy|lovejoy, helen lovejoy, snake, cletus, sea captain, hans moleman|moleman, kang, kodos, itchy, scratchy, santa's little helper, snowball",
      "disco stu, gil, bumblebee man, lunchlady doris|doris, superintendent chalmers|chalmers, frink|professor frink, duffman, legs, louie, fat tony, rainier wolfcastle|mcbain, kirk van houten, luann van houten, sherri, terri, uter, database, wendell, lewis, jasper, agnes skinner, artie ziff, drederick tatum, plopper|spider pig, mr teeny, cookie kwan, crazy cat lady, blinky, jebediah springfield",
    ],
  },
  {
    id: "southpark",
    cat: "FILM & CARTOONS",
    q: "NAME A SOUTH PARK CHARACTER",
    t: [
      "cartman|eric cartman, kenny|kenny mccormick, kyle|kyle broflovski, stan|stan marsh",
      "butters|butters stotch, randy|randy marsh, chef, mr garrison|garrison, towelie, timmy",
      "wendy|wendy testaburger, token, jimmy, mr mackey|mackey, sharon marsh, ike, sheila broflovski, mr hankey, terrance, phillip, satan, big gay al, pc principal",
      "tweek, craig, clyde, scott tenorman, liane cartman, gerald broflovski, stephen stotch, linda stotch, shelly marsh, marvin marsh|grandpa marsh, mr slave, officer barbrady|barbrady, mayor mcdaniels, jimbo, ned, kevin, bebe, red, heidi turner, mysterion, professor chaos",
      "dougie|general disarray, pip, damien, starvin marvin, scuzzlebutt, manbearpig, tolkien, the coon, mint berry crunch, kenny's dad|stuart mccormick, carol mccormick, kevin mccormick, mr tweek, richard tweek, father maxi, nathan, mimsy, scott malkinson, jimmy valmer, chef's parents, lemmiwinks, jesus, santa claus, steamy ray vaughn, mr hat, mr twig",
    ],
  },
  {
    id: "rickmorty",
    cat: "FILM & CARTOONS",
    q: "NAME A RICK AND MORTY CHARACTER",
    t: [
      "rick|rick sanchez, morty|morty smith",
      "summer|summer smith, beth|beth smith, jerry|jerry smith, mr meeseeks|meeseeks, pickle rick, birdperson",
      "squanchy, evil morty, mr poopybutthole|poopybutthole, unity, scary terry, tammy, krombopulos michael, gearhead, abradolf lincler, president|president curtis, noob noob, mr goldenfold|goldenfold",
      "space beth, rick prime, principal vagina, jessica, ethan, gene, toxic rick, toxic morty, snuffles|snowball, cromulons, plutonians, the council of ricks|council of ricks, doofus rick, cop rick, tiny rick, phoenixperson, revolio clockberg, nimbus|mr nimbus, glootie, gazorpazorpfield, jaguar, king jellybean, zeep xanflorp",
      "hemorrhage, ants in my eyes johnson, two brothers, baby wizard, shrimply pibbles, michael thompson, stealy, ball fondlers, lucius needful, tony|fart, worldender, planetina, mr frundles, sleepy gary, uncle steve, photography raptor, reverse giraffe, amish cyborg, hamurai, pencilvester, cousin nicky, tinkles, beebo, million ants, sentient arm, slick, conroy, dr wong",
    ],
  },
  {
    id: "classic-toon",
    cat: "FILM & CARTOONS",
    q: "NAME A CLASSIC CARTOON CHARACTER",
    t: [
      "mickey mouse|mickey, bugs bunny, tom, jerry, scooby doo|scooby, spongebob, donald duck",
      "daffy duck, tweety, sylvester, popeye, goofy, minnie mouse|minnie, pink panther, road runner, wile e coyote|coyote, porky pig, fred flintstone, shaggy, pluto",
      "woody woodpecker, yogi bear, boo boo, elmer fudd, tasmanian devil|taz, speedy gonzales, pepe le pew, foghorn leghorn, marvin the martian, betty boop, felix the cat, barney rubble, george jetson, garfield, snoopy, charlie brown",
      "huckleberry hound, top cat, snagglepuss, quick draw mcgraw, magilla gorilla, dick dastardly, muttley, penelope pitstop, hong kong phooey, inspector gadget, he-man, skeletor, captain planet, rocky and bullwinkle|bullwinkle|rocky, dudley do right, underdog, mighty mouse, casper, richie rich, smurfs|papa smurf, gargamel, chip and dale",
      "gertie the dinosaur, koko the clown, bimbo, oswald the lucky rabbit|oswald, krazy kat, mr magoo, gerald mcboing boing, heckle and jeckle, droopy, screwy squirrel, chilly willy, andy panda, sniffles, beaky buzzard, gossamer, michigan j frog, the tick, ren, stimpy, rocko, cow and chicken, johnny bravo, courage, dexter, mojo jojo",
    ],
  },
  {
    id: "disney",
    cat: "FILM & CARTOONS",
    q: "NAME A DISNEY OR PIXAR MOVIE",
    t: [
      "the lion king|lion king, frozen, toy story, aladdin, finding nemo",
      "cars, the little mermaid|little mermaid, moana, beauty and the beast, cinderella, snow white, up, monsters inc, coco, inside out, encanto, tangled, zootopia",
      "mulan, pocahontas, bambi, dumbo, pinocchio, peter pan, alice in wonderland, the jungle book|jungle book, 101 dalmatians, lilo and stitch|lilo & stitch, ratatouille, wall-e|wall e, the incredibles|incredibles, brave, big hero 6, a bugs life, wreck it ralph, hercules, tarzan",
      "the hunchback of notre dame|hunchback, the emperors new groove|emperor's new groove, treasure planet, atlantis, bolt, the princess and the frog, meet the robinsons, chicken little, brother bear, home on the range, the aristocats|aristocats, robin hood, the rescuers, oliver and company, the fox and the hound, sleeping beauty, lady and the tramp, fantasia, raya, luca, soul, onward, elemental, turning red, wish",
      "the black cauldron, the great mouse detective, the sword in the stone, fun and fancy free, melody time, saludos amigos, the three caballeros, make mine music, the adventures of ichabod and mr toad, dinosaur, fantasia 2000, strange world, lightyear, elio, the good dinosaur, tron, the black hole, the nightmare before christmas|nightmare before christmas, james and the giant peach, who framed roger rabbit",
    ],
  },
  {
    id: "superhero",
    cat: "FILM & CARTOONS",
    q: "NAME A SUPERHERO",
    t: [
      "spiderman|spider man|spider-man, batman, superman, iron man, hulk",
      "captain america, thor, wonder woman, black panther, wolverine, deadpool, flash|the flash, aquaman, black widow",
      "doctor strange, ant man, hawkeye, green lantern, scarlet witch|wanda, vision, captain marvel, groot, rocket|rocket raccoon, star lord, venom, cyclops, storm, robin, catwoman, harley quinn, shazam",
      "daredevil, punisher, moon knight, silver surfer, blade, ghost rider, nightcrawler, gambit, rogue, jean grey, beast, iceman, colossus, cable, she hulk, ms marvel, falcon, winter soldier, nightwing, batgirl, supergirl, cyborg, martian manhunter, green arrow, hellboy, spawn",
      "squirrel girl, moon girl, howard the duck, deathstroke, booster gold, blue beetle, plastic man, the atom, firestorm, hawkman, hawkgirl, zatanna, swamp thing, the spectre, black lightning, static shock, raven, beast boy, starfire, kid flash, mister fantastic, invisible woman, human torch, the thing, namor, adam warlock, nova, quicksilver, x-23, domino, the tick, invincible, omni man, homelander, starlight",
    ],
  },
  {
    id: "spongebob",
    cat: "FILM & CARTOONS",
    q: "NAME A SPONGEBOB CHARACTER",
    t: [
      "spongebob|spongebob squarepants, patrick|patrick star, squidward",
      "mr krabs|krabs, plankton, sandy|sandy cheeks, gary",
      "mrs puff, pearl, karen, larry the lobster|larry, mermaid man, barnacle boy, flying dutchman",
      "squilliam, man ray, bubble bass, dirty bubble, king neptune, the hash slinging slasher, fred|my leg, patchy the pirate, potty, doodlebob, kevin the sea cucumber, nat peterson",
      "squog, purple doctorfish, bubble buddy, mrs tentacles, betsy krabs, mama krabs, grandma squarepants, harold squarepants, margaret squarepants, stanley squarepants, old man jenkins, the atomic flounder, the elastic waistband, jim, scooter, shubie, harold, tom, perch perkins, sea bear, alaskan bull worm, the strangler, kenny the cat",
    ],
  },
  {
    id: "pokemon",
    cat: "FILM & CARTOONS",
    q: "NAME A POKEMON",
    t: [
      "pikachu, charizard, eevee, bulbasaur, squirtle, charmander, mewtwo",
      "jigglypuff, snorlax, gengar, mew, psyduck, lucario, meowth, gyarados, blastoise, venusaur, magikarp",
      "dragonite, onix, machamp, alakazam, arcanine, ditto, vaporeon, umbreon, sylveon, mudkip, torchic, treecko, piplup, greninja, rayquaza, lugia, ho oh, togepi, cubone, marowak",
      "slowpoke, slowbro, porygon, lapras, articuno, zapdos, moltres, dragonair, scyther, pinsir, tauros, kangaskhan, mr mime, jynx, electabuzz, magmar, hitmonlee, hitmonchan, lickitung, wobbuffet, shuckle, mimikyu, garchomp, tyranitar, metagross, salamence",
      "spinda, luvdisc, smoochum, chimecho, castform, kecleon, stunfisk, trubbish, garbodor, klefki, vanillite, bidoof, wurmple, unown, delibird, dunsparce, sudowoodo, farfetch'd|farfetchd, cosmog, pyukumuku, wishiwashi, dhelmise, bruxish, falinks, cufant, applin, dreepy, nacli, tinkatink, wiglett",
    ],
  },
  {
    id: "horror",
    cat: "FILM & CARTOONS",
    q: "NAME A HORROR MOVIE",
    t: [
      "it, scream, the conjuring|conjuring, halloween, saw",
      "the exorcist|exorcist, a nightmare on elm street|nightmare on elm street, friday the 13th, annabelle, the shining|shining, chucky|childs play|child's play, paranormal activity, the ring|ring, get out",
      "insidious, sinister, the nun, us, hereditary, midsommar, the babadook|babadook, a quiet place, final destination, the texas chainsaw massacre|texas chain saw massacre, psycho, the purge, smile, terrifier, m3gan|megan, five nights at freddys",
      "the witch|the vvitch, it follows, the descent, the grudge, the thing, alien, poltergeist, rosemary's baby, the omen, carrie, jaws, candyman, hellraiser, evil dead, the blair witch project|blair witch, 28 days later, dawn of the dead, night of the living dead, talk to me, barbarian, x, pearl, nope, longlegs",
      "possession, audition, ringu, ju-on, suspiria, inferno, the beyond, cannibal holocaust, martyrs, inside, high tension, the wailing, a tale of two sisters, noroi, kairo|pulse, house|hausu, eraserhead, nosferatu, the cabinet of dr caligari, häxan|haxan, the wicker man, black christmas, the changeling, session 9, lake mungo, the house of the devil, possessor, skinamarink, the void, mandy",
    ],
  },
  {
    id: "anime",
    cat: "FILM & CARTOONS",
    q: "NAME AN ANIME",
    t: [
      "naruto, dragon ball|dragon ball z|dbz, one piece, pokemon, attack on titan|aot",
      "death note, demon slayer, my hero academia|mha, jujutsu kaisen, sailor moon, spirited away, one punch man, bleach, hunter x hunter|hxh",
      "fullmetal alchemist|fma|fullmetal alchemist brotherhood, tokyo ghoul, cowboy bebop, neon genesis evangelion|evangelion|eva, chainsaw man, spy x family, my neighbor totoro|totoro, howl's moving castle, princess mononoke, akira, jojo|jojo's bizarre adventure, sword art online|sao, black clover, fairy tail, haikyuu, solo leveling",
      "steins gate, code geass, mob psycho 100|mob psycho, vinland saga, monster, berserk, gintama, made in abyss, ghost in the shell, samurai champloo, trigun, hellsing, cyberpunk edgerunners, frieren, dandadan, blue lock, kaiju no 8, oshi no ko, your name, a silent voice, perfect blue, paprika, nausicaa",
      "serial experiments lain|lain, texhnolyze, ergo proxy, mononoke, kaiba, the tatami galaxy, ping pong the animation, tekkonkinkreet, angel's egg, belladonna of sadness, mind game, dorohedoro, devilman crybaby, flcl, paranoia agent, boogiepop phantom, haibane renmei, now and then here and there, gankutsuou, mushishi, sonny boy, odd taxi",
    ],
  },
];
