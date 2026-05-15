export const RULE_BOT_REVEAL_DECK_PRIORITY = [
  "profession",
  "health",
  "skills",
  "hobby",
  "baggage",
  "fact",
  "facts",
  "biology",
  "special",
] as const;

export const RULE_BOT_DISASTER_DECK_HINTS: Array<{
  keywords: string[];
  deckWeights: Record<string, number>;
}> = [
  {
    keywords: ["virus", "epidemic", "pandemic", "infection", "болез", "вирус", "эпидем", "пандем", "инфекц"],
    deckWeights: { health: 6, profession: 3, biology: 2, fact: 1 },
  },
  {
    keywords: ["war", "nuclear", "radiation", "attack", "войн", "ядер", "радиац", "атак"],
    deckWeights: { profession: 5, health: 3, baggage: 3, biology: 1 },
  },
  {
    keywords: ["cold", "winter", "ice", "frost", "холод", "зим", "лед", "мороз"],
    deckWeights: { health: 4, baggage: 4, profession: 3, biology: 2 },
  },
  {
    keywords: ["heat", "drought", "fire", "пожар", "жар", "засух", "огон"],
    deckWeights: { health: 4, baggage: 3, profession: 3, biology: 2 },
  },
  {
    keywords: ["flood", "water", "ocean", "rain", "навод", "вод", "океан", "дожд"],
    deckWeights: { profession: 4, baggage: 4, health: 2 },
  },
  {
    keywords: ["food", "hunger", "famine", "голод", "ед", "пищ", "урож"],
    deckWeights: { profession: 4, baggage: 5, health: 3, hobby: 1 },
  },
  {
    keywords: ["social", "riot", "collapse", "panic", "бунт", "социал", "паник", "крах"],
    deckWeights: { profession: 4, hobby: 3, fact: 3, baggage: 1 },
  },
];
