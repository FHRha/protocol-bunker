import type { PublicCategorySlot, PublicPlayerView } from "@bunker/shared";
import { SpectatorCategoryCard, type SpectatorCategoryKey } from "./SpectatorCategoryCard";

interface SpectatorSelectedPanelProps {
  selectedPlayer: PublicPlayerView | null;
  selectedCategories: PublicCategorySlot[];
  selectedPlayerTitle: string;
  selectedPlayerHint: string;
  cardHidden: string;
  cardLocale: "ru" | "en";
  categoryLabels: Record<SpectatorCategoryKey, string>;
  normalizeCategoryKey: (value: string) => SpectatorCategoryKey | null;
  categoryLabel: (key: SpectatorCategoryKey, labels: Record<SpectatorCategoryKey, string>) => string;
}

export function SpectatorSelectedPanel({
  selectedPlayer,
  selectedCategories,
  selectedPlayerTitle,
  selectedPlayerHint,
  cardHidden,
  cardLocale,
  categoryLabels,
  normalizeCategoryKey,
  categoryLabel,
}: SpectatorSelectedPanelProps) {
  return (
    <aside className="selected-panel spectator-selected-panel">
      <div className="selected-header">
        <div className="panel-subtitle">{selectedPlayerTitle}</div>
        {selectedPlayer ? <div className="selected-name">{selectedPlayer.name}</div> : null}
      </div>
      {selectedPlayer ? (
        <div className="spectatorSelectedGrid">
          {selectedCategories.map((category) => (
            <SpectatorCategoryCard
              key={`${selectedPlayer.playerId}-${category.category}`}
              category={category}
              hiddenLabel={cardHidden}
              cardLocale={cardLocale}
              categoryLabels={categoryLabels}
              normalizeCategoryKey={normalizeCategoryKey}
              categoryLabel={categoryLabel}
            />
          ))}
        </div>
      ) : (
        <div className="selected-empty muted">{selectedPlayerHint}</div>
      )}
    </aside>
  );
}
