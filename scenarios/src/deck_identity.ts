import type { AssetCard, AssetCatalog } from "@bunker/shared";

// Default deck labels used as fallback when looking up decks by ID.
// Use Russian names as that's the primary locale for the game.
export const DECK_ID_TO_DEFAULT_LABEL: Record<string, string> = {
  profession: "Профессия",
  health: "Здоровье",
  hobby: "Хобби",
  baggage: "Багаж",
  fact: "Факты",
  biology: "Биология",
  special: "Особые условия",
  bunker: "Бункер",
  disaster: "Катастрофа",
  threat: "Угроза",
  back: "Рубашки",
};

const DECK_LABEL_TO_ID: Record<string, string> = {
  profession: "profession",
  professions: "profession",
  health: "health",
  hobby: "hobby",
  hobbies: "hobby",
  baggage: "baggage",
  bag: "baggage",
  fact: "fact",
  facts: "fact",
  biology: "biology",
  special: "special",
  specials: "special",
  "special conditions": "special",
  bunker: "bunker",
  disaster: "disaster",
  disasters: "disaster",
  threat: "threat",
  threats: "threat",
  back: "back",
  backs: "back",
  // Russian aliases (кириллица)
  "\u043f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u044f": "profession", // профессия
  "\u043f\u0440\u043e\u0444\u0430": "profession", // профа (сленг)
  "\u0437\u0434\u043e\u0440\u043e\u0432\u044c\u0435": "health", // здоровье
  "\u0445\u043e\u0431\u0431\u0438": "hobby", // хобби
  "\u0431\u0430\u0433\u0430\u0436": "baggage", // багаж
  "\u0444\u0430\u043a\u0442\u044b": "fact", // факты
  "\u0431\u0438\u043e\u043b\u043e\u0433\u0438\u044f": "biology", // биология
  "\u043e\u0441\u043e\u0431\u044b\u0435 \u0443\u0441\u043b\u043e\u0432\u0438\u044f": "special", // особые условия
  "\u0431\u0443\u043d\u043a\u0435\u0440": "bunker", // бункер
  "\u043a\u0430\u0442\u0430\u0441\u0442\u0440\u043e\u0444\u0430": "disaster", // катастрофа
  "\u0443\u0433\u0440\u043e\u0437\u0430": "threat", // угроза
  "\u0440\u0443\u0431\u0430\u0448\u043a\u0438": "back", // рубашки
  // English aliases
  "prof": "profession",
  "hp": "health",
  "bio": "biology",
};

const normalizeKey = (value: string): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ");

const inferDeckIdFromAssetPath = (assetId?: string): string | undefined => {
  const raw = String(assetId ?? "").trim();
  if (!raw) return undefined;
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const deckDir = parts[parts.length - 2];
  const normalized = normalizeKey(deckDir);
  return DECK_LABEL_TO_ID[normalized];
};

export const resolveDeckIdByLabel = (value?: string): string | undefined => {
  const normalized = normalizeKey(String(value ?? ""));
  if (!normalized) return undefined;
  return DECK_LABEL_TO_ID[normalized];
};

export const resolveAssetDeckId = (card?: Pick<AssetCard, "deck" | "deckId" | "id">): string | undefined => {
  if (!card) return undefined;
  const byId = resolveDeckIdByLabel(card.deckId);
  if (byId) return byId;
  const byDeck = resolveDeckIdByLabel(card.deck);
  if (byDeck) return byDeck;
  return inferDeckIdFromAssetPath(card.id);
};

type DeckEntry = {
  deckName: string;
  cards: AssetCard[];
};

export type DeckAccess = {
  getDeckCards: (deckId: string, fallbackDeckName?: string) => AssetCard[];
  getDeckName: (deckId: string, fallbackDeckName?: string) => string;
};

export const buildDeckAccess = (assets: AssetCatalog): DeckAccess => {
  const byId = new Map<string, DeckEntry>();
  const byName = new Map<string, DeckEntry>();

  for (const [deckName, cards] of Object.entries(assets.decks)) {
    const normalizedDeckName = normalizeKey(deckName);
    const entry: DeckEntry = { deckName, cards };
    byName.set(normalizedDeckName, entry);

    let resolvedDeckId = resolveDeckIdByLabel(deckName);
    if (!resolvedDeckId && cards.length > 0) {
      resolvedDeckId = resolveAssetDeckId(cards[0]);
    }
    if (!resolvedDeckId) continue;
    if (!byId.has(resolvedDeckId)) {
      byId.set(resolvedDeckId, entry);
    }
  }

  const getDeckCards = (deckId: string, fallbackDeckName?: string): AssetCard[] => {
    const normalizedDeckId = resolveDeckIdByLabel(deckId) ?? deckId;
    const byDeckId = byId.get(normalizedDeckId);
    if (byDeckId) return byDeckId.cards;
    const fallbackKey = normalizeKey(String(fallbackDeckName ?? DECK_ID_TO_DEFAULT_LABEL[normalizedDeckId] ?? ""));
    if (fallbackKey) {
      const byFallback = byName.get(fallbackKey);
      if (byFallback) return byFallback.cards;
    }
    return [];
  };

  const getDeckName = (deckId: string, fallbackDeckName?: string): string => {
    const normalizedDeckId = resolveDeckIdByLabel(deckId) ?? deckId;
    const byDeckId = byId.get(normalizedDeckId);
    if (byDeckId) return byDeckId.deckName;
    return fallbackDeckName ?? DECK_ID_TO_DEFAULT_LABEL[normalizedDeckId] ?? deckId;
  };

  return { getDeckCards, getDeckName };
};
