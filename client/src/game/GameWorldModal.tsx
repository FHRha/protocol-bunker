import type { CSSProperties } from "react";
import type { GameView } from "@bunker/shared";
import Modal from "../components/Modal";
import { getCardBackUrl } from "../cards";
import { CardTile } from "./CardTile";
import type { WorldDetailState } from "./gamePageTypes";

type GameTextLike = {
  t: (key: string, params?: Record<string, unknown>) => string;
};

type GameLocaleLike = {
  worldBunkerCard: (index: number) => string;
  worldThreatCard: (index: number) => string;
};

interface GameWorldModalProps {
  open: boolean;
  onClose: () => void;
  world: GameView["world"] | null | undefined;
  isMobile: boolean;
  cardLocale: "ru" | "en";
  gameText: GameTextLike;
  gameLocale: GameLocaleLike;
  canDecidePostGameOutcome: boolean;
  onSetBunkerOutcome: (outcome: "survived" | "failed") => void;
  showThreatModifier: boolean;
  threatModifierText: string;
  getWorldImage: (imageId?: string) => string | undefined;
  visibleWorldThreats: NonNullable<GameView["world"]>["threats"];
  canRevealThreats: boolean;
  onRevealWorldThreat: (index: number) => void;
  showHints: boolean;
  openWorldDetail: (params: WorldDetailState) => void;
  worldDetail: WorldDetailState | null;
  onCloseWorldDetail: () => void;
}

export function GameWorldModal({
  open,
  onClose,
  world,
  isMobile,
  cardLocale,
  gameText,
  gameLocale,
  canDecidePostGameOutcome,
  onSetBunkerOutcome,
  showThreatModifier,
  threatModifierText,
  getWorldImage,
  visibleWorldThreats,
  canRevealThreats,
  onRevealWorldThreat,
  showHints,
  openWorldDetail,
  worldDetail,
  onCloseWorldDetail,
}: GameWorldModalProps) {
  return (
    <Modal
      open={open}
      title={gameText.t("worldModalTitle")}
      onClose={onClose}
      dismissible={true}
      className="world-modal"
    >
      {world ? (
        <div className="world-modal-layout">
          <div className="world-columns">
            <div
              className="world-column world-column-left world-column-grid"
              style={{ "--card-rows": Math.max(1, Math.ceil(world.bunker.length / 2)) } as CSSProperties}
            >
              {world.bunker.map((card, index) => {
                const isSoloLast = world.bunker.length % 2 === 1 && index === world.bunker.length - 1;
                const label = gameLocale.worldBunkerCard(index + 1);
                const revealed = card.isRevealed;
                const faceUrl = revealed ? getWorldImage(card.imageId) : undefined;
                const backUrl = getCardBackUrl("bunker", cardLocale);
                return (
                  <div
                    key={card.id}
                    className={`world-slot ${revealed ? "revealed clickable" : "hidden"}${isSoloLast ? " world-slot--solo" : ""}`}
                    role={revealed ? "button" : undefined}
                    tabIndex={revealed ? 0 : -1}
                    onClick={() => {
                      if (!revealed) return;
                      openWorldDetail({
                        kind: gameText.t("worldKindBunker"),
                        title: card.title || label,
                        description: card.description,
                        imageUrl: faceUrl,
                        label,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (!revealed) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openWorldDetail({
                          kind: gameText.t("worldKindBunker"),
                          title: card.title || label,
                          description: card.description,
                          imageUrl: faceUrl,
                          label,
                        });
                      }
                    }}
                  >
                    <div className="world-slot-header">{gameText.t("worldKindBunker")}</div>
                    <div className="world-slot-media">
                      <CardTile src={revealed ? faceUrl : backUrl} fallback={label} />
                    </div>
                    <div className="world-slot-footer">
                      <div className="world-slot-title">{revealed ? card.title : label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="world-center">
              {canDecidePostGameOutcome ? (
                <div className="world-outcome-actions">
                  <button className="primary world-outcome-button success" onClick={() => onSetBunkerOutcome("survived")}>
                    {gameText.t("bunkerOutcomeSurvived")}
                  </button>
                  <button className="primary world-outcome-button danger" onClick={() => onSetBunkerOutcome("failed")}>
                    {gameText.t("bunkerOutcomeFailed")}
                  </button>
                </div>
              ) : null}
              {showThreatModifier ? <div className="world-threat-modifier">{threatModifierText}</div> : null}
              <div
                className="world-center-media"
                onClick={() =>
                  openWorldDetail({
                    kind: gameText.t("worldKindDisaster"),
                    title: world.disaster.title,
                    description: world.disaster.description,
                    imageUrl: getWorldImage(world.disaster.imageId),
                    label: gameText.t("worldKindDisaster"),
                  })
                }
                role="button"
                tabIndex={0}
              >
                <CardTile src={getWorldImage(world.disaster.imageId)} fallback={gameText.t("worldKindDisaster")} />
              </div>
            </div>

            <div
              className="world-column world-column-right world-column-grid"
              style={{ "--card-rows": Math.max(1, Math.ceil(visibleWorldThreats.length / 2)) } as CSSProperties}
            >
              {visibleWorldThreats.map((card, index) => {
                const isSoloLast = visibleWorldThreats.length % 2 === 1 && index === visibleWorldThreats.length - 1;
                const label = gameLocale.worldThreatCard(index + 1);
                const revealed = card.isRevealed;
                const faceUrl = revealed ? getWorldImage(card.imageId) : undefined;
                const backUrl = getCardBackUrl("threat", cardLocale);
                const canReveal = canRevealThreats && !revealed;
                return (
                  <div
                    key={card.id}
                    className={`world-slot ${revealed ? "revealed clickable" : "hidden"} ${canReveal ? "clickable" : ""}${isSoloLast ? " world-slot--solo" : ""}`}
                    onClick={() => {
                      if (!revealed && canReveal) {
                        onRevealWorldThreat(index);
                        return;
                      }
                      if (revealed) {
                        openWorldDetail({
                          kind: gameText.t("worldKindThreat"),
                          title: card.title || label,
                          description: card.description,
                          imageUrl: faceUrl,
                          label,
                        });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (!canReveal && !revealed) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (!revealed && canReveal) {
                          onRevealWorldThreat(index);
                          return;
                        }
                        if (revealed) {
                          openWorldDetail({
                            kind: gameText.t("worldKindThreat"),
                            title: card.title || label,
                            description: card.description,
                            imageUrl: faceUrl,
                            label,
                          });
                        }
                      }
                    }}
                    role={canReveal || revealed ? "button" : undefined}
                    tabIndex={canReveal || revealed ? 0 : -1}
                  >
                    <div className="world-slot-header">{gameText.t("worldKindThreat")}</div>
                    <div className="world-slot-media">
                      <CardTile src={revealed ? faceUrl : backUrl} fallback={label} />
                    </div>
                    <div className="world-slot-footer">
                      <div className="world-slot-title">{revealed ? card.title : label}</div>
                    </div>
                    {canReveal && showHints ? <div className="world-slot-hint">{gameText.t("worldHintTapToReveal")}</div> : null}
                  </div>
                );
              })}
            </div>

            {worldDetail ? (
              <div className="world-detail-overlay" onClick={onCloseWorldDetail}>
                <div className="world-detail-card" onClick={(event) => event.stopPropagation()}>
                  <div className="world-detail-header">
                    <div className="world-detail-kind">{worldDetail.kind}</div>
                    <button className="icon-button" onClick={onCloseWorldDetail} aria-label={gameText.t("closeButton")}>
                      x
                    </button>
                  </div>
                  <div className="world-detail-title">{worldDetail.title}</div>
                  <div className="world-detail-media">
                    {worldDetail.imageUrl ? (
                      <img src={worldDetail.imageUrl} alt={worldDetail.label} loading="lazy" decoding="async" />
                    ) : (
                      <div className="world-detail-fallback">{worldDetail.label}</div>
                    )}
                  </div>
                  {!worldDetail.imageUrl && worldDetail.description ? (
                    <div className="world-detail-text">{worldDetail.description}</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="muted">{gameText.t("worldNotLoaded")}</div>
      )}
      {isMobile ? (
        <div className="world-modal-footer">
          <button className="ghost" onClick={onClose}>
            {gameText.t("closeButton")}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
