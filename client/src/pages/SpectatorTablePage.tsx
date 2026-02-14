import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type { OverlayPlayerView, PublicCategorySlot, PublicPlayerView, WorldState30 } from "@bunker/shared";
import { Link } from "react-router-dom";
import TableLayout from "../components/TableLayout";
import Modal from "../components/Modal";
import { getCardBackUrl, getCardFaceUrl } from "../cards";
import { shouldShowCardFront } from "../game/cardFacePolicy";
import { ru } from "../i18n/ru";
import { useViewState } from "../hooks/useViewState";

const CATEGORY_ORDER = [
  "Профессия",
  "Здоровье",
  "Хобби",
  "Багаж",
  "Факт №1",
  "Факт №2",
  "Биология",
  "Особые условия",
] as const;

type ReadOnlyCard = {
  labelShort: string;
  imgUrl?: string;
};

function decodeBase64UrlUtf8(value: string): string | null {
  if (!value) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const percentEncoded = Array.from(binary)
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("");
    return decodeURIComponent(percentEncoded);
  } catch {
    return null;
  }
}

function parseViewSrcFromHash(hash: string): string | null {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(clean);
  const encoded = params.get("v") ?? "";
  return decodeBase64UrlUtf8(encoded);
}

function normalizeCategoryLabel(value: string): string {
  const key = String(value ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    profession: "Профессия",
    health: "Здоровье",
    hobby: "Хобби",
    baggage: "Багаж",
    fact1: "Факт №1",
    fact2: "Факт №2",
    facts1: "Факт №1",
    facts2: "Факт №2",
    facts: "Факты",
    biology: "Биология",
    special: "Особые условия",
  };
  return map[key] ?? value;
}

function norm(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function safeName(player: OverlayPlayerView, index: number): string {
  const name = String(player.nickname ?? "").trim();
  return name || `Player ${index + 1}`;
}

function overlayPlayerToPublic(player: OverlayPlayerView, index: number): PublicPlayerView {
  const categories: PublicCategorySlot[] = (player.categories ?? []).map((category) => {
    const label = normalizeCategoryLabel(category.label || category.key);
    const raw = category as {
      imgUrl?: string;
      imageId?: string;
      cardId?: string;
      assetId?: string;
      valueImageId?: string;
    };
    const imgUrl = raw.imgUrl ?? raw.imageId ?? raw.cardId ?? raw.assetId ?? raw.valueImageId;
    const cards: ReadOnlyCard[] =
      category.revealed && String(category.value ?? "").trim()
        ? [{ labelShort: String(category.value).trim(), imgUrl }]
        : [];
    return {
      category: label,
      status: category.revealed ? "revealed" : "hidden",
      cards,
    };
  });
  const revealedCount = categories.filter((entry) => entry.status === "revealed").length;

  return {
    playerId: player.id,
    name: safeName(player, index),
    status: player.alive ? "alive" : "eliminated",
    connected: player.connected !== false,
    revealedCards: [],
    revealedCount,
    totalCards: categories.length,
    specialRevealed: false,
    categories,
  };
}

function buildDisplayCategories(player: PublicPlayerView | null): PublicCategorySlot[] {
  if (!player) return [];
  const map = new Map<string, PublicCategorySlot>();
  for (const category of player.categories) {
    const label = normalizeCategoryLabel(category.category);
    const key = norm(label);
    if (!map.has(key)) {
      map.set(key, { ...category, category: label });
    }
  }

  return CATEGORY_ORDER.map((label) => {
    const hit = map.get(norm(label));
    if (hit) return hit;
    return {
      category: label,
      status: "hidden" as const,
      cards: [],
    };
  });
}

function buildWorldFromOverlayState(state: {
  top?: {
    bunker?: {
      revealed?: number;
      total?: number;
      items?: Array<{ title?: string; subtitle?: string; imageId?: string }>;
    };
    threats?: {
      revealed?: number;
      total?: number;
      items?: Array<{ title?: string; subtitle?: string; imageId?: string }>;
    };
    catastrophe?: { title?: string; text?: string; imageId?: string };
  };
}): WorldState30 {
  const bunkerTotal = Math.max(0, Number(state.top?.bunker?.total ?? 0));
  const bunkerRevealed = Math.max(0, Math.min(bunkerTotal, Number(state.top?.bunker?.revealed ?? 0)));
  const threatsTotal = Math.max(0, Number(state.top?.threats?.total ?? 0));
  const threatsRevealed = Math.max(0, Math.min(threatsTotal, Number(state.top?.threats?.revealed ?? 0)));
  const bunkerItems = Array.isArray(state.top?.bunker?.items) ? state.top?.bunker?.items : [];
  const threatItems = Array.isArray(state.top?.threats?.items) ? state.top?.threats?.items : [];
  const catastropheTitle = String(state.top?.catastrophe?.title ?? "").trim() || "Катастрофа";
  const catastropheText = String(state.top?.catastrophe?.text ?? "").trim();

  return {
    disaster: {
      kind: "disaster",
      id: "overlay-disaster",
      title: catastropheTitle,
      description: catastropheText || catastropheTitle,
      text: catastropheText,
      imageId: state.top?.catastrophe?.imageId,
    },
    bunker: Array.from({ length: bunkerTotal }, (_, index) => ({
      kind: "bunker",
      id: `overlay-bunker-${index + 1}`,
      title:
        index < bunkerRevealed
          ? String(bunkerItems[index]?.title ?? "").trim() || `Бункер #${index + 1}`
          : `Бункер #${index + 1}`,
      description: index < bunkerRevealed ? String(bunkerItems[index]?.subtitle ?? "").trim() : "",
      imageId: index < bunkerRevealed ? bunkerItems[index]?.imageId : undefined,
      isRevealed: index < bunkerRevealed,
    })),
    threats: Array.from({ length: threatsTotal }, (_, index) => ({
      kind: "threat",
      id: `overlay-threat-${index + 1}`,
      title:
        index < threatsRevealed
          ? String(threatItems[index]?.title ?? "").trim() || `Угроза #${index + 1}`
          : `Угроза #${index + 1}`,
      description: index < threatsRevealed ? String(threatItems[index]?.subtitle ?? "").trim() : "",
      imageId: index < threatsRevealed ? threatItems[index]?.imageId : undefined,
      isRevealed: index < threatsRevealed,
    })),
    counts: {
      bunker: bunkerTotal,
      threats: threatsTotal,
    },
  };
}

function SpectatorCategoryCard({ category, hiddenLabel }: { category: PublicCategorySlot; hiddenLabel: string }) {
  const isRevealed = shouldShowCardFront(
    {
      status: category.status,
      revealed: category.status === "revealed",
      faceUp: category.status === "revealed",
    },
    { mode: "spectator" }
  );
  const card = category.cards[0] as ReadOnlyCard | undefined;
  const frontLabel = String(card?.labelShort ?? category.category).trim() || category.category;
  const faceSrc = getCardFaceUrl(card?.imgUrl);
  const backSrc = getCardBackUrl(normalizeCategoryLabel(category.category)) || getCardBackUrl("Факты");

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
      <div className="card-tile" title={category.category}>
        <img src={backSrc} alt={category.category} loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div className="card-tile fallback" title={category.category}>
      <span>{hiddenLabel}</span>
    </div>
  );
}

function SpectatorWorldCardTile({
  revealed,
  imageId,
  label,
  backDeck,
}: {
  revealed: boolean;
  imageId?: string;
  label: string;
  backDeck?: string;
}) {
  const frontVisible = shouldShowCardFront(
    {
      isRevealed: revealed,
      frontId: imageId,
    },
    { mode: "spectator" }
  );
  const faceSrc = frontVisible ? getCardFaceUrl(imageId) : undefined;
  const backSrc = backDeck ? getCardBackUrl(backDeck) : undefined;

  if (faceSrc) {
    return (
      <div className="card-tile" title={label}>
        <img src={faceSrc} alt={label} loading="lazy" decoding="async" />
      </div>
    );
  }

  if (frontVisible) {
    return (
      <div className="card-tile fallback" title={label}>
        <span>{label}</span>
      </div>
    );
  }

  if (backSrc) {
    return (
      <div className="card-tile" title={label}>
        <img src={backSrc} alt={label} loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div className="card-tile fallback" title={label}>
      <span>{label}</span>
    </div>
  );
}

export default function SpectatorTablePage() {
  const [viewSrc, setViewSrc] = useState<string | null>(() =>
    typeof window === "undefined" ? null : parseViewSrcFromHash(window.location.hash)
  );
  const { state, status, error } = useViewState(viewSrc);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [worldDetail, setWorldDetail] = useState<{
    title: string;
    imageUrl?: string;
    label: string;
    kind: string;
  } | null>(null);

  useEffect(() => {
    const onHashChange = () => setViewSrc(parseViewSrcFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const publicPlayers = useMemo<PublicPlayerView[]>(
    () => (state?.players ?? []).map(overlayPlayerToPublic),
    [state?.players]
  );

  useEffect(() => {
    if (publicPlayers.length === 0) {
      setSelectedPlayerId(null);
      return;
    }
    if (!selectedPlayerId || !publicPlayers.some((player) => player.playerId === selectedPlayerId)) {
      setSelectedPlayerId(publicPlayers[0].playerId);
    }
  }, [publicPlayers, selectedPlayerId]);

  const selectedPlayer = useMemo(
    () => publicPlayers.find((player) => player.playerId === selectedPlayerId) ?? null,
    [publicPlayers, selectedPlayerId]
  );
  const selectedCategories = useMemo(() => buildDisplayCategories(selectedPlayer), [selectedPlayer]);

  const world = useMemo(() => (state ? buildWorldFromOverlayState(state) : undefined), [state]);
  const threatCount = world?.counts.threats;
  const getWorldImage = (imageId?: string) => (imageId ? getCardFaceUrl(imageId) : undefined);

  const connectionLabel =
    status === "connected"
      ? ru.statusOnline
      : status === "reconnecting"
        ? ru.statusReconnecting
        : status === "connecting"
          ? "Connecting"
          : ru.statusOffline;

  if (!viewSrc) {
    return (
      <div className="spectateTablePage">
        <section className="panel game-loading">
          <h3>{ru.spectatorLinkTitle}</h3>
          <div className="muted">Invalid spectator URL.</div>
          <div className="spectatorMissingActions">
            <Link to="/" className="ghost button-small">
              {ru.exitButton}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="spectateTablePage">
      <section className="panel spectateBoardPanel">
        <div className="spectateMain">
          <div className="spectateCenter">
            <div className="panel-header spectateBoardHeader">
              <div>
                <h3>{ru.boardTitle}</h3>
                <div className="muted">{ru.boardSubtitle}</div>
              </div>
              <div className="spectateInlineMeta muted">Status: {connectionLabel} • Players: {publicPlayers.length}</div>
            </div>
            {error ? <div className="spectateInlineError">{error}</div> : null}
            <div className="spectateTableContainer">
              <TableLayout
                players={publicPlayers}
                youId={null}
                selectedId={selectedPlayerId}
                onSelect={setSelectedPlayerId}
                world={world}
                worldThreatsTotal={threatCount}
                onWorldClick={() => setWorldModalOpen(true)}
              />
            </div>
          </div>
          <aside className="selected-panel spectator-selected-panel">
            <div className="selected-header">
              <div className="panel-subtitle">{ru.selectedPlayerTitle}</div>
              {selectedPlayer ? <div className="selected-name">{selectedPlayer.name}</div> : null}
            </div>
            {selectedPlayer ? (
              <div className="spectatorSelectedGrid">
                {selectedCategories.map((category) => (
                  <SpectatorCategoryCard
                    key={`${selectedPlayer.playerId}-${category.category}`}
                    category={category}
                    hiddenLabel={ru.cardHidden}
                  />
                ))}
              </div>
            ) : (
              <div className="selected-empty muted">{ru.selectedPlayerHint}</div>
            )}
          </aside>
        </div>
      </section>

      <Modal
        open={Boolean(world) && worldModalOpen}
        title="Карты мира"
        onClose={() => {
          setWorldModalOpen(false);
          setWorldDetail(null);
        }}
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
                  const label = `Бункер #${index + 1}`;
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
                          kind: "Бункер",
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
                            kind: "Бункер",
                            title: card.title || label,
                            imageUrl: faceUrl,
                            label,
                          });
                        }
                      }}
                    >
                      <div className="world-slot-header">Бункер</div>
                      <div className="world-slot-media">
                        <SpectatorWorldCardTile
                          revealed={revealed}
                          imageId={imageId}
                          label={revealed ? card.title || label : label}
                          backDeck="Бункер"
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
                      kind: "Катастрофа",
                      title: world.disaster.title,
                      imageUrl: getWorldImage((world.disaster as { imageId?: string }).imageId),
                      label: "Катастрофа",
                    })
                  }
                  role="button"
                  tabIndex={0}
                >
                  <SpectatorWorldCardTile
                    revealed={true}
                    imageId={(world.disaster as { imageId?: string }).imageId}
                    label={world.disaster.title || "Катастрофа"}
                    backDeck="Катастрофа"
                  />
                </div>
              </div>

              <div
                className="world-column world-column-right world-column-grid"
                style={{ "--card-rows": Math.max(1, Math.ceil(world.threats.length / 2)) } as CSSProperties}
              >
                {world.threats.map((card, index) => {
                  const isSoloLast = world.threats.length % 2 === 1 && index === world.threats.length - 1;
                  const label = `Угроза #${index + 1}`;
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
                          kind: "Угроза",
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
                            kind: "Угроза",
                            title: card.title || label,
                            imageUrl: faceUrl,
                            label,
                          });
                        }
                      }}
                    >
                      <div className="world-slot-header">Угроза</div>
                      <div className="world-slot-media">
                        <SpectatorWorldCardTile
                          revealed={revealed}
                          imageId={imageId}
                          label={revealed ? card.title || label : label}
                          backDeck="Угроза"
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
                      <button className="icon-button" onClick={() => setWorldDetail(null)} aria-label="Закрыть">
                        ×
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
          <div className="muted">Условия мира не загружены.</div>
        )}
      </Modal>
    </div>
  );
}
