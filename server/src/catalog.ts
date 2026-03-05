import fs from "node:fs";
import path from "node:path";
import { formatLabelShort, type AssetCatalog, type AssetCard } from "@bunker/shared";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function selectDeckSourceRoot(decksRoot: string): string {
  const topLevelDirs = fs.readdirSync(decksRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const byLower = new Map(topLevelDirs.map((entry) => [entry.name.toLowerCase(), entry.name]));
  const hasVariants = byLower.has("1x") || byLower.has("2x");
  if (!hasVariants) return decksRoot;

  const requestedVariant = process.env.BUNKER_ASSET_VARIANT?.trim().toLowerCase();
  if (requestedVariant && byLower.has(requestedVariant)) {
    return path.join(decksRoot, byLower.get(requestedVariant)!);
  }

  if (byLower.has("1x")) {
    return path.join(decksRoot, byLower.get("1x")!);
  }
  if (byLower.has("2x")) {
    return path.join(decksRoot, byLower.get("2x")!);
  }

  return decksRoot;
}

export function buildAssetCatalog(assetsRoot: string): AssetCatalog {
  const decksRoot = path.join(assetsRoot, "decks");
  const decks: Record<string, AssetCard[]> = {};

  if (!fs.existsSync(decksRoot)) {
    return { decks };
  }

  const sourceRoot = selectDeckSourceRoot(decksRoot);
  const deckDirs = fs.readdirSync(sourceRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const deckDir of deckDirs) {
    const deckName = deckDir.name;
    const deckPath = path.join(sourceRoot, deckName);
    const files = fs.readdirSync(deckPath, { withFileTypes: true }).filter((entry) => entry.isFile());
    const cards: AssetCard[] = [];

    for (const file of files) {
      const extension = path.extname(file.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) continue;
      const fullPath = path.join(deckPath, file.name);
      const relativePath = path.relative(assetsRoot, fullPath);
      const assetId = relativePath.split(path.sep).join("/");
      cards.push({ id: assetId, deck: deckName, labelShort: formatLabelShort(file.name) });
    }

    decks[deckName] = cards;
  }

  return { decks };
}
