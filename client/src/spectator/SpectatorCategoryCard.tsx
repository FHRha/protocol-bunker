import type { PublicCategorySlot } from "@bunker/shared";
import { getCardBackUrl, getCardFaceUrl } from "../cards";
import { shouldShowCardFront } from "../game/cardFacePolicy";

export type SpectatorCategoryKey =
  | "profession"
  | "health"
  | "hobby"
  | "baggage"
  | "fact1"
  | "fact2"
  | "biology"
  | "special";

type ReadOnlyCard = {
  labelShort: string;
  imgUrl?: string;
};

const FALLBACK_LABELS: Record<SpectatorCategoryKey, string> = {
  profession: "profession",
  health: "health",
  hobby: "hobby",
  baggage: "baggage",
  fact1: "fact1",
  fact2: "fact2",
  biology: "biology",
  special: "special",
};

interface SpectatorCategoryCardProps {
  category: PublicCategorySlot;
  hiddenLabel: string;
  cardLocale: "ru" | "en";
  categoryLabels?: Record<SpectatorCategoryKey, string>;
  normalizeCategoryKey: (value: string) => SpectatorCategoryKey | null;
  categoryLabel: (key: SpectatorCategoryKey, labels: Record<SpectatorCategoryKey, string>) => string;
}

export function SpectatorCategoryCard({
  category,
  hiddenLabel,
  cardLocale,
  categoryLabels,
  normalizeCategoryKey,
  categoryLabel,
}: SpectatorCategoryCardProps) {
  const categoryKey = normalizeCategoryKey(category.category) ?? "special";
  const labels = categoryLabels ?? FALLBACK_LABELS;
  const categoryTitle = labels[categoryKey] ?? categoryLabel(categoryKey, labels);
  const isRevealed = shouldShowCardFront(
    {
      status: category.status,
      revealed: category.status === "revealed",
      faceUp: category.status === "revealed",
    },
    { mode: "spectator" }
  );
  const card = category.cards[0] as ReadOnlyCard | undefined;
  const frontLabel = String(card?.labelShort ?? categoryTitle).trim() || categoryTitle;
  const faceSrc = getCardFaceUrl(card?.imgUrl);
  const backSrc = getCardBackUrl(categoryKey, cardLocale) || getCardBackUrl("facts", cardLocale);

  if (isRevealed && faceSrc) {
    return (
      <div className="card-tile" title={frontLabel}>
        <img src={faceSrc} alt={frontLabel} loading="lazy" decoding="async" />
      </div>
    );
  }

  if (isRevealed) {
    if (backSrc) {
      return (
        <div className="card-tile" title={frontLabel}>
          <img src={backSrc} alt={frontLabel} loading="lazy" decoding="async" />
          <span className="card-tile-label">{frontLabel}</span>
        </div>
      );
    }
    return (
      <div className="card-tile fallback" title={frontLabel}>
        <span>{frontLabel}</span>
      </div>
    );
  }

  if (backSrc) {
    return (
      <div className="card-tile" title={categoryTitle}>
        <img src={backSrc} alt={categoryTitle} loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div className="card-tile fallback" title={category.category}>
      <span>{hiddenLabel}</span>
    </div>
  );
}
