import fs from "node:fs";
import path from "node:path";
import type { CardLocale } from "@bunker/shared";

type LocaleCode = Extract<CardLocale, "ru" | "en">;
type FieldName = "title" | "text";
type Entry = { title?: string; text?: string };

const cache = new Map<string, Record<string, Entry>>();

function readJson(filePath: string): Record<string, Entry> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, Entry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function getCandidates(scenarioId: string, locale: LocaleCode): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "locales", "special_conditions", scenarioId, `${locale}.json`),
    path.join(cwd, "..", "locales", "special_conditions", scenarioId, `${locale}.json`),
    path.join(cwd, "..", "..", "locales", "special_conditions", scenarioId, `${locale}.json`),
    path.join(cwd, "app", "locales", "special_conditions", scenarioId, `${locale}.json`),
  ];
}

function getMap(scenarioId: string, locale: LocaleCode): Record<string, Entry> {
  const key = `${scenarioId}:${locale}`;
  const cached = cache.get(key);
  if (cached) return cached;
  let data: Record<string, Entry> = {};
  for (const filePath of getCandidates(scenarioId, locale)) {
    data = readJson(filePath);
    if (Object.keys(data).length > 0) break;
  }
  cache.set(key, data);
  return data;
}

function normalizeSpecialId(specialId: string | undefined): string {
  const raw = String(specialId ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("dev-choice-")) return "dev-choice";
  return raw;
}

function stripDevSuffix(value: string): { base: string; hasDevSuffix: boolean } {
  const m = String(value ?? "").match(/^(.*)\s+\(DEV\)$/);
  if (m) return { base: m[1] ?? "", hasDevSuffix: true };
  return { base: String(value ?? ""), hasDevSuffix: false };
}

function findByFallbackValue(
  scenarioId: string,
  locale: LocaleCode,
  field: FieldName,
  fallback: string,
): string | undefined {
  if (locale === "ru") return undefined;
  const localizedMap = getMap(scenarioId, locale);
  const ruMap = getMap(scenarioId, "ru");
  const { base, hasDevSuffix } = field === "title" ? stripDevSuffix(fallback) : { base: fallback, hasDevSuffix: false };
  for (const [id, ruEntry] of Object.entries(ruMap)) {
    const ruValue = ruEntry?.[field];
    if (typeof ruValue !== "string" || ruValue.trim() !== base.trim()) continue;
    const localized = localizedMap[id]?.[field];
    if (typeof localized === "string" && localized.trim()) {
      return hasDevSuffix ? `${localized} (DEV)` : localized;
    }
  }
  return undefined;
}

export function localizeSpecialConditionField(
  scenarioId: string | undefined,
  specialId: string | undefined,
  field: FieldName,
  fallback: string,
  locale: CardLocale
): string {
  const code: LocaleCode = locale === "en" ? "en" : "ru";
  if (!scenarioId) return fallback;

  // Prefer matching by the current displayed fallback text first.
  // This is important for dev-choice cards whose instance id stays like
  // `dev-choice-<playerId>` even after the player picks a concrete special.
  // After selection, the card title/text changes to the chosen special, so
  // blindly normalizing the id back to `dev-choice` would incorrectly keep
  // returning the chooser translation and break downstream logic/tests.
  const byFallback = findByFallbackValue(scenarioId, code, field, fallback);
  if (byFallback) return byFallback;

  const normalizedId = normalizeSpecialId(specialId);
  if (normalizedId) {
    const entry = getMap(scenarioId, code)[normalizedId];
    const value = entry?.[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return fallback;
}
