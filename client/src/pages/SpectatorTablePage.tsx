import { useEffect, useMemo, useState } from "react";
import { LINK_PATHS, type OverlayPlayerView, type PublicCategorySlot, type PublicPlayerView, type WorldState30 } from "@bunker/shared";
import { Link } from "react-router-dom";
import TableLayout from "../components/TableLayout";
import { getCardFaceUrl } from "../cards";
import { useUiLocaleNamespace, useUiLocaleNamespacesActivation } from "../localization";
import { useViewState } from "../hooks/useViewState";
import { API_BASE } from "../config";
import { SpectatorSelectedPanel } from "../spectator/SpectatorSelectedPanel";
import { type SpectatorCategoryKey } from "../spectator/SpectatorCategoryCard";
import { SpectatorWorldModal } from "../spectator/SpectatorWorldModal";

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

interface SpectatorInviteExchangePayload {
  ok: true;
  roomCode: string;
  viewUrlLan: string;
  viewUrlExternal: string | null;
}

interface SpectatorViewCandidates {
  primary: string;
  fallback?: string;
}

function encodeBase64UrlUtf8(value: string): string {
  try {
    const utf8 = encodeURIComponent(value).replace(
      /%([0-9A-F]{2})/g,
      (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))
    );
    return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

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

function parseSpectatorInviteFromSearch(search: string): { roomCode: string; inviteToken: string } | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const roomCode = String(params.get("room") ?? params.get("roomCode") ?? "")
    .trim()
    .toUpperCase();
  const inviteToken = String(params.get("invite") ?? "").trim();
  if (!roomCode || !inviteToken) return null;
  return { roomCode, inviteToken };
}

function sameOrigin(urlValue: string, originValue: string): boolean {
  try {
    return new URL(urlValue).origin === new URL(originValue).origin;
  } catch {
    return false;
  }
}

function resolveSpectatorViewCandidates(
  payload: SpectatorInviteExchangePayload,
  runtimeOrigin: string
): SpectatorViewCandidates | null {
  const lan = String(payload.viewUrlLan ?? "").trim();
  const external = String(payload.viewUrlExternal ?? "").trim();

  if (!lan && !external) return null;
  if (lan && !external) return { primary: lan };
  if (!lan && external) return { primary: external };

  if (sameOrigin(lan, runtimeOrigin)) {
    return { primary: lan, fallback: external };
  }
  if (sameOrigin(external, runtimeOrigin)) {
    return { primary: external, fallback: lan };
  }

  // In ambiguous cases prefer LAN first to avoid external-only reconnect loops.
  return { primary: lan, fallback: external };
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

export default function SpectatorTablePage() {
  useUiLocaleNamespacesActivation(["game", "common", "world", "reconnect", "overlay-links", "format", "misc"]);
  const spectatorText = useUiLocaleNamespace("world", {
    fallbacks: ["game", "common", "reconnect", "overlay-links", "format", "misc"],
  });
  const [viewSrc, setViewSrc] = useState<string | null>(() =>
    typeof window === "undefined" ? null : parseViewSrcFromHash(window.location.hash)
  );
  const [inviteResolveError, setInviteResolveError] = useState<string | null>(null);
  const [inviteFallbackViewSrc, setInviteFallbackViewSrc] = useState<string | null>(null);
  const [inviteFallbackAttempted, setInviteFallbackAttempted] = useState(false);
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
    const onHashChange = () => {
      setViewSrc(parseViewSrcFromHash(window.location.hash));
      setInviteResolveError(null);
      setInviteFallbackViewSrc(null);
      setInviteFallbackAttempted(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (viewSrc) return;

    const invite = parseSpectatorInviteFromSearch(window.location.search);
    if (!invite) return;

    let disposed = false;
    const resolveInvite = async () => {
      try {
        const response = await fetch(`${API_BASE}${LINK_PATHS.spectatorInviteExchange}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ roomCode: invite.roomCode, inviteToken: invite.inviteToken }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          const message =
            payload && typeof payload.message === "string"
              ? payload.message
              : spectatorText.t("spectatorInvalidUrl");
          throw new Error(message);
        }

        const raw = payload as SpectatorInviteExchangePayload;
        const candidates = resolveSpectatorViewCandidates(raw, window.location.origin);
        if (!candidates?.primary) {
          throw new Error(spectatorText.t("spectatorInvalidUrl"));
        }

        const encoded = encodeBase64UrlUtf8(candidates.primary);
        if (encoded) {
          window.history.replaceState(null, "", `${window.location.pathname}#v=${encoded}`);
        }

        if (disposed) return;
        setInviteResolveError(null);
        setInviteFallbackViewSrc(candidates.fallback ?? null);
        setInviteFallbackAttempted(false);
        setViewSrc(candidates.primary);
      } catch (error) {
        if (disposed) return;
        setInviteResolveError(error instanceof Error ? error.message : spectatorText.t("spectatorInvalidUrl"));
      }
    };

    void resolveInvite();
    return () => {
      disposed = true;
    };
  }, [viewSrc, spectatorText.locale]);

  useEffect(() => {
    if (!inviteFallbackViewSrc || inviteFallbackAttempted) return;
    if (status === "connected") {
      setInviteFallbackViewSrc(null);
      return;
    }
    if (status !== "reconnecting" && status !== "error") return;

    const timer = window.setTimeout(() => {
      setInviteFallbackAttempted(true);
      const encoded = encodeBase64UrlUtf8(inviteFallbackViewSrc);
      if (encoded) {
        window.history.replaceState(null, "", `${window.location.pathname}#v=${encoded}`);
      }
      setViewSrc(inviteFallbackViewSrc);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [inviteFallbackViewSrc, inviteFallbackAttempted, status]);

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
    const deniedMessage = inviteResolveError || spectatorLocale.spectatorInvalidUrl;
    return (
      <div className="spectateTablePage">
        <section className="panel game-loading forbiddenStatePanel">
          <div className="forbiddenStateCard">
            <div className="forbiddenStateEyebrow">{spectatorLocale.spectatorLinkTitle}</div>
            <h3 className="forbiddenStateTitle">{deniedMessage}</h3>
            <div className="forbiddenStateActions">
              <Link to="/" className="forbiddenStateButton">
                {spectatorLocale.exitButton}
              </Link>
            </div>
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
          <SpectatorSelectedPanel
            selectedPlayer={selectedPlayer}
            selectedCategories={selectedCategories}
            selectedPlayerTitle={spectatorLocale.selectedPlayerTitle}
            selectedPlayerHint={spectatorLocale.selectedPlayerHint}
            cardHidden={spectatorLocale.cardHidden}
            cardLocale={cardLocale}
            categoryLabels={categoryLabels}
            normalizeCategoryKey={normalizeCategoryKey}
            categoryLabel={categoryLabel}
          />
        </div>
      </section>
      <SpectatorWorldModal
        open={Boolean(world) && worldModalOpen}
        world={world}
        cardLocale={cardLocale}
        text={{
          worldModalTitle: spectatorLocale.worldModalTitle,
          worldNotLoaded: spectatorLocale.worldNotLoaded,
          worldKindBunker: spectatorLocale.worldKindBunker,
          worldKindDisaster: spectatorLocale.worldKindDisaster,
          worldKindThreat: spectatorLocale.worldKindThreat,
          worldBunkerCard: spectatorLocale.worldBunkerCard,
          worldThreatCard: spectatorLocale.worldThreatCard,
          closeButton: spectatorLocale.closeButton,
        }}
        worldDetail={worldDetail}
        setWorldDetail={setWorldDetail}
        getWorldImage={getWorldImage}
        onClose={() => {
          setWorldModalOpen(false);
          setWorldDetail(null);
        }}
      />
    </div>
  );
}



