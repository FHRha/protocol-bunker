import type { CardInHand, GameView } from "@bunker/shared";

const FACTS_CATEGORY_ALIASES = new Map<string, string>([
  ["fact1", "facts1"],
  ["facts 1", "facts1"],
  ["fact 1", "facts1"],
  ["факт1", "facts1"],
  ["факт 1", "facts1"],
  ["fact2", "facts2"],
  ["facts 2", "facts2"],
  ["fact 2", "facts2"],
  ["факт2", "facts2"],
  ["факт 2", "facts2"],
]);

function normalizeCategory(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getCardCategoryKeys(card: CardInHand, view: GameView): string[] {
  const keys = new Set<string>();
  for (const slot of view.you.categories ?? []) {
    if (slot.cards.some((entry) => entry.instanceId === card.instanceId)) {
      keys.add(slot.category);
    }
  }
  if (card.deck === "facts") {
    keys.add("facts");
  } else if (card.deck) {
    keys.add(card.deck);
  }
  return Array.from(keys);
}

function getForcedRevealCategory(view: GameView): string | undefined {
  const raw = view.public.roundRules?.forcedRevealCategory;
  const normalized = normalizeCategory(raw);
  if (!normalized) return undefined;
  return FACTS_CATEGORY_ALIASES.get(normalized) ?? normalized;
}

export function getRevealCategoryKey(card: CardInHand, view: GameView): string {
  return getCardCategoryKeys(card, view)[0] ?? card.deck;
}

export function getRevealedOwnCount(view: GameView): number {
  return view.you.hand.filter((card) => card.revealed).length;
}

export function isProfessionCard(card: CardInHand, view: GameView): boolean {
  return getCardCategoryKeys(card, view).some((category) => normalizeCategory(category) === "profession");
}

export function getHiddenRevealCandidates(view: GameView): CardInHand[] {
  return view.you.hand.filter((card) => !card.revealed && card.instanceId);
}

export function getForcedRevealCandidates(view: GameView): CardInHand[] {
  const forcedCategory = getForcedRevealCategory(view);
  if (!forcedCategory) return [];
  return getHiddenRevealCandidates(view).filter((card) => {
    return getCardCategoryKeys(card, view).some((category) => {
      const normalized = normalizeCategory(category);
      return normalized === forcedCategory || FACTS_CATEGORY_ALIASES.get(normalized) === forcedCategory;
    });
  });
}

export function pickRequiredRevealCard(view: GameView): CardInHand | null {
  const forced = getForcedRevealCandidates(view);
  if (forced.length > 0) return forced[0] ?? null;
  if (getRevealedOwnCount(view) === 0) {
    return getHiddenRevealCandidates(view).find((card) => isProfessionCard(card, view)) ?? null;
  }
  return null;
}
