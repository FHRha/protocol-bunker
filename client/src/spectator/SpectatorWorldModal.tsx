import type { CSSProperties } from "react";
import type { WorldState30 } from "@bunker/shared";
import Modal from "../components/Modal";
import { SpectatorWorldCardTile } from "./SpectatorWorldCardTile";

interface SpectatorWorldDetail {
  title: string;
  imageUrl?: string;
  label: string;
  kind: string;
}

interface SpectatorWorldModalTexts {
  worldModalTitle: string;
  worldNotLoaded: string;
  worldKindBunker: string;
  worldKindDisaster: string;
  worldKindThreat: string;
  worldBunkerCard: (index: number) => string;
  worldThreatCard: (index: number) => string;
  closeButton: string;
}

interface SpectatorWorldModalProps {
  open: boolean;
  world: WorldState30 | undefined;
  cardLocale: "ru" | "en";
  text: SpectatorWorldModalTexts;
  worldDetail: SpectatorWorldDetail | null;
  setWorldDetail: (detail: SpectatorWorldDetail | null) => void;
  getWorldImage: (imageId?: string) => string | undefined;
  onClose: () => void;
}

export function SpectatorWorldModal({
  open,
  world,
  cardLocale,
  text,
  worldDetail,
  setWorldDetail,
  getWorldImage,
  onClose,
}: SpectatorWorldModalProps) {
  return (
    <Modal open={open} title={text.worldModalTitle} onClose={onClose} dismissible={true} className="world-modal">
      {world ? (
        <div className="world-modal-layout">
          <div className="world-columns">
            <div
              className="world-column world-column-left world-column-grid"
              style={{ "--card-rows": Math.max(1, Math.ceil(world.bunker.length / 2)) } as CSSProperties}
            >
              {world.bunker.map((card, index) => {
                const isSoloLast = world.bunker.length % 2 === 1 && index === world.bunker.length - 1;
                const label = text.worldBunkerCard(index + 1);
                const revealed = card.isRevealed;
                const imageId = (card as { imageId?: string }).imageId;
                const faceUrl = getWorldImage(imageId);
                return (
                  <div
                    key={card.id}
                    className={`world-slot ${revealed ? "revealed clickable" : "hidden"}${isSoloLast ? " world-slot--solo" : ""}`}
                    role={revealed ? "button" : undefined}
                    tabIndex={revealed ? 0 : -1}
                    onClick={() => {
                      if (!revealed) return;
                      setWorldDetail({
                        kind: text.worldKindBunker,
                        title: card.title || label,
                        imageUrl: faceUrl,
                        label,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (!revealed) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setWorldDetail({
                          kind: text.worldKindBunker,
                          title: card.title || label,
                          imageUrl: faceUrl,
                          label,
                        });
                      }
                    }}
                  >
                    <div className="world-slot-header">{text.worldKindBunker}</div>
                    <div className="world-slot-media">
                      <SpectatorWorldCardTile
                        revealed={revealed}
                        imageId={imageId}
                        label={revealed ? card.title || label : label}
                        backDeck="bunker"
                        cardLocale={cardLocale}
                      />
                    </div>
                    <div className="world-slot-footer">
                      <div className="world-slot-title">{revealed ? card.title : label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="world-center">
              <div
                className="world-center-media"
                onClick={() =>
                  setWorldDetail({
                    kind: text.worldKindDisaster,
                    title: world.disaster.title,
                    imageUrl: getWorldImage((world.disaster as { imageId?: string }).imageId),
                    label: text.worldKindDisaster,
                  })
                }
                role="button"
                tabIndex={0}
              >
                <SpectatorWorldCardTile
                  revealed={true}
                  imageId={(world.disaster as { imageId?: string }).imageId}
                  label={world.disaster.title || text.worldKindDisaster}
                  backDeck="disaster"
                  cardLocale={cardLocale}
                />
              </div>
            </div>

            <div
              className="world-column world-column-right world-column-grid"
              style={{ "--card-rows": Math.max(1, Math.ceil(world.threats.length / 2)) } as CSSProperties}
            >
              {world.threats.map((card, index) => {
                const isSoloLast = world.threats.length % 2 === 1 && index === world.threats.length - 1;
                const label = text.worldThreatCard(index + 1);
                const revealed = card.isRevealed;
                const imageId = (card as { imageId?: string }).imageId;
                const faceUrl = getWorldImage(imageId);
                return (
                  <div
                    key={card.id}
                    className={`world-slot ${revealed ? "revealed clickable" : "hidden"}${isSoloLast ? " world-slot--solo" : ""}`}
                    role={revealed ? "button" : undefined}
                    tabIndex={revealed ? 0 : -1}
                    onClick={() => {
                      if (!revealed) return;
                      setWorldDetail({
                        kind: text.worldKindThreat,
                        title: card.title || label,
                        imageUrl: faceUrl,
                        label,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (!revealed) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setWorldDetail({
                          kind: text.worldKindThreat,
                          title: card.title || label,
                          imageUrl: faceUrl,
                          label,
                        });
                      }
                    }}
                  >
                    <div className="world-slot-header">{text.worldKindThreat}</div>
                    <div className="world-slot-media">
                      <SpectatorWorldCardTile
                        revealed={revealed}
                        imageId={imageId}
                        label={revealed ? card.title || label : label}
                        backDeck="threat"
                        cardLocale={cardLocale}
                      />
                    </div>
                    <div className="world-slot-footer">
                      <div className="world-slot-title">{revealed ? card.title : label}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {worldDetail ? (
              <div className="world-detail-overlay" onClick={() => setWorldDetail(null)}>
                <div className="world-detail-card" onClick={(event) => event.stopPropagation()}>
                  <div className="world-detail-header">
                    <div className="world-detail-kind">{worldDetail.kind}</div>
                    <button className="icon-button" onClick={() => setWorldDetail(null)} aria-label={text.closeButton}>
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
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="muted">{text.worldNotLoaded}</div>
      )}
    </Modal>
  );
}
