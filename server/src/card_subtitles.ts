import fs from "node:fs";
import path from "node:path";

export type SubtitleMap = Map<string, string>;

type SubtitleLocaleFile = {
  subtitles?: Record<string, string>;
};

const LOCALE_CANDIDATE_ROOTS = [
  path.resolve(process.cwd(), "locales", "world"),
  path.resolve(process.cwd(), "..", "locales", "world"),
  path.resolve(process.cwd(), "..", "..", "locales", "world"),
];

const KNOWN_LOCALES = ["ru", "en"] as const;
const KNOWN_VARIANTS = ["1x", "2x"] as const;
const SUBTITLE_GROUPS = ["bunker", "threats"] as const;

const cache = new Map<string, SubtitleMap>();

function normalizeLocale(locale: string | undefined): string {
  const normalized = String(locale ?? "").trim().toLowerCase();
  return KNOWN_LOCALES.includes(normalized as (typeof KNOWN_LOCALES)[number]) ? normalized : "ru";
}


function transliterateCyrillic(value: string): string {
  const mapping: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };
  return value
    .toLowerCase()
    .split("")
    .map((char) => mapping[char] ?? char)
    .join("");
}

function normalizeCardKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function readLocaleFile(group: (typeof SUBTITLE_GROUPS)[number], locale: string): SubtitleLocaleFile {
  for (const root of LOCALE_CANDIDATE_ROOTS) {
    const filePath = path.join(root, group, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;

    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as SubtitleLocaleFile;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.warn(`[overlay] failed to read world subtitle locale ${filePath}:`, error);
      return {};
    }
  }

  return {};
}

function buildSubtitleMap(locale: string): SubtitleMap {
  const normalizedLocale = normalizeLocale(locale);
  const map: SubtitleMap = new Map();

  for (const group of SUBTITLE_GROUPS) {
    const primary = readLocaleFile(group, normalizedLocale).subtitles ?? {};
    const fallback = normalizedLocale === "en" ? {} : readLocaleFile(group, "en").subtitles ?? {};

    for (const [cardKeyRaw, subtitleRaw] of Object.entries({ ...fallback, ...primary })) {
      const cardKey = normalizeCardKey(cardKeyRaw);
      const subtitle = String(subtitleRaw ?? "").replace(/\s+/g, " ").trim();
      if (!cardKey || !subtitle) continue;
      map.set(cardKey, subtitle);
    }
  }

  return map;
}

export function resolveCardKeyFromAssetId(assetId: string | undefined): string | undefined {
  const normalized = String(assetId ?? "").trim().replace(/^\/+/, "");
  if (!normalized) return undefined;

  const parts = normalized.split("/").filter(Boolean);
  const decksIndex = parts.findIndex((part) => part.toLowerCase() === "decks");
  if (decksIndex < 0) return undefined;

  const tail = parts.slice(decksIndex + 1);
  if (tail.length < 2) return undefined;

  let cursor = 0;
  const maybeVariant = tail[cursor]?.toLowerCase();
  if (maybeVariant && KNOWN_VARIANTS.includes(maybeVariant as (typeof KNOWN_VARIANTS)[number])) {
    cursor += 1;
  }

  const maybeLocale = tail[cursor]?.toLowerCase();
  if (maybeLocale && KNOWN_LOCALES.includes(maybeLocale as (typeof KNOWN_LOCALES)[number])) {
    cursor += 1;
  }

  const deckSegment = tail[cursor];
  const fileSegment = tail[tail.length - 1];
  if (!deckSegment || !fileSegment) return undefined;

  const deckId = normalizeCardKey(deckSegment);
  const withoutExt = fileSegment.replace(/\.[a-z0-9]{2,4}$/i, "");
  const prefix = `${deckId}.`;
  const rawCardName = withoutExt.toLowerCase().startsWith(prefix) ? withoutExt.slice(prefix.length) : withoutExt;
  const cardIdRaw = transliterateCyrillic(rawCardName);
  const cardId = normalizeCardKey(cardIdRaw);
  if (!deckId || !cardId) return undefined;

  return `${deckId}.${cardId}`;
}

export async function getSubtitleMap(locale: string | undefined): Promise<SubtitleMap> {
  const normalizedLocale = normalizeLocale(locale);
  const cached = cache.get(normalizedLocale);
  if (cached) return cached;
  const map = buildSubtitleMap(normalizedLocale);
  cache.set(normalizedLocale, map);
  return map;
}
