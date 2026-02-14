import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatLabelShort, type AssetCatalog, type WorldCard, type WorldFacedCard, type WorldState30 } from "@bunker/shared";

type WorldCountRow = { min: number; max: number; bunker: number; threats: number };

const WORLD_COUNTS: WorldCountRow[] = [
  { min: 4, max: 4, bunker: 5, threats: 3 },
  { min: 5, max: 6, bunker: 5, threats: 4 },
  { min: 7, max: 9, bunker: 5, threats: 5 },
  { min: 10, max: 16, bunker: 5, threats: 6 },
];

type DisasterTextRow = {
  title?: string;
  text?: string;
  sourceFile?: string;
  slug?: string;
};

const DISASTER_TEXTS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "server",
  "data",
  "world",
  "disasters.ru.json"
);

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDisasterLookupKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function addDisasterLookupKey(target: Map<string, string>, keyRaw: string | undefined, text: string): void {
  const key = toNonEmptyString(keyRaw);
  if (!key) return;
  const normalized = normalizeDisasterLookupKey(key);
  if (!normalized) return;
  if (!target.has(normalized)) {
    target.set(normalized, text);
  }
}

function loadDisasterTextMap(): Map<string, string> {
  const result = new Map<string, string>();
  if (!fs.existsSync(DISASTER_TEXTS_PATH)) {
    return result;
  }
  try {
    const raw = fs.readFileSync(DISASTER_TEXTS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, DisasterTextRow>;
    for (const [jsonKey, row] of Object.entries(parsed)) {
      const text = toNonEmptyString(row?.text);
      if (!text) continue;
      addDisasterLookupKey(result, jsonKey, text);
      addDisasterLookupKey(result, formatLabelShort(jsonKey), text);
      addDisasterLookupKey(result, row?.title, text);
      addDisasterLookupKey(result, row?.title ? formatLabelShort(row.title) : undefined, text);
      const sourceFile = toNonEmptyString(row?.sourceFile);
      if (sourceFile) {
        const sourceName = sourceFile.split("/").pop()?.replace(/\.[a-z0-9]{2,4}$/i, "");
        addDisasterLookupKey(result, sourceName, text);
        addDisasterLookupKey(result, sourceName ? formatLabelShort(sourceName) : undefined, text);
      }
    }
  } catch (error) {
    console.warn("[world_deck] failed to load disaster texts:", error);
  }
  return result;
}

const DISASTER_TEXT_MAP = loadDisasterTextMap();

function lookupDisasterText(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    const value = toNonEmptyString(candidate);
    if (!value) continue;
    const mapped = DISASTER_TEXT_MAP.get(normalizeDisasterLookupKey(value));
    if (mapped) return mapped;
  }
  return undefined;
}

const FALLBACK_BUNKER: WorldCard[] = [
  {
    kind: "bunker",
    id: "bunker_fallback_01",
    title: "Старый военный бункер",
    description: "Есть базовые запасы воды и топлива, часть систем требует ремонта.",
  },
  {
    kind: "bunker",
    id: "bunker_fallback_02",
    title: "Научный бункер",
    description: "Усиленная вентиляция и лабораторные зоны, но мало жилых мест.",
  },
  {
    kind: "bunker",
    id: "bunker_fallback_03",
    title: "Городское убежище",
    description: "Рядом инфраструктура, но безопасность средняя.",
  },
];

const FALLBACK_DISASTER: WorldCard[] = [
  {
    kind: "disaster",
    id: "disaster_fallback_01",
    title: "Радиоактивная буря",
    description: "Поверхность заражена, пребывание вне укрытия опасно.",
  },
  {
    kind: "disaster",
    id: "disaster_fallback_02",
    title: "Глобальная эпидемия",
    description: "Высокий риск заражения, важна изоляция.",
  },
  {
    kind: "disaster",
    id: "disaster_fallback_03",
    title: "Климатический коллапс",
    description: "Резкое ухудшение климата, критична устойчивость ресурсов.",
  },
];

const FALLBACK_THREAT: WorldCard[] = [
  {
    kind: "threat",
    id: "threat_fallback_01",
    title: "Нестабильное оборудование",
    description: "Системы бункера могут выйти из строя в любой момент.",
  },
  {
    kind: "threat",
    id: "threat_fallback_02",
    title: "Ограниченные запасы",
    description: "Ресурсы рассчитаны на короткий срок.",
  },
  {
    kind: "threat",
    id: "threat_fallback_03",
    title: "Внешняя агрессия",
    description: "Возможны атаки извне, нужна дисциплина и порядок.",
  },
];

const pick = (rng: () => number, deck: WorldCard[]): WorldCard => {
  const index = Math.floor(rng() * deck.length);
  return deck[index] ?? deck[0]!;
};

const pickFromAssets = (
  assets: AssetCatalog,
  deckName: string,
  kind: WorldCard["kind"],
  rng: () => number
): WorldCard | null => {
  const deck = assets.decks[deckName];
  if (!deck || deck.length === 0) return null;
  const index = Math.floor(rng() * deck.length);
  const card = deck[index] ?? deck[0]!;
  const mappedDisasterText =
    kind === "disaster"
      ? lookupDisasterText(card.labelShort, formatLabelShort(card.labelShort), card.id.split("/").pop()?.replace(/\.[a-z0-9]{2,4}$/i, ""))
      : undefined;
  return {
    kind,
    id: card.id,
    title: card.labelShort,
    description: card.labelShort,
    ...(mappedDisasterText ? { text: mappedDisasterText } : {}),
    imageId: card.id,
  };
};

const withDisasterText = (card: WorldCard): WorldCard => {
  if (card.kind !== "disaster") return card;
  const mappedText = lookupDisasterText(card.title, card.description);
  const fallbackDescription = toNonEmptyString(card.description);
  const fallbackTitle = toNonEmptyString(card.title);
  const hasDistinctDescription =
    fallbackDescription &&
    fallbackTitle &&
    normalizeDisasterLookupKey(fallbackDescription) !== normalizeDisasterLookupKey(fallbackTitle);
  const text = mappedText ?? (hasDistinctDescription ? fallbackDescription : undefined);
  if (!text) return card;
  if (card.text === text) return card;
  return { ...card, text };
};

const drawManyFromAssets = (
  assets: AssetCatalog,
  deckName: string,
  kind: WorldCard["kind"],
  count: number,
  rng: () => number,
  fallback: WorldCard[]
): WorldCard[] => {
  const deck = assets.decks[deckName]?.slice() ?? [];
  const result: WorldCard[] = [];
  for (let i = 0; i < count; i += 1) {
    if (deck.length === 0) {
      const picked = pick(rng, fallback);
      result.push({ ...picked, id: `${picked.id}_${i + 1}` });
      continue;
    }
    const index = Math.floor(rng() * deck.length);
    const [card] = deck.splice(index, 1);
    if (card) {
      result.push({
        kind,
        id: card.id,
        title: card.labelShort,
        description: card.labelShort,
        imageId: card.id,
      });
    }
  }
  return result;
};

export const getWorldCounts = (playerCount: number): { bunker: number; threats: number } => {
  const row = WORLD_COUNTS.find((entry) => playerCount >= entry.min && playerCount <= entry.max);
  if (row) return { bunker: row.bunker, threats: row.threats };
  const last = WORLD_COUNTS[WORLD_COUNTS.length - 1];
  return { bunker: last.bunker, threats: last.threats };
};

const toFaced = (card: WorldCard, revealed: boolean): WorldFacedCard => ({
  ...card,
  isRevealed: revealed,
});

export const rollWorldFromAssets = (
  assets: AssetCatalog,
  rng: () => number,
  playerCount: number
): WorldState30 => {
  const counts = getWorldCounts(playerCount);
  const pickedDisaster = pickFromAssets(assets, "Катастрофа", "disaster", rng) ?? pick(rng, FALLBACK_DISASTER);
  const disaster = withDisasterText(pickedDisaster);
  const bunkerCards = drawManyFromAssets(
    assets,
    "Бункер",
    "bunker",
    counts.bunker,
    rng,
    FALLBACK_BUNKER
  ).map((card) => toFaced(card, false));
  const threats = drawManyFromAssets(
    assets,
    "Угроза",
    "threat",
    counts.threats + 1,
    rng,
    FALLBACK_THREAT
  ).map((card) => toFaced(card, false));

  return {
    disaster,
    bunker: bunkerCards,
    threats,
    counts,
  };
};
