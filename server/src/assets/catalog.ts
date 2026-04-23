import fs from "node:fs";
import path from "node:path";
import { formatLabelShort, type AssetCatalog, type AssetCard } from "@bunker/shared";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const KNOWN_ASSET_VARIANTS = ["1x", "2x"] as const;
const KNOWN_LOCALES = ["ru", "en"] as const;
const KNOWN_DECK_IDS = new Set([
  "profession",
  "health",
  "hobby",
  "baggage",
  "fact",
  "biology",
  "special",
  "bunker",
  "disaster",
  "threat",
  "back",
]);

// Fallback deck labels for legacy/non-localized mode.
// These are used when locale dictionary is not available.
// Use localized names (Russian by default) for compatibility with scenario code.
const LEGACY_DECK_LABEL_BY_ID: Record<string, string> = {
  profession: "Профессия",
  health: "Здоровье",
  hobby: "Хобби",
  baggage: "Багаж",
  fact: "Факты",
  biology: "Биология",
  special: "Особые условия",
  bunker: "Бункер",
  disaster: "Катастрофа",
  threat: "Угроза",
  back: "Рубашки",
};

type DeckLocalesFile = {
  decks?: Record<string, string>;
  cards?: Record<string, string>;
};

type DeckSource = {
  root: string;
  localized: boolean;
  locale: string;
};

const normalizeKey = (value: string) => value.trim().toLowerCase();
const localeDictionaryCache = new Map<string, DeckLocalesFile>();

const readLocaleDictionary = (assetsRoot: string, locale: string): DeckLocalesFile => {
  const cacheKey = `${path.resolve(assetsRoot)}::${locale}`;
  const cached = localeDictionaryCache.get(cacheKey);
  if (cached) return cached;

  // Try multiple paths to find locale dictionary
  const paths = [
    // Primary: assetsRoot/../locales/cards/{locale}.json (for portable: app/assets/../locales = app/locales)
    path.join(assetsRoot, "..", "locales", "cards", `${locale}.json`),
    // Fallback 1: assetsRoot/locales/cards/{locale}.json
    path.join(assetsRoot, "locales", "cards", `${locale}.json`),
    // Fallback 2: legacy path in decks folder
    path.join(assetsRoot, "decks", "locales", `${locale}.json`),
  ];

  for (const filePath of paths) {
    const resolved = path.resolve(filePath);
    if (fs.existsSync(resolved)) {
      try {
        const raw = fs.readFileSync(resolved, "utf8");
        const parsed = JSON.parse(raw) as DeckLocalesFile;
        const decks = parsed.decks && typeof parsed.decks === "object" ? parsed.decks : undefined;
        const cards = parsed.cards && typeof parsed.cards === "object" ? parsed.cards : undefined;
        const result = { decks, cards };
        localeDictionaryCache.set(cacheKey, result);
        return result;
      } catch (error) {
        console.warn(`[assets] failed to read locale dictionary ${resolved}:`, error);
      }
    }
  }

  const empty: DeckLocalesFile = {};
  localeDictionaryCache.set(cacheKey, empty);
  return empty;
};

// Simple Cyrillic to Latin transliteration for card IDs
function transliterateCyrillic(text: string): string {
  const mapping: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
    'я': 'ya',
  };
  return text
    .toLowerCase()
    .split('')
    .map((char) => mapping[char] ?? char)
    .join('');
}

const toCardIdFromFile = (fileName: string, deckId: string): string => {
  const withoutExt = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  const prefix = `${deckId}.`;
  if (withoutExt.toLowerCase().startsWith(prefix)) {
    return withoutExt.slice(prefix.length);
  }
  // Transliterate Cyrillic to Latin for consistent card ID matching
  return transliterateCyrillic(withoutExt);
};

const formatFallbackCardLabel = (cardId: string): string => {
  const humanized = cardId.replace(/[._-]+/g, " ");
  return formatLabelShort(humanized);
};

function isLocaleContainerDir(dirPath: string): boolean {
  if (!fs.existsSync(dirPath)) return false;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (entries.length === 0) return false;
  const knownCount = entries.filter((entry) => KNOWN_DECK_IDS.has(normalizeKey(entry.name))).length;
  return knownCount >= 3;
}

function selectDeckSourceRoot(decksRoot: string): DeckSource {
  const topLevelDirs = fs.readdirSync(decksRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const byLower = new Map(topLevelDirs.map((entry) => [entry.name.toLowerCase(), entry.name]));
  const hasVariants = KNOWN_ASSET_VARIANTS.some((variant) => byLower.has(variant));

  const layoutModeRaw = process.env.BUNKER_DECKS_LAYOUT?.trim().toLowerCase();
  const layoutMode = layoutModeRaw === "legacy" || layoutModeRaw === "v2" || layoutModeRaw === "auto" ? layoutModeRaw : "auto";
  const requestedLocale = process.env.BUNKER_ASSET_LOCALE?.trim().toLowerCase() || "ru";

  const getVariantRoot = () => {
    if (!hasVariants) return decksRoot;
    const requestedVariant = process.env.BUNKER_ASSET_VARIANT?.trim().toLowerCase();
    if (requestedVariant && byLower.has(requestedVariant)) {
      return path.join(decksRoot, byLower.get(requestedVariant)!);
    }
    for (const variant of KNOWN_ASSET_VARIANTS) {
      if (byLower.has(variant)) {
        return path.join(decksRoot, byLower.get(variant)!);
      }
    }
    return decksRoot;
  };

  const variantRoot = getVariantRoot();

  if (layoutMode === "legacy") {
    return { root: variantRoot, localized: false, locale: requestedLocale };
  }

  const localeCandidates = [requestedLocale, ...KNOWN_LOCALES.filter((locale) => locale !== requestedLocale)];
  for (const locale of localeCandidates) {
    const localeRoot = path.join(variantRoot, locale);
    if (isLocaleContainerDir(localeRoot)) {
      return { root: localeRoot, localized: true, locale };
    }
  }

  return { root: variantRoot, localized: false, locale: requestedLocale };
}

export function buildAssetCatalog(assetsRoot: string): AssetCatalog {
  const decksRoot = path.join(assetsRoot, "decks");
  const decks: Record<string, AssetCard[]> = {};

  if (!fs.existsSync(decksRoot)) {
    return { decks };
  }

  const source = selectDeckSourceRoot(decksRoot);
  // Always read locale dictionary for card labels, even in non-localized mode
  const localeDictionary = readLocaleDictionary(assetsRoot, source.locale);
  const baseLocaleDictionary =
    source.locale === "en" ? localeDictionary : readLocaleDictionary(assetsRoot, "en");
  
  const deckDirs = fs.readdirSync(source.root, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const deckDir of deckDirs) {
    if (!source.localized) {
      const maybeLocaleRoot = path.join(source.root, deckDir.name);
      if (isLocaleContainerDir(maybeLocaleRoot)) {
        // Ignore locale roots in legacy mode.
        continue;
      }
    }

    const deckPath = path.join(source.root, deckDir.name);
    const files = fs.readdirSync(deckPath, { withFileTypes: true }).filter((entry) => entry.isFile());
    const cards: AssetCard[] = [];

    const deckId = normalizeKey(deckDir.name);
    const localizedDeckName =
      localeDictionary.decks?.[deckId] ??
      baseLocaleDictionary.decks?.[deckId] ??
      LEGACY_DECK_LABEL_BY_ID[deckId] ??
      deckDir.name;
    const deckName = source.localized ? localizedDeckName : deckDir.name;

    for (const file of files) {
      const extension = path.extname(file.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;

      const fullPath = path.join(deckPath, file.name);
      const relativePath = path.relative(assetsRoot, fullPath);
      const assetId = relativePath.split(path.sep).join("/");
      const cardId = toCardIdFromFile(file.name, deckId);
      const cardKey = `${deckId}.${cardId}`;
      // Always use locale dictionary for card labels
      const labelShort = localeDictionary.cards?.[cardKey] ??
        baseLocaleDictionary.cards?.[cardKey] ??
        formatFallbackCardLabel(cardId);

      cards.push({
        id: assetId,
        deck: deckName,
        labelShort,
        deckId: source.localized ? deckId : undefined,
        cardId: source.localized ? cardId : undefined,
        locale: source.localized ? source.locale : undefined,
      });
    }

    decks[deckName] = cards;
  }

  return { decks };
}

