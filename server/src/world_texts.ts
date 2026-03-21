import fs from "node:fs";
import path from "node:path";
import { resolveCardKeyFromAssetId } from "./card_subtitles.js";

type DisasterLocaleFile = {
  texts?: Record<string, string>;
};

const LOCALE_CANDIDATE_ROOTS = [
  path.resolve(process.cwd(), "locales", "world", "disasters"),
  path.resolve(process.cwd(), "..", "locales", "world", "disasters"),
  path.resolve(process.cwd(), "..", "..", "locales", "world", "disasters"),
];

const KNOWN_LOCALES = ["ru", "en"] as const;
const cache = new Map<string, Map<string, string>>();

function normalizeLocale(locale: string | undefined): string {
  const normalized = String(locale ?? "").trim().toLowerCase();
  return KNOWN_LOCALES.includes(normalized as (typeof KNOWN_LOCALES)[number]) ? normalized : "ru";
}

function normalizeCardKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\u0451/g, "\u0435")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function readLocaleFile(locale: string): DisasterLocaleFile {
  for (const root of LOCALE_CANDIDATE_ROOTS) {
    const filePath = path.join(root, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as DisasterLocaleFile;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn(`[world] failed to read disaster locale ${filePath}:`, error);
      return {};
    }
  }

  return {};
}

function getLocaleMap(locale: string | undefined): Map<string, string> {
  const normalizedLocale = normalizeLocale(locale);
  const cached = cache.get(normalizedLocale);
  if (cached) return cached;

  const primary = readLocaleFile(normalizedLocale).texts ?? {};
  const fallback = normalizedLocale === "en" ? {} : readLocaleFile("en").texts ?? {};
  const result = new Map<string, string>();
  for (const [cardKeyRaw, textRaw] of Object.entries({ ...fallback, ...primary })) {
    const cardKey = normalizeCardKey(cardKeyRaw);
    const text = String(textRaw ?? "").trim();
    if (!cardKey || !text) continue;
    result.set(cardKey, text);
  }

  cache.set(normalizedLocale, result);
  return result;
}

export function getDisasterTextByAssetId(assetId: string | undefined, locale: string | undefined): string | undefined {
  const cardKey = resolveCardKeyFromAssetId(assetId);
  if (!cardKey || !cardKey.startsWith("disaster.")) return undefined;
  return getLocaleMap(locale).get(cardKey);
}
