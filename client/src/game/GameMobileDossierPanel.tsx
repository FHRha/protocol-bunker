import type { Dispatch, SetStateAction } from "react";
import type { GameView, SpecialConditionInstance } from "@bunker/shared";
import { getCategoryDisplayLabel, type GameCategoryLabels, normalizeCategoryKey } from "./categoryPresentation";

type GameTextLike = {
  t: (key: string, params?: Record<string, unknown>) => string;
};

type GameLocaleLike = GameCategoryLabels;

interface GameMobileDossierPanelProps {
  you: NonNullable<GameView["you"]>;
  orderedDossierCategories: string[];
  isCategoryLockedByForcedReveal: (category: string) => boolean;
  isCardSelectableForReveal: (category: string, revealed: boolean) => boolean;
  gameText: GameTextLike;
  gameLocale: GameLocaleLike;
  postGameActive: boolean;
  youStatus: string;
  canUseSpecialNow: (special: SpecialConditionInstance) => boolean;
  handleApplySpecialFromDossier: (special: SpecialConditionInstance) => void;
  selectedCardId: string | null;
  setSelectedCardId: Dispatch<SetStateAction<string | null>>;
}

export function GameMobileDossierPanel({
  you,
  orderedDossierCategories,
  isCategoryLockedByForcedReveal,
  isCardSelectableForReveal,
  gameText,
  gameLocale,
  postGameActive,
  youStatus,
  canUseSpecialNow,
  handleApplySpecialFromDossier,
  selectedCardId,
  setSelectedCardId,
}: GameMobileDossierPanelProps) {
  const categoriesSet = new Set(orderedDossierCategories);
  const cardsByCategory = orderedDossierCategories
    .filter((category) => categoriesSet.has(category))
    .map((category) => {
      const slot = you.categories.find((entry) => normalizeCategoryKey(entry.category) === category);
      const cards = slot?.cards ?? [];
      const categoryLocked = isCategoryLockedByForcedReveal(category);
      const selectableCards = cards.filter((card) => isCardSelectableForReveal(category, card.revealed));
      return {
        category,
        cards,
        selectableCards,
        categoryLocked,
      };
    });

  return (
    <div className="mobile-dossier">
      <div className="mobile-dossier-header">
        <div>
          <div className="mobile-dossier-title">{gameText.t("dossierTitle")}</div>
          <div className="muted">{gameText.t("dossierSubtitle")}</div>
          {postGameActive ? <div className="muted">{gameText.t("postGameRevealHint")}</div> : null}
        </div>
        <span className={youStatus === "alive" ? "badge revealed" : "badge eliminated"}>
          {youStatus === "alive" ? gameText.t("statusAlive") : gameText.t("statusEliminated")}
        </span>
      </div>

      <div className="mobile-dossier-section">
        <div className="panel-subtitle">{gameText.t("specialTitle")}</div>
        <div className="special-list">
          {you.specialConditions.map((special) => {
            const canUse = canUseSpecialNow(special);
            return (
              <div key={special.instanceId} className="special-card compact">
                <div className="special-header">
                  <div className="special-title">{special.title}</div>
                  <span
                    className={`special-status ${
                      special.used ? "used" : special.revealedPublic ? "revealed" : "hidden"
                    }`}
                  />
                </div>
                <div className="special-description">{special.text}</div>
                {special.used ? (
                  <div className="special-meta">
                    <span>{gameText.t("specialApplied")}</span>
                  </div>
                ) : null}
                <div className="special-actions">
                  <button className="primary" disabled={!canUse} onClick={() => handleApplySpecialFromDossier(special)}>
                    {gameText.t("useSpecialButton")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mobile-dossier-section">
        <div className="panel-subtitle">{gameText.t("dossierCardsTitle")}</div>
        <div className="mobile-dossier-cards">
          {cardsByCategory.map(({ category, cards, selectableCards, categoryLocked }) => {
            const label = getCategoryDisplayLabel(category, gameLocale);
            const value = cards.length === 0 ? "-" : cards.map((card) => card.labelShort ?? "-").join(" • ");
            const firstSelectable = selectableCards[0];
            const selectedInCategory = cards.some((card) => card.instanceId === selectedCardId);
            const revealedInCategory = cards.some((card) => card.revealed);
            const showOptions = cards.length > 1 && selectableCards.length > 0;
            return (
              <div
                key={category}
                className={`mobile-dossier-card${selectedInCategory ? " selected" : ""}${revealedInCategory ? " revealed" : ""}${categoryLocked ? " inactive" : ""}`}
                onClick={() => {
                  if (categoryLocked) return;
                  if (firstSelectable) {
                    setSelectedCardId(firstSelectable.instanceId);
                  }
                }}
                role="button"
                tabIndex={categoryLocked ? -1 : 0}
                onKeyDown={(event) => {
                  if (categoryLocked) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (firstSelectable) {
                      setSelectedCardId(firstSelectable.instanceId);
                    }
                  }
                }}
              >
                <div className="mobile-dossier-label">{label}</div>
                <div className="mobile-dossier-value">{value}</div>
                {showOptions ? (
                  <div className="mobile-dossier-options">
                    {cards.map((card) => {
                      const selectable = isCardSelectableForReveal(category, card.revealed);
                      return (
                        <button
                          key={card.instanceId}
                          type="button"
                          className={`mobile-dossier-option${card.instanceId === selectedCardId ? " selected" : ""}`}
                          disabled={!selectable}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (selectable) {
                              setSelectedCardId(card.instanceId);
                            }
                          }}
                        >
                          {card.labelShort ?? "-"}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
