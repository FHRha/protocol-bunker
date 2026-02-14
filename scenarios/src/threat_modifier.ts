import type { WorldFacedCard } from "@bunker/shared";

const THREAT_MODIFIER_BY_CARD_TITLE: Record<string, number> = {
  "ВМЕСТЕ НА 10 ЛЕТ": 1,
  "ЗАГАДОЧНЫЙ ЖУРНАЛ": -1,
};

const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();

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
    const modifier = THREAT_MODIFIER_BY_CARD_TITLE[normalizeTitle(card.title)];
    if (!modifier) continue;
    delta += modifier;
    reasons.push(card.title);
  }

  return { delta, reasons };
};
