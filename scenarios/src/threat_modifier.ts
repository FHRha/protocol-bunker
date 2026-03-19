import type { WorldFacedCard } from "@bunker/shared";

const THREAT_MODIFIER_BY_CARD_ID = new Map<string, number>([
  ["bunker.vmeste-na-10-let", 1],
  ["bunker.zagadochnyy-zhurnal", -1],
]);

const THREAT_MODIFIER_BY_TITLE = new Map<string, number>([
  ["vmeste na 10 let", 1],
  ["zagadochnyy zhurnal", -1],
  ["together for 10 years", 1],
  ["mysterious journal", -1],
]);

const normalizeTitle = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");

const extractCardId = (assetIdOrCardId: string | undefined): string | null => {
  const raw = String(assetIdOrCardId ?? "").trim();
  if (!raw) return null;

  const fileName = raw.split("/").pop() ?? raw;
  const withoutExt = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  if (/^[a-z]+\.[a-z0-9-]+$/i.test(withoutExt)) {
    return withoutExt.toLowerCase();
  }

  return null;
};

export interface ThreatDeltaResult {
  delta: number;
  reasons: string[];
  reasonCardIds: string[];
}

export const getThreatDeltaFromBunkerCards = (
  cards: Array<Pick<WorldFacedCard, "id" | "title" | "isRevealed">>
): ThreatDeltaResult => {
  let delta = 0;
  const reasons: string[] = [];
  const reasonCardIds: string[] = [];

  for (const card of cards) {
    if (!card.isRevealed) continue;

    const cardId = extractCardId(card.id);
    const modifierById = cardId ? THREAT_MODIFIER_BY_CARD_ID.get(cardId) : undefined;
    const modifierByTitle = THREAT_MODIFIER_BY_TITLE.get(normalizeTitle(card.title));
    const modifier = modifierById ?? modifierByTitle;

    if (!modifier) continue;

    delta += modifier;
    reasons.push(card.title);
    reasonCardIds.push(card.id);
  }

  return { delta, reasons, reasonCardIds };
};
