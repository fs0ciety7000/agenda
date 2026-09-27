/**
 * Courses : rayons, quantités et produits reconnus (FR / EN). Partagé API ↔ web ; l'app Android
 * reçoit le rayon calculé par l'API.
 */
export const AISLES = [
  'PRODUCE',
  'BAKERY',
  'DAIRY',
  'MEAT_FISH',
  'FROZEN',
  'PANTRY',
  'DRINKS',
  'HOUSEHOLD',
  'HYGIENE',
  'OTHER',
] as const;
export type Aisle = (typeof AISLES)[number];

/** Clé d'un produit : minuscules, sans accents ni ponctuation, singulier approximatif. */
export function productKey(text: string): string {
  return text
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && /[sx]$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w))
    .join(' ');
}

const UNIT =
  '(?:kg|g|gr|mg|l|cl|ml|dl|lb|oz|x|pcs?|pieces?|boites?|boîtes?|paquets?|packs?|bouteilles?|sachets?|pots?|tranches?|bottles?|cans?|bags?)';

/**
 * « 2 kg de pommes » → { name: 'pommes', quantity: '2 kg' } ; « lait x6 » → { 'lait', 'x6' } ;
 * « 3 citrons » → { 'citrons', '3' }. Sans quantité : le texte tel quel.
 */
export function parseShoppingText(raw: string): { name: string; quantity: string | null } {
  const text = raw.trim().replace(/\s+/g, ' ');
  const lead = new RegExp(
    `^(\\d+(?:[.,]\\d+)?\\s*${UNIT}?|${UNIT}\\s*\\d+)\\.?\\s+(?:d['’]|de |des |of )?(.+)$`,
    'i',
  ).exec(text);
  if (lead && (lead[2]!.match(/\p{L}/gu)?.length ?? 0) >= 3)
    return { name: lead[2]!.trim(), quantity: tidy(lead[1]!) };
  const trail = new RegExp(
    `^(.+?)\\s+(x\\s*\\d+|\\d+(?:[.,]\\d+)?\\s*${UNIT}|×\\s*\\d+)$`,
    'i',
  ).exec(text);
  if (trail && (trail[1]!.match(/\p{L}/gu)?.length ?? 0) >= 3)
    return { name: trail[1]!.trim(), quantity: tidy(trail[2]!) };
  return { name: text, quantity: null };
}

const tidy = (q: string) => q.replace(/×/g, 'x').replace(/\s+/g, ' ').trim().toLowerCase();

/** Mots-clés (clé normalisée, singulier) → rayon. Le premier mot reconnu l'emporte. */
const KEYWORDS: Record<Exclude<Aisle, 'OTHER'>, string[]> = {
  PRODUCE: [
    'pomme',
    'poire',
    'banane',
    'orange',
    'citron',
    'fraise',
    'raisin',
    'kiwi',
    'ananas',
    'melon',
    'peche',
    'abricot',
    'cerise',
    'mangue',
    'avocat',
    'tomate',
    'salade',
    'laitue',
    'carotte',
    'courgette',
    'aubergine',
    'poivron',
    'concombre',
    'oignon',
    'ail',
    'echalote',
    'poireau',
    'pomme de terre',
    'patate',
    'champignon',
    'epinard',
    'brocoli',
    'chou',
    'haricot vert',
    'persil',
    'basilic',
    'coriandre',
    'menthe',
    'legume',
    'fruit',
    'endive',
    'radis',
    'celeri',
    'apple',
    'pear',
    'lemon',
    'lime',
    'strawberr',
    'grape',
    'tomato',
    'lettuce',
    'carrot',
    'onion',
    'garlic',
    'potatoe',
    'potato',
    'mushroom',
    'spinach',
    'broccoli',
    'cucumber',
    'pepper',
  ],
  BAKERY: [
    'pain',
    'baguette',
    'croissant',
    'brioche',
    'pain de mie',
    'viennoiserie',
    'tarte',
    'gateau',
    'cramique',
    'pistolet',
    'bread',
    'bagel',
    'cake',
    'muffin',
    'wrap',
    'tortilla',
  ],
  DAIRY: [
    'lait',
    'beurre',
    'fromage',
    'yaourt',
    'yogourt',
    'creme',
    'oeuf',
    'mozzarella',
    'emmental',
    'gruyere',
    'parmesan',
    'feta',
    'skyr',
    'margarine',
    'milk',
    'butter',
    'cheese',
    'yogurt',
    'yoghurt',
    'cream',
    'egg',
  ],
  MEAT_FISH: [
    'poulet',
    'boeuf',
    'porc',
    'veau',
    'agneau',
    'dinde',
    'jambon',
    'lardon',
    'saucisse',
    'hache',
    'steak',
    'escalope',
    'viande',
    'poisson',
    'saumon',
    'thon',
    'cabillaud',
    'crevette',
    'moule',
    'filet',
    'chicken',
    'beef',
    'pork',
    'ham',
    'bacon',
    'sausage',
    'mince',
    'fish',
    'salmon',
    'tuna',
    'shrimp',
    'prawn',
  ],
  FROZEN: ['surgele', 'glace', 'pizza surgelee', 'frite', 'frozen', 'ice cream'],
  PANTRY: [
    'pate',
    'spaghetti',
    'riz',
    'farine',
    'sucre',
    'sel',
    'poivre',
    'huile',
    'vinaigre',
    'moutarde',
    'mayonnaise',
    'ketchup',
    'sauce',
    'conserve',
    'cereale',
    'muesli',
    'biscuit',
    'chocolat',
    'confiture',
    'miel',
    'cafe',
    'the',
    'tisane',
    'epice',
    'bouillon',
    'lentille',
    'pois chiche',
    'semoule',
    'quinoa',
    'chip',
    'noix',
    'amande',
    'olive',
    'pasta',
    'rice',
    'flour',
    'sugar',
    'salt',
    'oil',
    'vinegar',
    'mustard',
    'cereal',
    'cookie',
    'chocolate',
    'jam',
    'honey',
    'coffee',
    'tea',
    'spice',
    'can',
    'bean',
    'nut',
    'snack',
    'croquette',
  ],
  DRINKS: [
    'eau',
    'jus',
    'soda',
    'coca',
    'biere',
    'vin',
    'limonade',
    'sirop',
    'water',
    'juice',
    'beer',
    'wine',
    'lemonade',
  ],
  HOUSEHOLD: [
    'papier toilette',
    'essuie tout',
    'sopalin',
    'liquide vaisselle',
    'lessive',
    'adoucissant',
    'eponge',
    'sac poubelle',
    'javel',
    'detergent',
    'nettoyant',
    'pastille lave vaisselle',
    'tablette lave vaisselle',
    'ampoule',
    'pile',
    'aluminium',
    'film',
    'toilet paper',
    'paper towel',
    'dish soap',
    'laundry',
    'sponge',
    'trash bag',
    'bin bag',
    'bleach',
    'battery',
    'light bulb',
  ],
  HYGIENE: [
    'dentifrice',
    'brosse a dent',
    'shampoing',
    'shampooing',
    'gel douche',
    'savon',
    'deodorant',
    'coton',
    'rasoir',
    'mouchoir',
    'couche',
    'lingette',
    'serviette hygienique',
    'tampon',
    'creme solaire',
    'toothpaste',
    'toothbrush',
    'shampoo',
    'shower gel',
    'soap',
    'razor',
    'tissue',
    'nappy',
    'diaper',
    'wipe',
  ],
};

/** Paires (mot-clé, rayon), les plus longues d'abord (« pomme de terre » avant « pomme »). */
const RULES = (Object.entries(KEYWORDS) as [Aisle, string[]][])
  .flatMap(([aisle, words]) => words.map((w) => [productKey(w), aisle] as const))
  .sort((a, b) => b[0].length - a[0].length);

/** Rayon probable d'un article (« OTHER » si inconnu). */
export function guessAisle(text: string): Aisle {
  const key = ` ${productKey(parseShoppingText(text).name)} `;
  for (const [word, aisle] of RULES) {
    // Mots courts (« sel », « the ») : mot entier ; sinon début de mot (« pomme » → « pommes »).
    if (key.includes(` ${word} `) || (word.length >= 4 && key.includes(` ${word}`))) return aisle;
  }
  return 'OTHER';
}
