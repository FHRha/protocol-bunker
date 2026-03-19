import { type CSSProperties, useEffect, useMemo, useState } from "react";
import type { OverlayPlayerView, PublicCategorySlot, PublicPlayerView, WorldState30 } from "@bunker/shared";
import { Link } from "react-router-dom";
import TableLayout from "../components/TableLayout";
import Modal from "../components/Modal";
import { getCardBackUrl, getCardFaceUrl } from "../cards";
import { shouldShowCardFront } from "../game/cardFacePolicy";
import { useUiLocaleNamespace, useUiLocaleNamespacesActivation } from "../localization";
import { useViewState } from "../hooks/useViewState";

type SpectatorCategoryKey =
  | "profession"
  | "health"
  | "hobby"
  | "baggage"
  | "fact1"
  | "fact2"
  | "biology"
  | "special";

const CATEGORY_ORDER_KEYS: SpectatorCategoryKey[] = [
  "profession",
  "health",
  "hobby",
  "baggage",
  "fact1",
  "fact2",
  "biology",
  "special",
];

const CATEGORY_SYNONYMS: Record<SpectatorCategoryKey, string[]> = {
  profession: ["profession", "профессия", "prof"],
  health: ["health", "здоровье", "hp"],
  hobby: ["hobby", "хобби"],
  baggage: ["baggage", "багаж", "bag"],
  fact1: ["fact1", "facts1", "facts", "fact #1", "fact n1", "факт 1", "факт №1", "факты", "fact1"],
  fact2: ["fact2", "facts2", "fact #2", "fact n2", "факт 2", "факт №2"],
  biology: ["biology", "биология", "bio"],
  special: ["special", "special conditions", "особые условия", "особое условие", "спецусловие", "specialconditions"],
};

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

function normalizeCategoryKey(value: string): SpectatorCategoryKey | null {
  const key = String(value ?? "").trim().toLowerCase();
  if (!key) return null;
  for (const [categoryKey, aliases] of Object.entries(CATEGORY_SYNONYMS) as Array<
    [SpectatorCategoryKey, string[]]
  >) {
    if (aliases.some((alias) => alias.toLowerCase() === key)) {
      return categoryKey;
    }
  }
  return null;
}

function categoryLabel(key: SpectatorCategoryKey, categoryLabels: Record<SpectatorCategoryKey, string>): string {
  return categoryLabels[key] ?? key;
}

function safeName(player: OverlayPlayerView, index: number, playerFallbackLabel: (index: number) => string): string {
  const name = String(player.nickname ?? "").trim();
  return name || playerFallbackLabel(index + 1);
}

function overlayPlayerToPublic(player: OverlayPlayerView, index: number, playerFallbackLabel: (index: number) => string): PublicPlayerView {
  const categories: PublicCategorySlot[] = (player.categories ?? []).map((category) => {
    const categoryKey = normalizeCategoryKey(category.key || category.label || "") ?? "special";
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
      category: categoryKey,
      status: category.revealed ? "revealed" : "hidden",
      cards,
    };
  });
  const revealedCount = categories.filter((entry) => entry.status === "revealed").length;

  return {
    playerId: player.id,
    name: safeName(player, index, playerFallbackLabel),
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
  const map = new Map<SpectatorCategoryKey, PublicCategorySlot>();
  for (const category of player.categories) {
    const key = normalizeCategoryKey(category.category);
    if (key && !map.has(key)) {
      map.set(key, { ...category, category: key });
    }
  }

  return CATEGORY_ORDER_KEYS.map((key) => {
    const hit = map.get(key);
    if (hit) return hit;
    return {
      category: key,
      status: "hidden" as const,
      cards: [],
    };
  });
}

function buildWorldFromOverlayState(
  state: {
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
  },
  labels: {
    worldKindDisaster: string;
    worldBunkerCard: (index: number) => string;
    worldThreatCard: (index: number) => string;
  },
): WorldState30 {
  const bunkerTotal = Math.max(0, Number(state.top?.bunker?.total ?? 0));
  const bunkerRevealed = Math.max(0, Math.min(bunkerTotal, Number(state.top?.bunker?.revealed ?? 0)));
  const threatsTotal = Math.max(0, Number(state.top?.threats?.total ?? 0));
  const threatsRevealed = Math.max(0, Math.min(threatsTotal, Number(state.top?.threats?.revealed ?? 0)));
  const bunkerItems = Array.isArray(state.top?.bunker?.items) ? state.top?.bunker?.items : [];
  const threatItems = Array.isArray(state.top?.threats?.items) ? state.top?.threats?.items : [];
  const catastropheTitle = String(state.top?.catastrophe?.title ?? "").trim() || labels.worldKindDisaster;
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
          ? String(bunkerItems[index]?.title ?? "").trim() || labels.worldBunkerCard(index + 1)
          : labels.worldBunkerCard(index + 1),
      description: index < bunkerRevealed ? String(bunkerItems[index]?.subtitle ?? "").trim() : "",
      imageId: index < bunkerRevealed ? bunkerItems[index]?.imageId : undefined,
      isRevealed: index < bunkerRevealed,
    })),
    threats: Array.from({ length: threatsTotal }, (_, index) => ({
      kind: "threat",
      id: `overlay-threat-${index + 1}`,
      title:
        index < threatsRevealed
          ? String(threatItems[index]?.title ?? "").trim() || labels.worldThreatCard(index + 1)
          : labels.worldThreatCard(index + 1),
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

function SpectatorCategoryCard({ category, hiddenLabel, cardLocale, categoryLabels }: { category: PublicCategorySlot; hiddenLabel: string; cardLocale: "ru" | "en"; categoryLabels?: Record<SpectatorCategoryKey, string> }) {
  const categoryKey = normalizeCategoryKey(category.category) ?? "special";
  const categoryTitle = categoryLabels?.[categoryKey] ?? categoryLabel(categoryKey, categoryLabels ?? { profession: "profession", health: "health", hobby: "hobby", baggage: "baggage", fact1: "fact1", fact2: "fact2", biology: "biology", special: "special" });
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

function SpectatorWorldCardTile({
  revealed,
  imageId,
  label,
  backDeck,
  cardLocale,
}: {
  revealed: boolean;
  imageId?: string;
  label: string;
  backDeck?: string;
  cardLocale: "ru" | "en";
}) {
  const frontVisible = shouldShowCardFront(
    {
      isRevealed: revealed,
      frontId: imageId,
    },
    { mode: "spectator" }
  );
  const faceSrc = frontVisible ? getCardFaceUrl(imageId) : undefined;
  const backSrc = backDeck ? getCardBackUrl(backDeck, cardLocale) : undefined;

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
  useUiLocaleNamespacesActivation(["game", "common", "world", "reconnect", "overlay-links", "format", "misc"]);
  const spectatorText = useUiLocaleNamespace("world", {
    fallbacks: ["game", "common", "reconnect", "overlay-links", "format", "misc"],
  });
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
  const cardLocale = state?.locale ?? "ru";

  useEffect(() => {
    const onHashChange = () => setViewSrc(parseViewSrcFromHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const spectatorLocale = useMemo(() => ({
    playerFallback: (index: number) => spectatorText.t("playerFallback", { index }),
    categoryProfession: spectatorText.t("categoryProfession"),
    categoryHealth: spectatorText.t("categoryHealth"),
    categoryHobby: spectatorText.t("categoryHobby"),
    categoryBaggage: spectatorText.t("categoryBaggage"),
    categoryFact1: spectatorText.t("categoryFact1"),
    categoryFact2: spectatorText.t("categoryFact2"),
    categoryBiology: spectatorText.t("categoryBiology"),
    categorySpecial: spectatorText.t("categorySpecial"),
    worldKindDisaster: spectatorText.t("worldKindDisaster"),
    worldKindBunker: spectatorText.t("worldKindBunker"),
    worldKindThreat: spectatorText.t("worldKindThreat"),
    worldBunkerCard: (index: number) => spectatorText.t("worldBunkerCard", { index }),
    worldThreatCard: (index: number) => spectatorText.t("worldThreatCard", { index }),
    statusOnline: spectatorText.t("statusOnline"),
    statusReconnecting: spectatorText.t("statusReconnecting"),
    statusConnecting: spectatorText.t("statusConnecting"),
    statusOffline: spectatorText.t("statusOffline"),
    spectatorLinkTitle: spectatorText.t("spectatorLinkTitle"),
    spectatorInvalidUrl: spectatorText.t("spectatorInvalidUrl"),
    exitButton: spectatorText.t("exitButton"),
    boardTitle: spectatorText.t("boardTitle"),
    boardSubtitle: spectatorText.t("boardSubtitle"),
    spectatorInlineMeta: (status: string, players: number) => spectatorText.t("spectatorInlineMeta", { status, players }),
    selectedPlayerTitle: spectatorText.t("selectedPlayerTitle"),
    cardHidden: spectatorText.t("cardHidden"),
    selectedPlayerHint: spectatorText.t("selectedPlayerHint"),
    worldModalTitle: spectatorText.t("worldModalTitle"),
    closeButton: spectatorText.t("closeButton"),
    worldNotLoaded: spectatorText.t("worldNotLoaded"),
  }), [spectatorText]);

  const playerFallbackLabel = spectatorLocale.playerFallback;

  const categoryLabels = useMemo<Record<SpectatorCategoryKey, string>>(() => ({
    profession: spectatorText.t("categoryProfession"),
    health: spectatorText.t("categoryHealth"),
    hobby: spectatorText.t("categoryHobby"),
    baggage: spectatorText.t("categoryBaggage"),
    fact1: spectatorText.t("categoryFact1"),
    fact2: spectatorText.t("categoryFact2"),
    biology: spectatorText.t("categoryBiology"),
    special: spectatorText.t("categorySpecial"),
  }), [spectatorText]);

  const publicPlayers = useMemo<PublicPlayerView[]>(
    () => (state?.players ?? []).map((player, index) => overlayPlayerToPublic(player, index, playerFallbackLabel)),
    [state?.players, spectatorText.locale]
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

  const world = useMemo(() => (state ? buildWorldFromOverlayState(state, {
    worldKindDisaster: spectatorLocale.worldKindDisaster,
    worldBunkerCard: (index: number) => spectatorText.t("worldBunkerCard", { index }),
    worldThreatCard: (index: number) => spectatorText.t("worldThreatCard", { index }),
  }) : undefined), [state, spectatorText.locale]);
  const threatCount = world?.counts.threats;
  const getWorldImage = (imageId?: string) => (imageId ? getCardFaceUrl(imageId) : undefined);

  const connectionLabel =
    status === "connected"
      ? spectatorLocale.statusOnline
      : status === "reconnecting"
        ? spectatorLocale.statusReconnecting
        : status === "connecting"
          ? spectatorLocale.statusConnecting
          : spectatorLocale.statusOffline;

  if (!viewSrc) {
    return (
      <div className="spectateTablePage">
        <section className="panel game-loading">
          <h3>{spectatorLocale.spectatorLinkTitle}</h3>
          <div className="muted">{spectatorLocale.spectatorInvalidUrl}</div>
          <div className="spectatorMissingActions">
            <Link to="/" className="ghost button-small">
              {spectatorLocale.exitButton}
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
                <h3>{spectatorLocale.boardTitle}</h3>
                <div className="muted">{spectatorLocale.boardSubtitle}</div>
              </div>
              <div className="spectateInlineMeta muted">
                {spectatorLocale.spectatorInlineMeta(connectionLabel, publicPlayers.length)}
              </div>
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
              <div className="panel-subtitle">{spectatorLocale.selectedPlayerTitle}</div>
              {selectedPlayer ? <div className="selected-name">{selectedPlayer.name}</div> : null}
            </div>
            {selectedPlayer ? (
              <div className="spectatorSelectedGrid">
                {selectedCategories.map((category) => (
                  <SpectatorCategoryCard
                    key={`${selectedPlayer.playerId}-${category.category}`}
                    category={category}
                    hiddenLabel={spectatorLocale.cardHidden}
                    cardLocale={cardLocale}
                    categoryLabels={categoryLabels}
                  />
                ))}
              </div>
            ) : (
              <div className="selected-empty muted">{spectatorLocale.selectedPlayerHint}</div>
            )}
          </aside>
        </div>
      </section>

      <Modal
        open={Boolean(world) && worldModalOpen}
        title={spectatorLocale.worldModalTitle}
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
                  const label = spectatorLocale.worldBunkerCard(index + 1);
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
                          kind: spectatorLocale.worldKindBunker,
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
                            kind: spectatorLocale.worldKindBunker,
                            title: card.title || label,
                            imageUrl: faceUrl,
                            label,
                          });
                        }
                      }}
                    >
                      <div className="world-slot-header">{spectatorLocale.worldKindBunker}</div>
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
                      kind: spectatorLocale.worldKindDisaster,
                      title: world.disaster.title,
                      imageUrl: getWorldImage((world.disaster as { imageId?: string }).imageId),
                      label: spectatorLocale.worldKindDisaster,
                    })
                  }
                  role="button"
                  tabIndex={0}
                >
                  <SpectatorWorldCardTile
                    revealed={true}
                    imageId={(world.disaster as { imageId?: string }).imageId}
                    label={world.disaster.title || spectatorLocale.worldKindDisaster}
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
                  const label = spectatorLocale.worldThreatCard(index + 1);
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
                          kind: spectatorLocale.worldKindThreat,
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
                            kind: spectatorLocale.worldKindThreat,
                            title: card.title || label,
                            imageUrl: faceUrl,
                            label,
                          });
                        }
                      }}
                    >
                      <div className="world-slot-header">{spectatorLocale.worldKindThreat}</div>
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
                      <button className="icon-button" onClick={() => setWorldDetail(null)} aria-label={spectatorLocale.closeButton}>
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
          <div className="muted">{spectatorLocale.worldNotLoaded}</div>
        )}
      </Modal>
    </div>
  );
}

