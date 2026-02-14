import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type CardDeck = "бункер" | "угроза";
export type SubtitleMap = Map<string, string>;

type SubtitleRow = {
  deck?: unknown;
  title?: unknown;
  path?: unknown;
  subtitle?: unknown;
};

const SUBTITLES_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "data",
  "cards_bunker_threats.json"
);

let cached: SubtitleMap | null = null;
let loading: Promise<SubtitleMap> | null = null;

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function norm(value: string): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[–—]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ");
}

export function normDeck(deck: string): CardDeck {
  const d = norm(deck);
  if (d.includes("бунк") || d.includes("bunker")) return "бункер";
  if (d.includes("угроз") || d.includes("threat")) return "угроза";
  return d as CardDeck;
}

function cleanLine(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isSupportedDeck(deck: string): deck is CardDeck {
  return deck === "бункер" || deck === "угроза";
}

export function subtitleKey(deck: string, title: string): string {
  return `${normDeck(deck)}::${norm(title)}`;
}

export async function getSubtitleMap(): Promise<SubtitleMap> {
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    const map: SubtitleMap = new Map();
    try {
      const raw = await fs.readFile(SUBTITLES_PATH, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        console.warn("[overlay] subtitles JSON must be an array:", SUBTITLES_PATH);
        cached = map;
        return map;
      }

      for (const row of parsed as SubtitleRow[]) {
        if (!row || typeof row !== "object") continue;
        const deckRaw = toNonEmptyString(row.deck);
        const title = toNonEmptyString(row.title);
        const subtitleRaw = toNonEmptyString(row.subtitle);
        if (!deckRaw || !title || !subtitleRaw) continue;
        const deck = normDeck(deckRaw);
        if (!isSupportedDeck(deck)) continue;
        const subtitle = cleanLine(subtitleRaw);
        if (!subtitle) continue;
        map.set(subtitleKey(deck, title), subtitle);
      }
    } catch (error) {
      console.warn("[overlay] failed to load card subtitles:", error);
    }
    cached = map;
    return map;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}
