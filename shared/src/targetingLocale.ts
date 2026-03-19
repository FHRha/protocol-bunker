import ruRaw from "../../locales/logic/targeting/ru.json" with { type: "json" };
import enRaw from "../../locales/logic/targeting/en.json" with { type: "json" };

type TargetingDictionary = {
  noTarget: string[];
  neighbors: string[];
  selfOnly: string[];
  includingSelf: string[];
  notSelf: string[];
  anyPlayer: string[];
  choose: string[];
};

const ru = ruRaw as TargetingDictionary;
const en = enRaw as TargetingDictionary;

const dedupe = (values: string[]): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

const mergeTerms = (key: keyof TargetingDictionary): string[] => dedupe([...(ru[key] ?? []), ...(en[key] ?? [])]);

export const TARGETING_TERMS = {
  noTarget: mergeTerms("noTarget"),
  neighbors: mergeTerms("neighbors"),
  selfOnly: mergeTerms("selfOnly"),
  includingSelf: mergeTerms("includingSelf"),
  notSelf: mergeTerms("notSelf"),
  anyPlayer: mergeTerms("anyPlayer"),
  choose: mergeTerms("choose"),
} as const;
