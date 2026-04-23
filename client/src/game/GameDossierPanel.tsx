import type { Dispatch, SetStateAction } from "react";
import type { GameView, SpecialConditionInstance } from "@bunker/shared";
import DossierMiniCard from "../components/DossierMiniCard";
import {
  DOSSIER_GRID_ROW_KEYS,
  DOSSIER_MAIN_CATEGORY_KEY,
  type GameCategoryLabels,
  getCategoryDisplayLabel,
  normalizeCategoryKey,
} from "./categoryPresentation";

type GameTextLike = {
  t: (key: string, params?: Record<string, unknown>) => string;
};

type GameLocaleLike = GameCategoryLabels & {
  devPlayersInGame: (count: number) => string;
};

type DevCheck = {
  id: string;
  label: string;
  status: "pass" | "fail";
  detail?: string;
};

interface GameDossierPanelProps {
  mobile?: boolean;
  you: NonNullable<GameView["you"]>;
  youStatus: string;
  postGameActive: boolean;
  gameText: GameTextLike;
  gameLocale: GameLocaleLike;
  canUseSpecialNow: (special: SpecialConditionInstance) => boolean;
  handleApplySpecial: (special: SpecialConditionInstance) => void;
  orderedDossierCategories: string[];
  isCategoryLockedByForcedReveal: (category: string) => boolean;
  expandedDossierKey: string | null;
  selectedCardId: string | null;
  isCardSelectableForReveal: (category: string, revealed: boolean) => boolean;
  setSelectedCardId: Dispatch<SetStateAction<string | null>>;
  setExpandedDossierKey: Dispatch<SetStateAction<string | null>>;
  canReveal: boolean;
  canRevealSelectedCard: boolean;
  canRevealPostGame: boolean;
  onRevealCard: (cardId: string) => void;
  isDevScenario: boolean;
  publicPlayers: GameView["public"]["players"];
  currentPlayerId?: string;
  devRemoveTargetId: string;
  setDevRemoveTargetId: Dispatch<SetStateAction<string>>;
  onDevAddPlayer: (name?: string) => void;
  onDevRemovePlayer: (targetPlayerId?: string) => void;
  runDevChecks: () => void;
  devChecks: DevCheck[];
  phase: string;
  resolutionNote?: string;
}

export function GameDossierPanel({
  mobile = false,
  you,
  youStatus,
  postGameActive,
  gameText,
  gameLocale,
  canUseSpecialNow,
  handleApplySpecial,
  orderedDossierCategories,
  isCategoryLockedByForcedReveal,
  expandedDossierKey,
  selectedCardId,
  isCardSelectableForReveal,
  setSelectedCardId,
  setExpandedDossierKey,
  canReveal,
  canRevealSelectedCard,
  canRevealPostGame,
  onRevealCard,
  isDevScenario,
  publicPlayers,
  currentPlayerId,
  devRemoveTargetId,
  setDevRemoveTargetId,
  onDevAddPlayer,
  onDevRemovePlayer,
  runDevChecks,
  devChecks,
  phase,
  resolutionNote,
}: GameDossierPanelProps) {
  return (
    <>
      <div className={`panel-header dossier-header${mobile ? " dossier-header-mobile" : ""}`}>
        <div>
          {!mobile ? <h3>{gameText.t("dossierTitle")}</h3> : null}
          <div className="muted">{gameText.t("dossierSubtitle")}</div>
          {postGameActive ? <div className="muted">{gameText.t("postGameRevealHint")}</div> : null}
        </div>
        <span className={youStatus === "alive" ? "badge revealed" : "badge eliminated"}>
          {youStatus === "alive" ? gameText.t("statusAlive") : gameText.t("statusEliminated")}
        </span>
      </div>

      <div className="special-section compact">
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
                    aria-label={
                      special.used
                        ? gameText.t("usedLabel", { value: gameText.t("boolean.true") })
                        : special.revealedPublic
                          ? gameText.t("cardRevealed")
                          : gameText.t("cardHidden")
                    }
                    title={
                      special.used
                        ? gameText.t("usedLabel", { value: gameText.t("boolean.true") })
                        : special.revealedPublic
                          ? gameText.t("cardRevealed")
                          : gameText.t("cardHidden")
                    }
                  />
                </div>
                <div className="special-description">{special.text}</div>
                <div className="special-meta">
                  {!special.implemented ? <span>{gameText.t("notImplemented")}</span> : null}
                  {special.used ? <span>{gameText.t("specialApplied")}</span> : null}
                </div>
                <div className="special-actions">
                  <button className="primary" disabled={!canUse} onClick={() => handleApplySpecial(special)}>
                    {gameText.t("useSpecialButton")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(() => {
        const categoriesSet = new Set(orderedDossierCategories);
        const renderMiniCard = (categoryKey: string, fullWidth = false, featured = false) => {
          const slot = you.categories.find((entry) => normalizeCategoryKey(entry.category) === categoryKey);
          const cards = slot?.cards ?? [];
          const categoryLocked = isCategoryLockedByForcedReveal(categoryKey);
          const preview = cards.length === 0 ? "-" : cards[0]?.labelShort ?? "-";
          const expandedText = cards.length === 0 ? "-" : cards.map((card) => card.labelShort).join(" • ");
          const expanded = expandedDossierKey === categoryKey;
          const firstSelectableCard =
            cards.find((card) => isCardSelectableForReveal(categoryKey, card.revealed)) ?? null;
          const selectedInCategory = cards.some((card) => card.instanceId === selectedCardId);
          const revealedInCategory = cards.some((card) => card.revealed);
          const options = cards.map((card) => {
            const selectable = isCardSelectableForReveal(categoryKey, card.revealed);
            return {
              id: card.instanceId,
              label: card.labelShort,
              selectable,
              selected: card.instanceId === selectedCardId,
            };
          });

          return (
            <DossierMiniCard
              key={categoryKey}
              label={getCategoryDisplayLabel(categoryKey, gameLocale)}
              preview={preview}
              expandedText={expandedText}
              expanded={expanded}
              selected={selectedInCategory}
              revealed={revealedInCategory}
              fullWidth={fullWidth}
              featured={featured}
              inactive={categoryLocked}
              expandable={categoryKey !== DOSSIER_MAIN_CATEGORY_KEY}
              options={options}
              onCardClick={() => {
                if (firstSelectableCard) {
                  setSelectedCardId(firstSelectableCard.instanceId);
                }
              }}
              onToggleExpand={() => {
                if (categoryKey === DOSSIER_MAIN_CATEGORY_KEY) return;
                setExpandedDossierKey((prev) => (prev === categoryKey ? null : categoryKey));
              }}
              onSelectOption={(cardId: string) => setSelectedCardId(cardId)}
            />
          );
        };

        return (
          <>
            {categoriesSet.has(DOSSIER_MAIN_CATEGORY_KEY)
              ? renderMiniCard(DOSSIER_MAIN_CATEGORY_KEY, true, true)
              : null}
            <div className="dossier-mini-grid">
              {DOSSIER_GRID_ROW_KEYS.flat()
                .filter((category) => categoriesSet.has(category))
                .map((category) => renderMiniCard(category))}
              {orderedDossierCategories
                .filter(
                  (category) =>
                    category !== DOSSIER_MAIN_CATEGORY_KEY && !DOSSIER_GRID_ROW_KEYS.flat().includes(category)
                )
                .map((category, index, arr) =>
                  renderMiniCard(category, arr.length % 2 === 1 && index === arr.length - 1)
                )}
            </div>
          </>
        );
      })()}

      {!mobile ? (
        <div className="action-block">
          <button
            className="primary"
            disabled={!canReveal || !selectedCardId || !canRevealSelectedCard}
            onClick={() => selectedCardId && onRevealCard(selectedCardId)}
          >
            {canRevealPostGame ? gameText.t("revealPostGameAction") : gameText.t("revealAction")}
          </button>
        </div>
      ) : null}

      {isDevScenario ? (
        <div className="dev-panel">
          <div className="panel-subtitle">{gameText.t("devControlsTitle")}</div>
          <div className="dev-row muted">{gameLocale.devPlayersInGame(publicPlayers.length)}</div>
          <div className="dev-actions">
            <button className="ghost button-small" onClick={() => onDevAddPlayer()}>
              {gameText.t("devAddPlayer")}
            </button>
            <div className="dev-remove">
              <select value={devRemoveTargetId} onChange={(event) => setDevRemoveTargetId(event.target.value)}>
                <option value="">{gameText.t("devRemoveLastBot")}</option>
                {publicPlayers
                  .filter((player) => player.playerId !== currentPlayerId)
                  .map((player) => (
                    <option key={player.playerId} value={player.playerId}>
                      {player.name}
                    </option>
                  ))}
              </select>
              <button
                className="ghost button-small"
                onClick={() => {
                  onDevRemovePlayer(devRemoveTargetId || undefined);
                  setDevRemoveTargetId("");
                }}
              >
                {gameText.t("devRemoveButton")}
              </button>
            </div>
          </div>
          <button className="ghost button-small" onClick={runDevChecks}>
            {gameText.t("devRunChecks")}
          </button>
          {devChecks.length > 0 ? (
            <div className="dev-checks">
              {devChecks.map((check) => (
                <div key={check.id} className={`dev-check ${check.status}`}>
                  <span>{check.label}</span>
                  <span className="dev-check-status">
                    {check.status === "pass" ? "PASS" : "FAIL"}
                    {check.detail ? ` • ${check.detail}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {phase === "resolution" ? (
        <div className="resolution-box">
          <div className="panel-subtitle">{gameText.t("resolutionTitle")}</div>
          <div>{resolutionNote ?? gameText.t("resolutionWaiting")}</div>
        </div>
      ) : null}
    </>
  );
}
