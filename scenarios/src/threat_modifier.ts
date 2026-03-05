import type { WorldFacedCard } from "@bunker/shared";

const THREAT_MODIFIER_BY_CARD_TITLE = new Map<string, number>([
  ["вместе на 10 лет", 1],
  ["загадочный журнал", -1],
]);

const normalizeTitle = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");

export interface ThreatDeltaResult {
  delta: number;
  reasons: string[];
}

export const getThreatDeltaFromBunkerCards = (
  cards: Array<Pick<WorldFacedCard, "title" | "isRevealed">>
): ThreatDeltaResult => {
  let delta = 0;
  const reasons: string[] = [];

  for (const card of cards) {
    if (!card.isRevealed) continue;
    const modifier = THREAT_MODIFIER_BY_CARD_TITLE.get(normalizeTitle(card.title));
    if (!modifier) continue;
    delta += modifier;
    reasons.push(card.title);
  }

  return { delta, reasons };
};
