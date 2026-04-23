import type { UiDictionary } from "../localization";

export const CATEGORY_KEY_ORDER = ["profession", "health", "hobby", "baggage", "facts1", "facts2", "biology"];
export const PUBLIC_CATEGORY_ORDER = [...CATEGORY_KEY_ORDER, "special"];
export const DOSSIER_MAIN_CATEGORY_KEY = "profession";
export const DOSSIER_GRID_ROW_KEYS: string[][] = [
  ["health", "biology"],
  ["baggage", "hobby"],
  ["facts1", "facts2"],
];

const CATEGORY_KEY_ALIASES: Record<string, string> = {
  fact1: "facts1",
  fact2: "facts2",
  facts: "facts1",
  special_conditions: "special",
  specialconditions: "special",
  bio: "biology",
};

export type GameCategoryLabels = Pick<
  UiDictionary,
  | "categoryProfession"
  | "categoryHealth"
  | "categoryHobby"
  | "categoryBaggage"
  | "categoryFacts"
  | "categoryFact1"
  | "categoryFact2"
  | "categoryBiology"
  | "categorySpecial"
>;

export function getCategoryDisplayLabel(categoryKey: string, text: GameCategoryLabels): string {
  const labels: Record<string, string> = {
    profession: text.categoryProfession,
    health: text.categoryHealth,
    hobby: text.categoryHobby,
    baggage: text.categoryBaggage,
    facts: text.categoryFacts,
    facts1: text.categoryFact1,
    facts2: text.categoryFact2,
    biology: text.categoryBiology,
    special: text.categorySpecial,
  };
  return labels[categoryKey] ?? categoryKey;
}

export function normalizeCategoryKey(category: string): string {
  const raw = String(category ?? "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  return CATEGORY_KEY_ALIASES[lowered] ?? lowered;
}

export function getCategoryDisplayLabelFromRaw(category: string, text: GameCategoryLabels): string {
  return getCategoryDisplayLabel(normalizeCategoryKey(category), text);
}

export function getCategoryOptions(text: GameCategoryLabels): Array<{ id: string; label: string }> {
  return CATEGORY_KEY_ORDER.map((id) => ({ id, label: getCategoryDisplayLabel(id, text) }));
}

export function formatPlayerNameShort(name: string, maxLen = 14): string {
  const normalized = (name ?? "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}...`;
}
