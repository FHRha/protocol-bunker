import { ASSET_BASE } from "./config";

const BACK_DECK_PATH = "decks/Рубашки";
const BACKS_BY_CATEGORY: Record<string, string> = {
  "Профессия": "Рубашка профессия.png",
  "Здоровье": "Рубашка здоровье.png",
  "Хобби": "Рубашка хобби.png",
  "Багаж": "Рубашка багаж.png",
  "Факты": "Рубашка факты.png",
  "Факт №1": "Рубашка факты.png",
  "Факт №2": "Рубашка факты.png",
  "Биология": "Рубашка биология.png",
  "Особые условия": "Рубашка особые условия.png",
  "Бункер": "Рубашка бункер.png",
  "Катастрофа": "Рубашка катастрофа.png",
  "Угроза": "Рубашка угроза.png",
};

const LEGACY_BACKS_BY_CATEGORY: Record<string, string> = {
  "Профессия": "profession",
  "Здоровье": "health",
  "Хобби": "hobby",
  "Багаж": "baggage",
  "Факты": "facts",
  "Факт №1": "facts",
  "Факт №2": "facts",
  "Биология": "biology",
  "Особые условия": "special",
  "Бункер": "bunker",
  "Катастрофа": "disaster",
  "Угроза": "threat",
};

const imageCache = new Set<string>();

export const getCardFaceUrl = (imgUrl?: string): string | undefined => {
  if (!imgUrl) return undefined;
  if (imgUrl.startsWith("http")) return imgUrl;
  let cleaned = imgUrl.replace(/^\/+/, "");
  if (cleaned.startsWith("assets/")) {
    cleaned = cleaned.slice("assets/".length);
  }
  return `${ASSET_BASE}/${encodeURI(cleaned)}`;
};

export const getCardBackUrl = (category: string): string | undefined => {
  const backFileName = BACKS_BY_CATEGORY[category];
  if (backFileName) {
    return getCardFaceUrl(`${BACK_DECK_PATH}/${backFileName}`);
  }

  const legacyKey = LEGACY_BACKS_BY_CATEGORY[category];
  if (!legacyKey) return undefined;
  return `${ASSET_BASE}/backs/${legacyKey}.jpg`;
};

export const preloadImages = (urls: Array<string | undefined>) => {
  urls.forEach((url) => {
    if (!url || imageCache.has(url)) return;
    const img = new Image();
    img.src = url;
    imageCache.add(url);
  });
};

export const preloadCategoryBacks = (categories: string[]) => {
  preloadImages(categories.map(getCardBackUrl));
};
