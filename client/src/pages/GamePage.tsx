import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent, GameView, RoomState, SpecialConditionInstance, SpecialTargetScope } from "@bunker/shared";
import { computeNeighbors, getTargetCandidates } from "@bunker/shared";
import { ru } from "../i18n/ru";
import Modal from "../components/Modal";
import TableLayout from "../components/TableLayout";
import DossierMiniCard from "../components/DossierMiniCard";
import { getCardBackUrl, getCardFaceUrl, preloadCategoryBacks } from "../cards";

interface GamePageProps {
  roomState: RoomState | null;
  gameView: GameView | null;
  isControl: boolean;
  presenterModeEnabled: boolean;
  wsInteractive: boolean;
  eventLog: GameEvent[];
  onRevealCard: (cardId: string) => void;
  onVote: (targetPlayerId: string) => void;
  onApplySpecial: (specialInstanceId: string, payload?: Record<string, unknown>) => void;
  onFinalizeVoting: () => void;
  onContinueRound: () => void;
  onRevealWorldThreat: (index: number) => void;
  onSetBunkerOutcome: (outcome: "survived" | "failed") => void;
  onDevAddPlayer: (name?: string) => void;
  onDevRemovePlayer: (targetPlayerId?: string) => void;
  onExitGame: () => void;
  mobileDossierError?: string | null;
  onMarkDossierSpecialAction?: () => void;
  onClearMobileDossierError?: () => void;
}

type SpecialDialogKind = "none" | "player" | "neighbor" | "category" | "bunker" | "baggage" | "special";

interface SpecialDialogCardPicker {
  categoryKey: string;
  requireSourceCard?: boolean;
}

interface SpecialDialogState {
  kind: SpecialDialogKind;
  specialInstanceId: string;
  title: string;
  options: Array<{ id: string; label: string }>;
  description?: string;
  cardPicker?: SpecialDialogCardPicker;
}

const CATEGORY_KEY_TO_RU: Record<string, string> = {
  profession: "Профессия",
  health: "Здоровье",
  hobby: "Хобби",
  baggage: "Багаж",
  facts: "Факты",
  facts1: "Факт №1",
  facts2: "Факт №2",
  biology: "Биология",
};
const CATEGORY_OPTIONS = [
  "profession",
  "health",
  "hobby",
  "baggage",
  "facts1",
  "facts2",
  "biology",
].map((id) => ({ id, label: CATEGORY_KEY_TO_RU[id] ?? id }));

const CATEGORY_KEY_TO_LABELS: Record<string, string[]> = {
  profession: ["Профессия"],
  health: ["Здоровье"],
  hobby: ["Хобби"],
  baggage: ["Багаж"],
  facts: ["Факт №1", "Факт №2"],
  facts1: ["Факт №1"],
  facts2: ["Факт №2"],
  biology: ["Биология"],
};

const PUBLIC_CATEGORY_ORDER = [
  "Профессия",
  "Здоровье",
  "Хобби",
  "Багаж",
  "Факт №1",
  "Факт №2",
  "Биология",
  "Особые условия",
];

const DOSSIER_MAIN_CATEGORY = "Профессия";
const DOSSIER_GRID_ROWS: string[][] = [
  ["Здоровье", "Биология"],
  ["Багаж", "Хобби"],
  ["Факт №1", "Факт №2"],
];

const VOTING_ONLY_EFFECTS = new Set([
  "banVoteAgainst",
  "disableVote",
  "voteWeight",
  "forceRevote",
  "doubleVotesAgainst_and_disableSelfVote",
]);

const REVEAL_ONLY_EFFECTS = new Set(["forceRevealCategoryForAll", "setRoundRule"]);

function formatPlayerNameShort(name: string, maxLen = 14): string {
  const normalized = (name ?? "").trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1)}…`;
}


interface CardTileProps {
  src?: string;
  fallback: string;
  overlayLabel?: string;
}

function CardTile({ src, fallback, overlayLabel }: CardTileProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="card-tile fallback">
        <span>{fallback}</span>
      </div>
    );
  }

  return (
    <div className="card-tile">
      <img
        src={src}
        alt={overlayLabel ?? fallback}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {overlayLabel ? <span className="card-tile-label">{overlayLabel}</span> : null}
    </div>
  );
}

export default function GamePage({
  roomState,
  gameView,
  isControl,
  presenterModeEnabled,
  wsInteractive,
  eventLog,
  onRevealCard,
  onVote,
  onApplySpecial,
  onFinalizeVoting,
  onContinueRound,
  onRevealWorldThreat,
  onSetBunkerOutcome,
  onDevAddPlayer,
  onDevRemovePlayer,
  onExitGame,
  mobileDossierError,
  onMarkDossierSpecialAction,
  onClearMobileDossierError,
}: GamePageProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [voteTargetId, setVoteTargetId] = useState<string | null>(null);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [autoVoteRound, setAutoVoteRound] = useState<number | null>(null);
  const [specialDialog, setSpecialDialog] = useState<SpecialDialogState | null>(null);
  const [dialogSelection, setDialogSelection] = useState<string>("");
  const [dialogTargetCardSelection, setDialogTargetCardSelection] = useState<string>("");
  const [dialogSourceCardSelection, setDialogSourceCardSelection] = useState<string>("");
  const [devRemoveTargetId, setDevRemoveTargetId] = useState<string>("");
  const [devChecks, setDevChecks] = useState<
    Array<{ id: string; label: string; status: "pass" | "fail"; detail?: string }>
  >([]);
  const [now, setNow] = useState(() => Date.now());
  const [worldModalOpen, setWorldModalOpen] = useState(false);
  const [worldDetail, setWorldDetail] = useState<{
    title: string;
    description?: string;
    imageUrl?: string;
    label: string;
    kind: string;
  } | null>(null);
  const [expandedDossierKey, setExpandedDossierKey] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1250px)").matches : false
  );
  const [isMobileNarrow, setIsMobileNarrow] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 600px)").matches : false
  );
  const [dossierOpen, setDossierOpen] = useState(false);
  const [mobileDeckModal, setMobileDeckModal] = useState<"bunker" | "disaster" | "threat" | null>(null);
  const [mobileWorldBanner, setMobileWorldBanner] = useState<
    | {
        key: string;
        kind: "bunker" | "threat";
        message: string;
        cta: string;
      }
    | null
  >(null);
  const [specialActionLock, setSpecialActionLock] = useState(false);
  const specialDialogRef = useRef<SpecialDialogState | null>(null);
  const specialActionLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileActionBarRef = useRef<HTMLDivElement | null>(null);
  const lastWorldEventRef = useRef<string | null>(null);
  const lastPostGameRef = useRef<number | null>(null);

  const you = gameView?.you;
  const publicPlayers = gameView?.public.players ?? [];
  const world = gameView?.world;
  const worldEvent = gameView?.worldEvent;
  const postGame = gameView?.postGame;
  const youStatus = publicPlayers.find((player) => player.playerId === you?.playerId)?.status ?? "alive";
  const youRevealedThisRound =
    gameView?.public.revealedThisRound.includes(you?.playerId ?? "") ?? false;
  const phase = gameView?.phase ?? "reveal";
  const votePhase = gameView?.public.votePhase ?? null;
  const votesPublic = gameView?.public.votesPublic ?? [];
  const votingProgress = gameView?.public.votingProgress;
  const disallowedVoteTargetIdsForYou = gameView?.public.disallowedVoteTargetIdsForYou ?? [];
  const disallowedVoteTargetSet = useMemo(
    () => new Set(disallowedVoteTargetIdsForYou),
    [disallowedVoteTargetIdsForYou]
  );
  const voteModalOpenFlag = gameView?.public.voteModalOpen ?? false;
  const activeTimer = gameView?.public.activeTimer ?? null;
  const isHost = roomState?.hostId === you?.playerId;
  const useOverlayControl = Boolean(presenterModeEnabled && isControl);
  const categoryOrder = gameView?.categoryOrder ?? [];
  const mainCategories = categoryOrder.filter((category) => category !== "Особые условия");
  const orderedDossierCategories = useMemo(() => {
    const categorySet = new Set(mainCategories);
    const ordered = [
      DOSSIER_MAIN_CATEGORY,
      ...DOSSIER_GRID_ROWS.flat(),
    ].filter((category) => categorySet.has(category));
    const rest = mainCategories.filter((category) => !ordered.includes(category));
    return [...ordered, ...rest];
  }, [mainCategories]);
  const isDevScenario = Boolean(
    roomState?.scenarioMeta.devOnly || roomState?.scenarioMeta.id === "dev_test"
  );

  const selectedCard = useMemo(
    () => you?.hand.find((card) => card.instanceId === selectedCardId) ?? null,
    [you?.hand, selectedCardId]
  );

  const alivePlayers = publicPlayers.filter((player) => player.status === "alive");
  const roundRevealedCount =
    gameView?.public.roundRevealedCount ?? gameView?.public.revealedThisRound.length ?? 0;
  const roundTotalAlive = gameView?.public.roundTotalAlive ?? alivePlayers.length;
  const currentTurnPlayerId = gameView?.public.currentTurnPlayerId ?? null;
  const canRevealDuringGame =
    phase === "reveal" &&
    youStatus === "alive" &&
    currentTurnPlayerId === you?.playerId &&
    !youRevealedThisRound;
  const canRevealPostGame = phase === "ended" && youStatus !== "left_bunker";
  const canReveal = wsInteractive && (canRevealDuringGame || canRevealPostGame);
  const forcedRevealCategory = (gameView?.public.roundRules?.forcedRevealCategory ?? "").trim();
  const forcedRevealCategoryHasHiddenCards = useMemo(() => {
    if (!forcedRevealCategory) return false;
    const forcedSlot = you?.categories.find((entry) => entry.category === forcedRevealCategory);
    if (!forcedSlot) return false;
    return forcedSlot.cards.some((card) => !card.revealed && (canRevealPostGame || youStatus === "alive"));
  }, [canRevealPostGame, forcedRevealCategory, you?.categories, youStatus]);
  const isCategoryLockedByForcedReveal = (category: string) =>
    Boolean(
      canRevealDuringGame &&
        forcedRevealCategory &&
        forcedRevealCategoryHasHiddenCards &&
        category !== forcedRevealCategory
    );
  const isCardSelectableForReveal = (category: string, revealed: boolean) =>
    Boolean(
      canReveal &&
        !revealed &&
        (canRevealPostGame || youStatus === "alive") &&
        !isCategoryLockedByForcedReveal(category)
    );
  const selectedCardCategory = useMemo(() => {
    if (!selectedCardId) return null;
    for (const slot of you?.categories ?? []) {
      if (slot.cards.some((card) => card.instanceId === selectedCardId)) {
        return slot.category;
      }
    }
    return null;
  }, [selectedCardId, you?.categories]);
  const canRevealSelectedCard =
    selectedCard !== null &&
    selectedCardCategory !== null &&
    isCardSelectableForReveal(selectedCardCategory, selectedCard.revealed);
  const canVote =
    wsInteractive &&
    phase === "voting" &&
    votePhase === "voting" &&
    youStatus === "alive" &&
    !(gameView?.public.voting?.hasVoted ?? false);
  const selectedVoteTargetDisallowed = voteTargetId ? disallowedVoteTargetSet.has(voteTargetId) : false;
  const currentTurnName = currentTurnPlayerId
    ? publicPlayers.find((player) => player.playerId === currentTurnPlayerId)?.name ?? ""
    : "";
  const latestEvent = eventLog[0];
  const phaseLabel =
    phase === "reveal_discussion"
      ? (() => {
          const shortName = formatPlayerNameShort(currentTurnName, 16);
          return shortName
            ? `Обсуждение карты игрока ${shortName}`
            : "Обсуждение карты игрока";
        })()
      : ru.phaseText(phase);
  const statusMessage = gameView?.lastStageText ?? latestEvent?.message ?? ru.noEvents;
  const votesTotalThisRound =
    gameView?.public.votesTotalThisRound ??
    gameView?.ruleset.votesPerRound[Math.max(0, (gameView?.round ?? 1) - 1)] ??
    0;
  const votesRemainingThisRound = gameView?.public.votesRemainingInRound ?? votesTotalThisRound;
  const voteIndex =
    votesTotalThisRound > 0
      ? Math.min(votesTotalThisRound, votesTotalThisRound - votesRemainingThisRound + (phase === "voting" ? 1 : 0))
      : 0;
  const timerRemainingSec = activeTimer
    ? Math.max(0, Math.ceil((activeTimer.endsAt - now) / 1000))
    : null;

  const getWorldImage = (imageId?: string) => (imageId ? getCardFaceUrl(imageId) : undefined);
  const finalThreatReveal = roomState?.settings.finalThreatReveal ?? "host";
  const canRevealThreats =
    wsInteractive &&
    phase === "ended" &&
    !!world &&
    (finalThreatReveal === "anyone" || (finalThreatReveal === "host" && isHost));
  const canDecidePostGameOutcome = Boolean(
    wsInteractive && postGame?.isActive && !postGame?.outcome && isHost && !useOverlayControl
  );
  const hasWorld = Boolean(world);
  const threatModifier = gameView?.public.threatModifier;
  const worldThreatFinalCount = useMemo(() => {
    if (!world) return 0;
    const fromModifier = threatModifier?.finalCount;
    if (typeof fromModifier === "number" && Number.isFinite(fromModifier)) {
      return Math.max(0, Math.min(world.threats.length, Math.trunc(fromModifier)));
    }
    const fallbackCount = world.counts?.threats ?? world.threats.length;
    return Math.max(0, Math.min(world.threats.length, Math.trunc(fallbackCount)));
  }, [world, threatModifier?.finalCount]);
  const visibleWorldThreats = useMemo(
    () => (world ? world.threats.slice(0, worldThreatFinalCount) : []),
    [world, worldThreatFinalCount]
  );
  const mobileBunkerPreview = useMemo(() => {
    if (!world || world.bunker.length === 0) return null;
    for (let i = world.bunker.length - 1; i >= 0; i -= 1) {
      if (world.bunker[i].isRevealed) return world.bunker[i];
    }
    return world.bunker[0];
  }, [world]);
  const mobileThreatPreview = useMemo(() => {
    if (visibleWorldThreats.length === 0) return null;
    for (let i = visibleWorldThreats.length - 1; i >= 0; i -= 1) {
      if (visibleWorldThreats[i].isRevealed) return visibleWorldThreats[i];
    }
    return visibleWorldThreats[0];
  }, [visibleWorldThreats]);
  const showThreatModifier = phase === "ended" && (threatModifier?.delta ?? 0) !== 0;
  const threatModifierText = useMemo(() => {
    if (!showThreatModifier || !threatModifier) return "";
    const sign = threatModifier.delta > 0 ? "+" : "";
    const reasons = threatModifier.reasons.join(", ");
    return `Модификатор угроз: ${sign}${threatModifier.delta} (из: ${reasons})`;
  }, [showThreatModifier, threatModifier]);

  const openWorldDetail = (params: {
    title: string;
    description?: string;
    imageUrl?: string;
    label: string;
    kind: string;
  }) => {
    setWorldDetail(params);
  };

  useEffect(() => {
    if (isMobile) return;
    preloadCategoryBacks(PUBLIC_CATEGORY_ORDER);
  }, [isMobile]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 1250px)");
    const update = (match: MediaQueryList | MediaQueryListEvent) => {
      setIsMobile("matches" in match ? match.matches : query.matches);
    };
    update(query);
    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia("(max-width: 600px)");
    const update = (match: MediaQueryList | MediaQueryListEvent) => {
      setIsMobileNarrow("matches" in match ? match.matches : query.matches);
    };
    update(query);
    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  useEffect(() => {
    if (!isMobile) {
      setDossierOpen(false);
    }
  }, [isMobile]);
  useEffect(() => {
    if (!isMobile || !dossierOpen || isMobileNarrow) return;
    const body = document.body;
    const html = document.documentElement;
    const previous = body.style.overflow;
    const previousPosition = body.style.position;
    const previousTop = body.style.top;
    const previousWidth = body.style.width;
    const previousHtml = html.style.overflow;
    const scrollY = window.scrollY;
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
      body.style.position = previousPosition;
      body.style.top = previousTop;
      body.style.width = previousWidth;
      html.style.overflow = previousHtml;
      window.scrollTo(0, scrollY);
    };
  }, [isMobile, dossierOpen, isMobileNarrow]);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const clear = () => root.style.setProperty("--mobile-action-bar-height", "0px");
    if (!isMobile) {
      clear();
      return;
    }
    const node = mobileActionBarRef.current;
    if (!node) {
      clear();
      return;
    }

    const updateHeight = () => {
      const rect = node.getBoundingClientRect();
      const reserved = Math.max(0, Math.ceil(rect.height + 20));
      root.style.setProperty("--mobile-action-bar-height", `${reserved}px`);
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => updateHeight());
      observer.observe(node);
    }

    return () => {
      window.removeEventListener("resize", updateHeight);
      observer?.disconnect();
      clear();
    };
  }, [isMobile, isMobileNarrow, phase, votePhase, useOverlayControl, canDecidePostGameOutcome, isDevScenario]);
  useEffect(() => {
    specialDialogRef.current = specialDialog;
  }, [specialDialog]);
  useEffect(
    () => () => {
      if (specialActionLockTimerRef.current) {
        clearTimeout(specialActionLockTimerRef.current);
        specialActionLockTimerRef.current = null;
      }
    },
    []
  );
  useEffect(() => {
    if (phase !== "reveal" && phase !== "ended") {
      setSelectedCardId(null);
    }
    if (phase !== "voting") {
      setVoteTargetId(null);
    }
  }, [phase]);

  useEffect(() => {
    if (!votePhase) {
      setVoteModalOpen(false);
    }
    if (votePhase === "voteSpecialWindow") {
      setVoteModalOpen(false);
    }
  }, [votePhase]);

  useEffect(() => {
    if (!worldEvent || worldEvent.type !== "bunker_revealed") return;
    const key = `${worldEvent.round}-${worldEvent.index}`;
    if (lastWorldEventRef.current === key) return;
    lastWorldEventRef.current = key;
    if (isMobileNarrow) {
      setMobileWorldBanner({
        key,
        kind: "bunker",
        message: "Начался новый раунд — посмотри карты Бункера",
        cta: "Открыть",
      });
      return;
    }
    if (!isMobile) {
      setWorldModalOpen(true);
    }
  }, [worldEvent, isMobile, isMobileNarrow]);

  useEffect(() => {
    if (!postGame?.isActive || postGame.outcome) return;
    const enteredAt = postGame.enteredAt ?? 0;
    if (lastPostGameRef.current === enteredAt) return;
    lastPostGameRef.current = enteredAt;
    if (isMobileNarrow) {
      setMobileWorldBanner({
        key: `postgame-${enteredAt}`,
        kind: "threat",
        message: "Перед выбором исхода посмотри карты Угроз",
        cta: "Открыть угрозы",
      });
      return;
    }
    setWorldModalOpen(true);
  }, [postGame?.isActive, postGame?.enteredAt, postGame?.outcome, isMobileNarrow]);
  useEffect(() => {
    if (!activeTimer) return;
    const id = window.setInterval(() => setNow(Date.now()), 300);
    return () => window.clearInterval(id);
  }, [activeTimer?.kind, activeTimer?.endsAt]);
  useEffect(() => {
    if (!worldDetail) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorldDetail(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [worldDetail]);
  useEffect(() => {
    if (!selectedPlayerId) return;
    if (!publicPlayers.some((player) => player.playerId === selectedPlayerId)) {
      setSelectedPlayerId(null);
    }
  }, [publicPlayers, selectedPlayerId]);


  const votesByVoter = useMemo(() => {
    const map = new Map<string, (typeof votesPublic)[number]>();
    votesPublic.forEach((vote) => map.set(vote.voterId, vote));
    return map;
  }, [votesPublic]);

  const yourVoteEntry = useMemo(() => votesByVoter.get(you?.playerId ?? ""), [votesByVoter, you?.playerId]);

  const yourVoteLabel = useMemo(() => {
    const vote = yourVoteEntry;
    if (!vote || vote.status !== "voted" || !vote.targetName) return ru.votingSummaryNone;
    if (vote.targetId === you?.playerId) {
      return ru.votingSummaryForcedSelf(vote.reason);
    }
    return ru.votingSummary(vote.targetName);
  }, [yourVoteEntry, you?.playerId]);

  const yourVoteWeight = useMemo(() => {
    if (!yourVoteEntry) return 1;
    const weight = Number(yourVoteEntry.weight ?? 1);
    return Number.isFinite(weight) && weight > 0 ? weight : 1;
  }, [yourVoteEntry]);

  const selectedVotePlayer = useMemo(
    () => publicPlayers.find((entry) => entry.playerId === voteTargetId) ?? null,
    [publicPlayers, voteTargetId]
  );

  useEffect(() => {
    if (!voteTargetId) return;
    if (!disallowedVoteTargetSet.has(voteTargetId)) return;
    setVoteTargetId(null);
  }, [disallowedVoteTargetSet, voteTargetId]);
  const selectedBoardPlayer = publicPlayers.find((entry) => entry.playerId === selectedPlayerId) ?? null;

  const selectedBoardLabel = selectedBoardPlayer
    ? selectedBoardPlayer.playerId === you?.playerId
      ? `${selectedBoardPlayer.name} (${ru.youBadge})`
      : selectedBoardPlayer.name
    : "";

  const selectedCategoryRows = Math.ceil(PUBLIC_CATEGORY_ORDER.length / 2);
  const votingSpecials = useMemo(() => {
    const specials = you?.specialConditions ?? [];
    return specials.filter(
      (special) =>
        special.implemented &&
        !special.used &&
        VOTING_ONLY_EFFECTS.has(special.effect.type) &&
        special.trigger !== "onOwnerEliminated" &&
        special.trigger !== "secret_onEliminate" &&
        special.trigger !== "onRevealOrActive"
    );
  }, [you?.specialConditions]);
  const showVotingSpecialsSection =
    votePhase === "voting" || votePhase === "voteSpecialWindow";
  const showFinalizeVoting = !useOverlayControl && isControl && votePhase === "voteSpecialWindow";

  const handleSelectPlayer = (playerId: string) => {
    setSelectedPlayerId((prev) => (prev === playerId ? null : playerId));
  };

  const runDevChecks = async () => {
    if (!gameView) return;
    const results: Array<{ id: string; label: string; status: "pass" | "fail"; detail?: string }> = [];
    const waitFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const seatCount = document.querySelectorAll(".table-seat").length;
    results.push({
      id: "seat-count",
      label: "Игроки/рассадка",
      status: seatCount === publicPlayers.length ? "pass" : "fail",
      detail: `${seatCount}/${publicPlayers.length}`,
    });

    const previousSelected = selectedPlayerId;
    const targetPlayer = publicPlayers[0];
    if (targetPlayer) {
      setSelectedPlayerId(targetPlayer.playerId);
      await waitFrame();
      const selectedName = document.querySelector(".selected-name")?.textContent ?? "";
      results.push({
        id: "select-panel",
        label: "Выбор игрока обновляет панель",
        status: selectedName.includes(targetPlayer.name) ? "pass" : "fail",
        detail: selectedName || "нет имени",
      });

      const firstRevealedCard = targetPlayer.categories
        .flatMap((slot) => slot.cards)
        .find((card) => Boolean(card.imgUrl));
      const expectedUrl = getCardFaceUrl(firstRevealedCard?.imgUrl);
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".selected-grid .card-tile img"));
      const hasExpected = expectedUrl ? images.some((img) => img.src.includes(expectedUrl)) : images.length > 0;
      results.push({
        id: "reveal-panel",
        label: "Панель отражает раскрытые карты",
        status: hasExpected ? "pass" : "fail",
        detail: hasExpected ? "ok" : "нет раскрытых карт",
      });
    } else {
      results.push({
        id: "select-panel",
        label: "Выбор игрока обновляет панель",
        status: "fail",
        detail: "нет игроков",
      });
      results.push({
        id: "reveal-panel",
        label: "Панель отражает раскрытые карты",
        status: "fail",
        detail: "нет игроков",
      });
    }

    const availableChoiceSpecial =
      youSafe.specialConditions.find((special) => {
        if (!special.implemented) return false;
        if (!isDevScenario && special.used) return false;
        if (special.choiceKind !== "category") return false;
        return true;
      }) ??
      youSafe.specialConditions.find((special) => {
        if (!special.implemented) return false;
        if (!isDevScenario && special.used) return false;
        if (!special.needsChoice && special.choiceKind === "none") return false;
        if (!isDevScenario && VOTING_ONLY_EFFECTS.has(special.effect.type) && votePhase !== "voteSpecialWindow") {
          return false;
        }
        if (!isDevScenario && REVEAL_ONLY_EFFECTS.has(special.effect.type) && phase !== "reveal") {
          return false;
        }
        return true;
      });

    if (availableChoiceSpecial) {
      handleApplySpecial(availableChoiceSpecial);
      await waitFrame();
      await waitFrame();
      const opened = Boolean(specialDialogRef.current);
      if (opened && specialDialogRef.current?.options?.length) {
        const firstOption = specialDialogRef.current.options[0];
        setDialogSelection(firstOption.id);
        await waitFrame();
        submitSpecialDialog();
        await waitFrame();
      }
      const closed = !specialDialogRef.current;
      results.push({
        id: "special-modal",
        label: "applySpecial открывает выбор",
        status: opened && closed ? "pass" : "fail",
        detail: opened
          ? closed
            ? "окно открыто и применено"
            : "окно не закрылось"
          : "окно не открылось",
      });
      closeSpecialDialog();
    } else {
      results.push({
        id: "special-modal",
        label: "applySpecial открывает выбор",
        status: "fail",
        detail: "нет доступной карты с выбором",
      });
    }

    await waitFrame();
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(".selected-grid .card-tile img"));
    let cropViolations = 0;
    images.forEach((img) => {
      const parent = img.parentElement;
      if (!parent) return;
      if (img.clientWidth > parent.clientWidth + 1 || img.clientHeight > parent.clientHeight + 1) {
        cropViolations += 1;
      }
    });
    results.push({
      id: "card-fit",
      label: "Карты не обрезаются",
      status: cropViolations === 0 ? "pass" : "fail",
      detail: cropViolations === 0 ? "ok" : `обрезано: ${cropViolations}`,
    });

    setDevChecks(results);
    setSelectedPlayerId(previousSelected ?? null);
  };


  const openSpecialDialog = (
    specialInstanceId: string,
    title: string,
    kind: SpecialDialogKind,
    options: Array<{ id: string; label: string }> = [],
    description?: string,
    cardPicker?: SpecialDialogCardPicker
  ) => {
    setDialogSelection("");
    setDialogTargetCardSelection("");
    setDialogSourceCardSelection("");
    setSpecialDialog({ kind, specialInstanceId, title, options, description, cardPicker });
  };

  const closeSpecialDialog = () => {
    setSpecialDialog(null);
    setDialogSelection("");
    setDialogTargetCardSelection("");
    setDialogSourceCardSelection("");
  };

  const applySpecialAndLock = (specialInstanceId: string, payload?: Record<string, unknown>) => {
    setSpecialActionLock(true);
    if (specialActionLockTimerRef.current) {
      clearTimeout(specialActionLockTimerRef.current);
      specialActionLockTimerRef.current = null;
    }
    onApplySpecial(specialInstanceId, payload);
    specialActionLockTimerRef.current = setTimeout(() => {
      setSpecialActionLock(false);
      specialActionLockTimerRef.current = null;
    }, 900);
  };

  const selectDialogPlayer = (playerId: string) => {
    setDialogSelection(playerId);
    if (!specialDialog || specialDialog.kind !== "player" || !specialDialog.cardPicker) {
      setDialogTargetCardSelection("");
      setDialogSourceCardSelection("");
      return;
    }
    const targetCards = getRevealedCategoryCards(playerId, specialDialog.cardPicker.categoryKey);
    setDialogTargetCardSelection(targetCards[0]?.instanceId ?? "");
    if (specialDialog.cardPicker.requireSourceCard && you) {
      if (!dialogSourceCardSelection) {
        const ownCards = getRevealedCategoryCards(you.playerId, specialDialog.cardPicker.categoryKey);
        setDialogSourceCardSelection(ownCards[0]?.instanceId ?? "");
      }
    } else {
      setDialogSourceCardSelection("");
    }
  };

  const getRevealedCategoryCards = (
    playerId: string,
    categoryKey: string
  ): Array<{ instanceId: string; hint: string }> => {
    const player = publicPlayers.find((entry) => entry.playerId === playerId);
    if (!player) return [];
    const labels = CATEGORY_KEY_TO_LABELS[categoryKey] ?? [categoryKey];
    const result: Array<{ instanceId: string; hint: string }> = [];
    for (const label of labels) {
      const slot = player.categories.find((entry) => entry.category === label);
      if (!slot || slot.status !== "revealed") continue;
      for (const card of slot.cards) {
        if (card.hidden) continue;
        const instanceId = String(card.instanceId ?? "").trim();
        if (!instanceId) continue;
        const cardLabel = String(card.labelShort ?? "").trim() || "—";
        result.push({ instanceId, hint: `${label}: ${cardLabel}` });
      }
    }
    return result;
  };

  const hasRevealedCategory = (playerId: string, categoryKey: string) => {
    return getRevealedCategoryCards(playerId, categoryKey).length > 0;
  };

  const getRevealedCategoryCardHint = (playerId: string, categoryKey: string): string | null => {
    return getRevealedCategoryCards(playerId, categoryKey)[0]?.hint ?? null;
  };

  const getRevealedBunkerOptions = () =>
    (world?.bunker ?? [])
      .map((card, index) => ({ card, index }))
      .filter((entry) => entry.card.isRevealed)
      .map((entry) => ({
        id: String(entry.index),
        label: `Карта #${entry.index + 1}: ${entry.card.title || entry.card.description || "Без названия"}`,
      }));

  const resolveTargetScope = (special: SpecialConditionInstance): SpecialTargetScope | null => {
    if (special.targetScope) return special.targetScope;
    if (special.choiceKind === "neighbor") return "neighbors";
    if (special.choiceKind === "player") return "any_alive";
    return null;
  };

  const hasTargetsForSpecial = (special: SpecialConditionInstance): boolean => {
    if (!you) return false;
    const choiceKind = special.choiceKind ?? (special.needsChoice ? "player" : "none");
    if (choiceKind === "bunker") {
      return getRevealedBunkerOptions().length > 0;
    }
    if (choiceKind === "special") return true;
    if (choiceKind !== "player" && choiceKind !== "neighbor") return true;
    const targetScope = resolveTargetScope(special);
    if (!targetScope) return true;
    const aliveSet = new Set(alivePlayers.map((player) => player.playerId));
    const orderRing = publicPlayers.map((player) => player.playerId);
    let candidateIds = getTargetCandidates(targetScope, you.playerId, orderRing, aliveSet);
    if (targetScope === "neighbors") {
      const neighbors = computeNeighbors(orderRing, aliveSet, you.playerId);
      candidateIds = [];
      if (neighbors.leftId) candidateIds.push(neighbors.leftId);
      if (neighbors.rightId && neighbors.rightId !== neighbors.leftId) candidateIds.push(neighbors.rightId);
    }
    const allowSelfTarget = special.allowSelfTarget ?? targetScope === "any_including_self";
    let options = candidateIds
      .filter((id) => allowSelfTarget || id !== you.playerId)
      .map((id) => {
        const player = publicPlayers.find((entry) => entry.playerId === id);
        return player ? player.playerId : null;
      })
      .filter((id): id is string => Boolean(id));
    const categoryKey = String(special.effect.params?.category ?? "");
    if (special.effect.type === "replaceRevealedCard" || special.effect.type === "discardRevealedAndDealHidden") {
      if (categoryKey) {
        options = options.filter((id) => hasRevealedCategory(id, categoryKey));
      }
    }
    if (special.effect.type === "swapRevealedWithNeighbor") {
      if (categoryKey) {
        const youHas = hasRevealedCategory(you.playerId, categoryKey);
        options = options.filter((id) => youHas && hasRevealedCategory(id, categoryKey));
      }
    }
    if (special.effect.type === "stealBaggage_and_giveSpecial") {
      options = options.filter((id) => {
        const targetPlayer = publicPlayers.find((entry) => entry.playerId === id);
        const baggageSlot = targetPlayer?.categories.find((entry) => entry.category === "Багаж");
        return (baggageSlot?.cards.length ?? 0) > 0;
      });
    }
    return options.length > 0;
  };

  const showNoTargetNotice =
    votingSpecials.length > 0 && !votingSpecials.some((special) => hasTargetsForSpecial(special));

  const canUseSpecialNow = (special: SpecialConditionInstance): boolean => {
    if (!wsInteractive || !special.implemented || special.used) return false;
    if (special.trigger === "secret_onEliminate") return false;
    if (special.trigger === "onOwnerEliminated") return Boolean(special.pendingActivation);

    const isVotingEffect = VOTING_ONLY_EFFECTS.has(special.effect.type);
    if (!isDevScenario) {
      if (isVotingEffect && votePhase !== "voteSpecialWindow") return false;
      if (REVEAL_ONLY_EFFECTS.has(special.effect.type) && phase !== "reveal") return false;
    }
    return true;
  };

  const handleApplySpecial = (special: SpecialConditionInstance) => {
    if (!canUseSpecialNow(special)) return;
    if (!wsInteractive) return;
    if (!gameView) return;
    const effectType = special.effect.type;

    const isVotingOnly = VOTING_ONLY_EFFECTS.has(effectType);
    const isRevealOnly = REVEAL_ONLY_EFFECTS.has(effectType);

    if (!isDevScenario) {
      if (isVotingOnly && votePhase !== "voteSpecialWindow") {
        return;
      }
      if (isRevealOnly && phase !== "reveal") {
        return;
      }
    }

    const choiceKind = special.choiceKind ?? (special.needsChoice ? "player" : "none");
    const targetScope = resolveTargetScope(special);
    const aliveSet = new Set(alivePlayers.map((player) => player.playerId));
    const orderRing = publicPlayers.map((player) => player.playerId);

    if (choiceKind === "category") {
      const fixedCategory = String(special.effect.params?.category ?? "").trim();
      if (fixedCategory) {
        applySpecialAndLock(special.instanceId, { category: fixedCategory });
        return;
      }
      openSpecialDialog(special.instanceId, "Выберите категорию", "category", CATEGORY_OPTIONS, special.text);
      return;
    }

    if (choiceKind === "special") {
      const options =
        Array.isArray(special.effect.params?.specialOptions)
          ? special.effect.params.specialOptions
              .map((item) => {
                if (!item || typeof item !== "object") return null;
                const id = String((item as { id?: unknown }).id ?? "").trim();
                const label = String((item as { title?: unknown }).title ?? "").trim();
                if (!id) return null;
                return { id, label: label || id };
              })
              .filter((item): item is { id: string; label: string } => Boolean(item))
          : [];
      openSpecialDialog(
        special.instanceId,
        "Выберите особое условие",
        "special",
        options,
        special.text
      );
      return;
    }

    if (choiceKind === "bunker") {
      const options = getRevealedBunkerOptions();
      openSpecialDialog(special.instanceId, "Выберите карту бункера", "bunker", options, special.text);
      return;
    }

    if (choiceKind === "player" || choiceKind === "neighbor") {
      if (!you || !targetScope) {
        applySpecialAndLock(special.instanceId, {});
        return;
      }

      if (targetScope === "self") {
        applySpecialAndLock(special.instanceId, { targetPlayerId: you.playerId });
        return;
      }

      let candidateIds = getTargetCandidates(targetScope, you.playerId, orderRing, aliveSet);
      if (targetScope === "neighbors") {
        const neighbors = computeNeighbors(orderRing, aliveSet, you.playerId);
        candidateIds = [];
        if (neighbors.leftId) candidateIds.push(neighbors.leftId);
        if (neighbors.rightId && neighbors.rightId !== neighbors.leftId) candidateIds.push(neighbors.rightId);
      }

      const allowSelfTarget = special.allowSelfTarget ?? targetScope === "any_including_self";
      let options = candidateIds
        .filter((id) => allowSelfTarget || id !== you.playerId)
        .map((id) => {
          const player = publicPlayers.find((entry) => entry.playerId === id);
          if (!player) return null;
          const label =
            player.playerId === you.playerId ? `${player.name} (${ru.youBadge})` : player.name;
          return { id: player.playerId, label };
        })
        .filter((entry): entry is { id: string; label: string } => Boolean(entry));

      if (targetScope === "neighbors") {
        const neighbors = computeNeighbors(orderRing, aliveSet, you.playerId);
        options = options.map((option) => {
          const prefix =
            option.id === neighbors.leftId
              ? "Слева: "
              : option.id === neighbors.rightId
                ? "Справа: "
                : "";
          return { ...option, label: `${prefix}${option.label}` };
        });
      }

      const categoryKey = String(special.effect.params?.category ?? "");
      const isCategoryCardEffect =
        effectType === "swapRevealedWithNeighbor" ||
        effectType === "replaceRevealedCard" ||
        effectType === "discardRevealedAndDealHidden";
      if (categoryKey && isCategoryCardEffect) {
        if (effectType === "swapRevealedWithNeighbor") {
          const ownCards = getRevealedCategoryCards(you.playerId, categoryKey);
          options = options.filter(
            (option) => ownCards.length > 0 && getRevealedCategoryCards(option.id, categoryKey).length > 0
          );
        } else {
          options = options.filter((option) => getRevealedCategoryCards(option.id, categoryKey).length > 0);
        }
        openSpecialDialog(
          special.instanceId,
          targetScope === "neighbors" ? "Выберите соседа" : "Выберите игрока",
          "player",
          options,
          special.text,
          { categoryKey, requireSourceCard: effectType === "swapRevealedWithNeighbor" }
        );
        return;
      }

      if (effectType === "stealBaggage_and_giveSpecial") {
        const baggageOptions = options.flatMap((option) => {
          const targetPlayer = publicPlayers.find((entry) => entry.playerId === option.id);
          if (!targetPlayer) return [];
          const baggageSlot = targetPlayer.categories.find((entry) => entry.category === "Багаж");
          const baggageCards = baggageSlot?.cards ?? [];
          return baggageCards
            .map((card, index) => {
              if (!card.instanceId) return null;
              const cardLabel = card.hidden ? `Скрытая карта #${index + 1}` : card.labelShort;
              return {
                id: `${option.id}::${card.instanceId}`,
                label: `${option.label} - ${cardLabel}`,
              };
            })
            .filter((entry): entry is { id: string; label: string } => Boolean(entry));
        });
        openSpecialDialog(
          special.instanceId,
          "Выберите конкретный багаж",
          "baggage",
          baggageOptions,
          special.text
        );
        return;
      }

      openSpecialDialog(
        special.instanceId,
        targetScope === "neighbors" ? "Выберите соседа" : "Выберите игрока",
        "player",
        options,
        special.text
      );
      return;
    }

    applySpecialAndLock(special.instanceId, {});
  };

  const handleApplySpecialFromDossier = (special: SpecialConditionInstance) => {
    if (isMobileNarrow) {
      onMarkDossierSpecialAction?.();
    }
    handleApplySpecial(special);
  };

  const submitSpecialDialog = () => {
    if (!wsInteractive) return;
    if (!specialDialog) return;
    if (!dialogSelection) return;

    if (specialDialog.kind === "player") {
      const normalizedTargetPlayerId = String(dialogSelection ?? "").trim();
      if (!normalizedTargetPlayerId) {
        closeSpecialDialog();
        return;
      }
      const payload: Record<string, unknown> = { targetPlayerId: normalizedTargetPlayerId };
      if (specialDialog.cardPicker) {
        const normalizedTargetCardInstanceId = String(dialogTargetCardSelection ?? "").trim();
        if (!normalizedTargetCardInstanceId) return;
        payload.targetCardInstanceId = normalizedTargetCardInstanceId;
        if (specialDialog.cardPicker.requireSourceCard) {
          const normalizedSourceCardInstanceId = String(dialogSourceCardSelection ?? "").trim();
          if (!normalizedSourceCardInstanceId) return;
          payload.sourceCardInstanceId = normalizedSourceCardInstanceId;
        }
      } else {
        const [, targetCardInstanceId, sourceCardInstanceId] = dialogSelection.split("::");
        const normalizedTargetCardInstanceId = String(targetCardInstanceId ?? "").trim();
        if (normalizedTargetCardInstanceId) {
          payload.targetCardInstanceId = normalizedTargetCardInstanceId;
        }
        const normalizedSourceCardInstanceId = String(sourceCardInstanceId ?? "").trim();
        if (normalizedSourceCardInstanceId) {
          payload.sourceCardInstanceId = normalizedSourceCardInstanceId;
        }
      }
      applySpecialAndLock(specialDialog.specialInstanceId, payload);
    } else if (specialDialog.kind === "neighbor") {
      applySpecialAndLock(specialDialog.specialInstanceId, { side: dialogSelection });
    } else if (specialDialog.kind === "category") {
      applySpecialAndLock(specialDialog.specialInstanceId, { category: dialogSelection });
    } else if (specialDialog.kind === "bunker") {
      const bunkerIndex = Number(dialogSelection);
      if (Number.isInteger(bunkerIndex)) {
        applySpecialAndLock(specialDialog.specialInstanceId, { bunkerIndex });
      }
    } else if (specialDialog.kind === "special") {
      applySpecialAndLock(specialDialog.specialInstanceId, { specialId: dialogSelection });
    } else if (specialDialog.kind === "baggage") {
      const [targetPlayerId, baggageCardId] = dialogSelection.split("::");
      if (targetPlayerId && baggageCardId) {
        applySpecialAndLock(specialDialog.specialInstanceId, { targetPlayerId, baggageCardId });
      }
    }

    closeSpecialDialog();
  };

  const isPlayerCardPickerDialog = Boolean(
    specialDialog?.kind === "player" && specialDialog?.cardPicker
  );
  const dialogTargetCards =
    specialDialog?.kind === "player" && specialDialog?.cardPicker && dialogSelection
      ? getRevealedCategoryCards(dialogSelection, specialDialog.cardPicker.categoryKey)
      : [];
  const dialogSourceCards =
    specialDialog?.kind === "player" &&
    specialDialog?.cardPicker?.requireSourceCard &&
    you
      ? getRevealedCategoryCards(you.playerId, specialDialog.cardPicker.categoryKey)
      : [];
  const selectedTargetCardHint =
    dialogTargetCards.find((card) => card.instanceId === dialogTargetCardSelection)?.hint ?? "";
  const selectedSourceCardHint =
    dialogSourceCards.find((card) => card.instanceId === dialogSourceCardSelection)?.hint ?? "";
  const canSubmitSpecialDialog = (() => {
    if (!specialDialog) return false;
    if (!dialogSelection || specialDialog.options.length === 0) return false;
    if (!isPlayerCardPickerDialog) return true;
    if (!dialogTargetCardSelection) return false;
    if (specialDialog.cardPicker?.requireSourceCard && !dialogSourceCardSelection) return false;
    return true;
  })();
  const continueRoundBlockedBySpecial = specialActionLock || Boolean(specialDialog);

  if (!roomState || !gameView) {
    return (
      <div className="game-layout">
        <section className="panel game-loading">
          <h3>{ru.gameLoadingTitle}</h3>
          <div className="muted">{ru.gameLoadingText}</div>
        </section>
      </div>
    );
  }

  const youSafe = gameView.you;

  const DossierPanel = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <div className={`panel-header dossier-header${mobile ? " dossier-header-mobile" : ""}`}>
        <div>
          {!mobile ? <h3>{ru.dossierTitle}</h3> : null}
          <div className="muted">{ru.dossierSubtitle}</div>
          {postGame?.isActive ? <div className="muted">{ru.postGameRevealHint}</div> : null}
        </div>
        <span className={youStatus === "alive" ? "badge revealed" : "badge eliminated"}>
          {youStatus === "alive" ? ru.statusAlive : ru.statusEliminated}
        </span>
      </div>

      <div className="special-section compact">
        <div className="panel-subtitle">{ru.specialTitle}</div>
        <div className="special-list">
          {youSafe.specialConditions.map((special) => {
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
                        ? ru.usedLabel(true)
                        : special.revealedPublic
                          ? ru.cardRevealed
                          : ru.cardHidden
                    }
                    title={
                      special.used ? ru.usedLabel(true) : special.revealedPublic ? ru.cardRevealed : ru.cardHidden
                    }
                  />
                </div>
                <div className="special-description">{special.text}</div>
                <div className="special-meta">
                  {!special.implemented ? <span>{ru.notImplemented}</span> : null}
                  {special.used ? <span>{ru.specialApplied}</span> : null}
                </div>
                <div className="special-actions">
                  <button className="primary" disabled={!canUse} onClick={() => handleApplySpecial(special)}>
                    {ru.useSpecialButton}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(() => {
        const categoriesSet = new Set(orderedDossierCategories);
        const renderMiniCard = (category: string, fullWidth = false, featured = false) => {
          const slot = youSafe.categories.find((entry) => entry.category === category);
          const cards = slot?.cards ?? [];
          const categoryLocked = isCategoryLockedByForcedReveal(category);
          const preview = cards.length === 0 ? "—" : cards[0]?.labelShort ?? "—";
          const expandedText = cards.length === 0 ? "—" : cards.map((card) => card.labelShort).join(" • ");
          const expanded = expandedDossierKey === category;
          const firstSelectableCard =
            cards.find((card) => isCardSelectableForReveal(category, card.revealed)) ?? null;
          const selectedInCategory = cards.some((card) => card.instanceId === selectedCardId);
          const revealedInCategory = cards.some((card) => card.revealed);
          const options = cards.map((card) => {
            const selectable = isCardSelectableForReveal(category, card.revealed);
            return {
              id: card.instanceId,
              label: card.labelShort,
              selectable,
              selected: card.instanceId === selectedCardId,
            };
          });
          return (
            <DossierMiniCard
              key={category}
              label={category}
              preview={preview}
              expandedText={expandedText}
              expanded={expanded}
              selected={selectedInCategory}
              revealed={revealedInCategory}
              fullWidth={fullWidth}
              featured={featured}
              inactive={categoryLocked}
              expandable={category !== DOSSIER_MAIN_CATEGORY}
              options={options}
              onCardClick={() => {
                if (firstSelectableCard) {
                  setSelectedCardId(firstSelectableCard.instanceId);
                }
              }}
              onToggleExpand={() => {
                if (category === DOSSIER_MAIN_CATEGORY) return;
                setExpandedDossierKey((prev) => (prev === category ? null : category));
              }}
              onSelectOption={(cardId) => setSelectedCardId(cardId)}
            />
          );
        };

        return (
          <>
            {categoriesSet.has(DOSSIER_MAIN_CATEGORY) ? renderMiniCard(DOSSIER_MAIN_CATEGORY, true, true) : null}
            <div className="dossier-mini-grid">
              {DOSSIER_GRID_ROWS.flat()
                .filter((category) => categoriesSet.has(category))
                .map((category) => renderMiniCard(category))}
              {orderedDossierCategories
                .filter(
                  (category) => category !== DOSSIER_MAIN_CATEGORY && !DOSSIER_GRID_ROWS.flat().includes(category)
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
            {canRevealPostGame ? ru.revealPostGameAction : ru.revealAction}
          </button>
        </div>
      ) : null}

      {isDevScenario ? (
        <div className="dev-panel">
          <div className="panel-subtitle">Dev Test</div>
          <div className="dev-row muted">Игроков в игре: {publicPlayers.length}</div>
          <div className="dev-actions">
            <button className="ghost button-small" onClick={() => onDevAddPlayer()}>
              + Добавить игрока
            </button>
            <div className="dev-remove">
              <select value={devRemoveTargetId} onChange={(event) => setDevRemoveTargetId(event.target.value)}>
                <option value="">Удалить последнего бота</option>
                {publicPlayers
                  .filter((player) => player.playerId !== you?.playerId)
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
                − Удалить
              </button>
            </div>
          </div>
          <button className="ghost button-small" onClick={runDevChecks}>
            Прогнать проверки
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
          <div className="panel-subtitle">{ru.resolutionTitle}</div>
          <div>{gameView.public.resolutionNote ?? ru.resolutionWaiting}</div>
        </div>
      ) : null}
    </>
  );

  const MobileDossierPanel = () => {
    const categoriesSet = new Set(orderedDossierCategories);
    const cardsByCategory = orderedDossierCategories
      .filter((category) => categoriesSet.has(category))
      .map((category) => {
        const slot = youSafe.categories.find((entry) => entry.category === category);
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
            <div className="mobile-dossier-title">{ru.dossierTitle}</div>
            <div className="muted">{ru.dossierSubtitle}</div>
            {postGame?.isActive ? <div className="muted">{ru.postGameRevealHint}</div> : null}
          </div>
          <span className={youStatus === "alive" ? "badge revealed" : "badge eliminated"}>
            {youStatus === "alive" ? ru.statusAlive : ru.statusEliminated}
          </span>
        </div>

        <div className="mobile-dossier-section">
          <div className="panel-subtitle">{ru.specialTitle}</div>
          <div className="special-list">
            {youSafe.specialConditions.map((special) => {
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
                  {special.used ? <div className="special-meta"><span>{ru.specialApplied}</span></div> : null}
                  <div className="special-actions">
                    <button className="primary" disabled={!canUse} onClick={() => handleApplySpecialFromDossier(special)}>
                      {ru.useSpecialButton}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mobile-dossier-section">
          <div className="panel-subtitle">{ru.dossierCardsTitle}</div>
          <div className="mobile-dossier-cards">
            {cardsByCategory.map(({ category, cards, selectableCards, categoryLocked }) => {
              const label = CATEGORY_KEY_TO_RU[category] ?? category;
              const value =
                cards.length === 0 ? "—" : cards.map((card) => card.labelShort ?? "—").join(" • ");
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
                            className={`mobile-dossier-option${
                              card.instanceId === selectedCardId ? " selected" : ""
                            }`}
                            disabled={!selectable}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (selectable) {
                                setSelectedCardId(card.instanceId);
                              }
                            }}
                          >
                            {card.labelShort ?? "—"}
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
  };

  return (
    <div className="game-layout">
      <section className="panel game-status-bar">
        <div className="status-left">
          <div className="status-title">{ru.gameStatusTitle}</div>
          <div className="status-meta">
            <span>
              {ru.phaseLabel}: {phaseLabel}
            </span>
            <span>
              {ru.roundLabel}: {gameView.round}
            </span>
            <span>{ru.roundProgressLabel(gameView.round, roundRevealedCount, roundTotalAlive)}</span>
          </div>
          {currentTurnName ? <div className="status-turn">{ru.turnLabel(currentTurnName)}</div> : null}
          {votesTotalThisRound > 0 ? (
            <div className="status-turn">
              {phase === "voting" && voteIndex > 0
                ? ru.roundVoteIndexLabel(voteIndex, votesTotalThisRound)
                : ru.roundVotesLabel(votesTotalThisRound)}
            </div>
          ) : null}
          {gameView.public.roundRules?.forcedRevealCategory ? (
            <div className="rule-pill">
              {ru.mandatoryCategory(gameView.public.roundRules.forcedRevealCategory)}
            </div>
          ) : null}
          {gameView.public.roundRules?.noTalkUntilVoting ? (
            <div className="rule-pill">{ru.ruleNoTalk}</div>
          ) : null}
          <div className="status-log">{statusMessage}</div>
          {!wsInteractive ? <div className="muted wsDisabledHint">{ru.wsActionDisabledHint}</div> : null}
          {activeTimer && timerRemainingSec !== null ? (
            <div className="status-timer">{ru.timerLabel(activeTimer.kind, timerRemainingSec)}</div>
          ) : null}
          {votePhase ? (
            <div className="status-voting">
              <div className="status-voting-line">
                <span>{ru.votingTitle}:</span>
                <span className="muted">{ru.votePhaseLabel(votePhase)}</span>
                {votingProgress ? (
                  <span className="muted">{ru.votingProgressText(votingProgress.voted, votingProgress.total)}</span>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isMobileNarrow && mobileWorldBanner ? (
        <div className="mobile-world-banner" role="status">
          <div className="mobile-world-banner-text">{mobileWorldBanner.message}</div>
          <div className="mobile-world-banner-actions">
            <button
              className="primary button-small"
              onClick={() => {
                setMobileDeckModal(mobileWorldBanner.kind);
                setMobileWorldBanner(null);
              }}
            >
              {mobileWorldBanner.cta}
            </button>
            <button className="ghost button-small" onClick={() => setMobileWorldBanner(null)}>
              ✕
            </button>
          </div>
        </div>
      ) : null}

      <div className="game-main">
        {!isMobile ? (
          <section className={`panel dossier${isDevScenario ? " dossier--dev-scroll" : ""}`}>
            <DossierPanel />
          </section>
        ) : null}

        <section className="panel board">
          <div className="board-layout">
            <div className="table-panel">
              <div className="panel-header">
                <div>
                  <h3>{ru.boardTitle}</h3>
                  <div className="muted">{ru.boardSubtitle}</div>
                </div>
              </div>
              {!isMobile && !useOverlayControl && phase === "reveal_discussion" ? (
                <div className="board-controls">
                  <button
                    className="primary button-small"
                    disabled={!wsInteractive || !gameView.public.canContinue || continueRoundBlockedBySpecial}
                    onClick={onContinueRound}
                  >
                    {ru.continueRoundButton}
                  </button>
                  <span className="muted">
                    {roomState?.settings.continuePermission === "host_only"
                      ? ru.continueHintHost
                      : roomState?.settings.continuePermission === "revealer_only"
                        ? ru.continueHintRevealer
                        : ru.continueHintAnyone}
                  </span>
                </div>
              ) : null}
              {isMobile ? (
                <div className="mobile-table">
                  {world ? (
                    <div className="mobile-world-row">
                      <button
                        type="button"
                        className="mobile-world-card"
                        onClick={() => setMobileDeckModal("bunker")}
                      >
                        <div className="mobile-world-label">Бункер</div>
                        <div className="mobile-world-media">
                          <CardTile
                            src={
                              mobileBunkerPreview?.isRevealed
                                ? getWorldImage(mobileBunkerPreview.imageId)
                                : getCardBackUrl("Бункер")
                            }
                            fallback="Бункер"
                          />
                        </div>
                      </button>
                      <button
                        type="button"
                        className="mobile-world-card"
                        onClick={() => setMobileDeckModal("disaster")}
                      >
                        <div className="mobile-world-label">Катастрофа</div>
                        <div className="mobile-world-media">
                          <CardTile
                            src={getWorldImage(world.disaster.imageId)}
                            fallback="Катастрофа"
                          />
                        </div>
                      </button>
                      <button
                        type="button"
                        className="mobile-world-card"
                        onClick={() => setMobileDeckModal("threat")}
                      >
                        <div className="mobile-world-label">Угроза</div>
                        <div className="mobile-world-media">
                          <CardTile
                            src={
                              mobileThreatPreview?.isRevealed
                                ? getWorldImage(mobileThreatPreview.imageId)
                                : getCardBackUrl("Угроза")
                            }
                            fallback="Угроза"
                          />
                        </div>
                      </button>
                    </div>
                  ) : null}
                  <div className="mobile-player-bar">
                    <div className="mobile-player-strip" role="list">
                      {publicPlayers.map((player, index) => {
                        const isYou = player.playerId === you?.playerId;
                        const isSelected = player.playerId === selectedPlayerId;
                        const rawName = (player.name ?? "").trim() || `Игрок ${index + 1}`;
                        const shortName = formatPlayerNameShort(rawName, 12);
                        const label = isYou ? `${shortName} (${ru.youBadge})` : shortName;
                        const fullLabel = isYou ? `${rawName} (${ru.youBadge})` : rawName;
                        const classes = [
                          "mobile-player-chip",
                          isSelected ? "selected" : "",
                          isYou ? "you" : "",
                          player.status === "eliminated" ? "eliminated" : "",
                          player.status === "left_bunker" ? "left-bunker" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <button
                            key={player.playerId}
                            type="button"
                            className={classes}
                            onClick={() => handleSelectPlayer(player.playerId)}
                            role="listitem"
                            title={fullLabel}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="table-container">
                  <TableLayout
                    players={publicPlayers}
                    youId={you?.playerId ?? null}
                    selectedId={selectedPlayerId}
                    onSelect={handleSelectPlayer}
                    world={world}
                    worldThreatsTotal={worldThreatFinalCount}
                    onWorldClick={() => setWorldModalOpen(true)}
                  />
                </div>
              )}
              {votePhase === "voting" ? (
                <div className="board-actions">
                  <button
                    className="primary open-voting-button"
                    disabled={!wsInteractive || !gameView.public.canOpenVotingModal}
                    onClick={() => setVoteModalOpen(true)}
                  >
                    {ru.openVoting}
                  </button>
                </div>
              ) : null}
                {showVotingSpecialsSection ? (
                  <div className="vote-special-inline">
                    <div className="vote-special-alert">
                      <div className="vote-special-alert-text">
                        <span className="vote-special-alert-icon">⚑</span>
                        {ru.votingSpecialAlert}
                      </div>
                      <div className="vote-special-alert-actions">
                        {showFinalizeVoting ? (
                          <button
                            className="primary button-small"
                            disabled={!wsInteractive}
                            onClick={onFinalizeVoting}
                          >
                            {ru.finalizeVoting}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {votingSpecials.length > 0 ? (
                      <div className="vote-special-panel">
                        <div className="special-list">
                          {showNoTargetNotice && !isMobile ? (
                            <div className="muted">{ru.noTargetCandidates}</div>
                          ) : null}
                          {votingSpecials.map((special) => (
                            <div key={special.instanceId} className="special-card">
                              <div className="special-header">
                                <div className="special-title">{special.title}</div>
                                <span className={`badge ${special.revealedPublic ? "revealed" : "hidden"}`}>
                                  {special.revealedPublic ? ru.cardRevealed : ru.cardHidden}
                                </span>
                              </div>
                              <div className="special-text">{special.text}</div>
                              <div className="special-actions">
                                <button
                                  className="primary"
                                  disabled={!wsInteractive || votePhase !== "voteSpecialWindow"}
                                  onClick={() => handleApplySpecial(special)}
                                >
                                  {ru.useSpecialButton}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
            </div>
            <div className="selected-panel">
              <div className="selected-header">
                <div className="panel-subtitle">{ru.selectedPlayerTitle}</div>
                {selectedBoardPlayer ? <div className="selected-name">{selectedBoardLabel}</div> : null}
              </div>
              {selectedBoardPlayer ? (
                <div
                  className="selected-grid"
                  style={{ "--rows": selectedCategoryRows } as CSSProperties}
                >
                  {PUBLIC_CATEGORY_ORDER.map((category) => {
                    const slot = selectedBoardPlayer.categories.find((entry) => entry.category === category);
                    const isRevealed = Boolean(slot && slot.status === "revealed" && slot.cards.length > 0);
                    const card = slot?.cards[0];
                    const faceUrl = isRevealed ? getCardFaceUrl(card?.imgUrl) : undefined;
                    const backUrl = getCardBackUrl(card?.backCategory ?? category);
                    if (isRevealed && !faceUrl) {
                      return (
                        <CardTile
                          key={category}
                          src={backUrl}
                          fallback={category}
                          overlayLabel={card?.labelShort ?? category}
                        />
                      );
                    }
                    return (
                      <CardTile
                        key={category}
                        src={isRevealed ? faceUrl : backUrl}
                        fallback={category}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="selected-empty muted">{ru.selectedPlayerHint}</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {isMobile ? (
        <div
          ref={mobileActionBarRef}
          className={`mobile-action-bar${isMobileNarrow && canDecidePostGameOutcome ? " mobile-action-bar--final" : ""}`}
        >
          <button className="ghost mobile-action-dossier" onClick={() => setDossierOpen(true)}>
            {ru.dossierTitle}
          </button>
          {isDevScenario ? (
            <div className="mobile-dev-quick-actions">
              <button className="ghost button-small" onClick={() => onDevAddPlayer()}>
                + Игрок
              </button>
              <button className="ghost button-small" onClick={() => onDevRemovePlayer(undefined)}>
                - Игрок
              </button>
            </div>
          ) : null}
          {!useOverlayControl && phase === "reveal_discussion" ? (
            <button
              className="primary"
              disabled={!wsInteractive || !gameView.public.canContinue || continueRoundBlockedBySpecial}
              onClick={onContinueRound}
            >
              {ru.continueRoundButton}
            </button>
          ) : null}
          {votePhase === "voting" ? (
            <button
              className="ghost"
              disabled={!wsInteractive || !gameView.public.canOpenVotingModal}
              onClick={() => setVoteModalOpen(true)}
            >
              {ru.openVoting}
            </button>
          ) : null}
          {isMobileNarrow && canDecidePostGameOutcome ? (
            <div className="mobile-outcome-row">
              <button
                className="primary success"
                onClick={() => onSetBunkerOutcome("survived")}
              >
                {ru.bunkerOutcomeSurvived}
              </button>
              <button
                className="primary danger"
                onClick={() => onSetBunkerOutcome("failed")}
              >
                {ru.bunkerOutcomeFailed}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isMobile && dossierOpen ? (
        <div
          className="mobile-dossier-backdrop"
          onClick={() => {
            setDossierOpen(false);
            onClearMobileDossierError?.();
          }}
        >
          <div
            className="mobile-dossier-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-dossier-modal-header">
              <button
                className="icon-button"
                onClick={() => {
                  setDossierOpen(false);
                  onClearMobileDossierError?.();
                }}
              >
                ✕
              </button>
            </div>
            <div className="mobile-dossier-body">
              {mobileDossierError ? (
                <div className="mobile-dossier-error" role="alert">
                  {mobileDossierError}
                </div>
              ) : null}
              <MobileDossierPanel />
              <div className="mobile-dossier-footer">
                <button
                  className="primary"
                  disabled={!canReveal || !selectedCardId || !canRevealSelectedCard}
                  onClick={() => selectedCardId && onRevealCard(selectedCardId)}
                >
                  {canRevealPostGame ? ru.revealPostGameAction : ru.revealAction}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={isMobile && mobileDeckModal !== null && !!world}
        title={
          mobileDeckModal === "bunker"
            ? "Бункер"
            : mobileDeckModal === "threat"
              ? "Угроза"
              : "Катастрофа"
        }
        onClose={() => setMobileDeckModal(null)}
        dismissible={true}
        className="mobile-deck-modal"
      >
        {world ? (
          <div className="mobile-deck-body">
            {mobileDeckModal === "bunker" ? (
              <div className="mobile-deck-grid">
                {world.bunker.map((card, index) => {
                  const label = `Бункер #${index + 1}`;
                  const revealed = card.isRevealed;
                  const faceUrl = revealed ? getWorldImage(card.imageId) : undefined;
                  const backUrl = getCardBackUrl("Бункер");
                  return (
                    <div key={card.id} className="mobile-deck-card">
                      <CardTile src={revealed ? faceUrl : backUrl} fallback={label} />
                      <div className="mobile-deck-title">{revealed ? card.title : label}</div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {mobileDeckModal === "disaster" ? (
              <div className="mobile-deck-single">
                {canDecidePostGameOutcome ? (
                  <div className="mobile-outcome-actions">
                    <button
                      className="primary world-outcome-button success"
                      onClick={() => onSetBunkerOutcome("survived")}
                    >
                      {ru.bunkerOutcomeSurvived}
                    </button>
                    <button
                      className="primary world-outcome-button danger"
                      onClick={() => onSetBunkerOutcome("failed")}
                    >
                      {ru.bunkerOutcomeFailed}
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="mobile-deck-card mobile-deck-card--single"
                >
                  <CardTile
                    src={getWorldImage(world.disaster.imageId)}
                    fallback="Катастрофа"
                  />
                  <div className="mobile-deck-title">{world.disaster.title}</div>
                </button>
              </div>
            ) : null}

            {mobileDeckModal === "threat" ? (
              <div className="mobile-deck-grid">
                {visibleWorldThreats.map((card, index) => {
                  const label = `Угроза #${index + 1}`;
                  const revealed = card.isRevealed;
                  const faceUrl = revealed ? getWorldImage(card.imageId) : undefined;
                  const backUrl = getCardBackUrl("Угроза");
                  const canReveal = canRevealThreats && !revealed;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className="mobile-deck-card"
                      onClick={() => {
                        if (canReveal) {
                          onRevealWorldThreat(index);
                        }
                      }}
                    >
                      <CardTile src={revealed ? faceUrl : backUrl} fallback={label} />
                      <div className="mobile-deck-title">{revealed ? card.title : label}</div>
                      {canReveal ? (
                        <div className="mobile-deck-hint">Нажмите, чтобы раскрыть</div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="muted">Условия мира не загружены.</div>
        )}
        <div className="mobile-deck-footer">
          <button className="ghost" onClick={() => setMobileDeckModal(null)}>
            {ru.closeButton}
          </button>
        </div>
      </Modal>

      <Modal
        open={voteModalOpen}
        title={ru.votingModalTitle}
        onClose={() => setVoteModalOpen(false)}
        dismissible={true}
        className="vote-modal"
      >
        {votePhase === "voting" ? (
          <div className="vote-modal-layout">
            <div className="vote-modal-section">
              <div className="muted">{yourVoteLabel}</div>
              {yourVoteWeight > 1 ? <div className="muted">{ru.votingWeightHint(yourVoteWeight)}</div> : null}
              <select value={voteTargetId ?? ""} onChange={(event) => setVoteTargetId(event.target.value)}>
                <option value="" disabled>
                  {ru.selectPlayerPlaceholder}
                </option>
                {alivePlayers
                  .filter((player) => player.playerId !== you?.playerId)
                  .map((player) => (
                    <option
                      key={player.playerId}
                      value={player.playerId}
                      disabled={disallowedVoteTargetSet.has(player.playerId)}
                    >
                      {player.name}
                      {disallowedVoteTargetSet.has(player.playerId) ? ` (${ru.voteTargetBlockedPlanBSuffix})` : ""}
                    </option>
                  ))}
              </select>
              <button
                className="primary"
                disabled={!canVote || !voteTargetId || selectedVoteTargetDisallowed}
                onClick={() => voteTargetId && onVote(voteTargetId)}
              >
                {ru.voteButton}
              </button>
              {!canVote ? <div className="muted">{ru.alreadyVoted}</div> : null}
              {canVote && selectedVoteTargetDisallowed ? (
                <div className="muted">{ru.voteTargetBlockedPlanB}</div>
              ) : null}
            </div>
            <div className="vote-modal-right">
              <div className="panel-subtitle">{ru.voteCandidateTitle}</div>
              {!voteTargetId ? (
                <div className="muted">{ru.voteCandidateHint}</div>
              ) : (
                <div className="vote-candidate-grid">
                  {categoryOrder.map((category) => {
                    const slot = selectedVotePlayer?.categories.find((entry) => entry.category === category);
                    const labels =
                      slot && slot.status === "revealed" && slot.cards.length > 0
                        ? slot.cards.map((card) => card.labelShort ?? "—").join(", ")
                        : ru.slotHidden;

                    return (
                      <div key={category} className="vote-candidate-card">
                        <span className="vote-candidate-text">
                          {category}: {labels}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {votePhase === "voteResolve" ? (
          <div className="vote-modal-section">
            <div className="panel-subtitle">{ru.votingResolveTitle}</div>
            <div>{gameView.public.resolutionNote ?? ru.votingResolveEmpty}</div>
            <div className="vote-summary-list">
              {votesPublic.map((vote) => (
                <div key={vote.voterId} className="vote-summary-row">
                  <span>{vote.voterName}</span>
                  <span>
                    {vote.status === "voted" && vote.targetName
                      ? vote.reason
                        ? `${ru.voteAgainst(vote.targetName)} (${vote.reason})${(vote.weight ?? 1) > 1 ? ` x${vote.weight}` : ""}`
                        : `${ru.voteAgainst(vote.targetName)}${(vote.weight ?? 1) > 1 ? ` x${vote.weight}` : ""}`
                      : vote.status === "invalid"
                        ? ru.voteInvalid(vote.reason ?? ru.voteNotVoted)
                        : ru.voteNotVoted}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!isMobile && worldModalOpen && !!world}
        title="Карты мира"
        onClose={() => setWorldModalOpen(false)}
        dismissible={true}
        className="world-modal"
      >
        {world ? (
          <div className="world-modal-layout">
            <div className="world-columns">
              <div
                className="world-column world-column-left world-column-grid"
                style={
                  {
                    "--card-rows": Math.max(1, Math.ceil(world.bunker.length / 2)),
                  } as CSSProperties
                }
              >
                {world.bunker.map((card, index) => {
                  const isSoloLast = world.bunker.length % 2 === 1 && index === world.bunker.length - 1;
                  const label = `Бункер #${index + 1}`;
                  const revealed = card.isRevealed;
                  const faceUrl = revealed ? getWorldImage(card.imageId) : undefined;
                  const backUrl = getCardBackUrl("Бункер");
                  return (
                    <div
                      key={card.id}
                      className={`world-slot ${revealed ? "revealed clickable" : "hidden"}${
                        isSoloLast ? " world-slot--solo" : ""
                      }`}
                      role={revealed ? "button" : undefined}
                      tabIndex={revealed ? 0 : -1}
                      onClick={() => {
                        if (!revealed) return;
                        openWorldDetail({
                          kind: "Бункер",
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
                            kind: "Бункер",
                            title: card.title || label,
                            description: card.description,
                            imageUrl: faceUrl,
                            label,
                          });
                        }
                      }}
                    >
                      <div className="world-slot-header">Бункер</div>
                      <div className="world-slot-media">
                        <CardTile
                          src={revealed ? faceUrl : backUrl}
                          fallback={label}
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
                {canDecidePostGameOutcome ? (
                  <div className="world-outcome-actions">
                    <button
                      className="primary world-outcome-button success"
                      onClick={() => onSetBunkerOutcome("survived")}
                    >
                      {ru.bunkerOutcomeSurvived}
                    </button>
                    <button
                      className="primary world-outcome-button danger"
                      onClick={() => onSetBunkerOutcome("failed")}
                    >
                      {ru.bunkerOutcomeFailed}
                    </button>
                  </div>
                ) : null}
                {showThreatModifier ? (
                  <div className="world-threat-modifier">{threatModifierText}</div>
                ) : null}
                <div
                  className="world-center-media"
                  onClick={() =>
                    openWorldDetail({
                      kind: "Катастрофа",
                      title: world.disaster.title,
                      description: world.disaster.description,
                      imageUrl: getWorldImage(world.disaster.imageId),
                      label: "Катастрофа",
                    })
                  }
                  role="button"
                  tabIndex={0}
                >
                  <CardTile
                    src={getWorldImage(world.disaster.imageId)}
                    fallback="Катастрофа"
                  />
                </div>
              </div>

              <div
                className="world-column world-column-right world-column-grid"
                style={
                  {
                    "--card-rows": Math.max(1, Math.ceil(visibleWorldThreats.length / 2)),
                  } as CSSProperties
                }
              >
                {visibleWorldThreats.map((card, index) => {
                  const isSoloLast =
                    visibleWorldThreats.length % 2 === 1 && index === visibleWorldThreats.length - 1;
                  const label = `Угроза #${index + 1}`;
                  const revealed = card.isRevealed;
                  const faceUrl = revealed ? getWorldImage(card.imageId) : undefined;
                  const backUrl = getCardBackUrl("Угроза");
                  const canReveal = canRevealThreats && !revealed;
                  return (
                    <div
                      key={card.id}
                      className={`world-slot ${revealed ? "revealed clickable" : "hidden"} ${canReveal ? "clickable" : ""}${
                        isSoloLast ? " world-slot--solo" : ""
                      }`}
                      onClick={() => {
                        if (!revealed && canReveal) {
                          onRevealWorldThreat(index);
                          return;
                        }
                        if (revealed) {
                          openWorldDetail({
                            kind: "Угроза",
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
                              kind: "Угроза",
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
                      <div className="world-slot-header">Угроза</div>
                      <div className="world-slot-media">
                        <CardTile
                          src={revealed ? faceUrl : backUrl}
                          fallback={label}
                        />
                      </div>
                      <div className="world-slot-footer">
                        <div className="world-slot-title">{revealed ? card.title : label}</div>
                      </div>
                      {canReveal ? (
                        <div className="world-slot-hint">Нажмите, чтобы раскрыть</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {worldDetail ? (
                <div
                  className="world-detail-overlay"
                  onClick={() => setWorldDetail(null)}
                >
                  <div
                    className="world-detail-card"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <div className="world-detail-header">
                      <div className="world-detail-kind">{worldDetail.kind}</div>
                      <button
                        className="icon-button"
                        onClick={() => setWorldDetail(null)}
                        aria-label="Закрыть"
                      >
                        ×
                      </button>
                    </div>
                    <div className="world-detail-title">{worldDetail.title}</div>
                    <div className="world-detail-media">
                      {worldDetail.imageUrl ? (
                        <img
                          src={worldDetail.imageUrl}
                          alt={worldDetail.label}
                          loading="lazy"
                          decoding="async"
                        />
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
          <div className="muted">Условия мира не загружены.</div>
        )}
        {isMobile ? (
          <div className="world-modal-footer">
            <button className="ghost" onClick={() => setWorldModalOpen(false)}>
              {ru.closeButton}
            </button>
          </div>
        ) : null}
      </Modal>

      {postGame?.outcome ? (
        <div className="postgame-overlay" role="dialog" aria-modal="true">
          <div className="postgame-card">
            <div className="postgame-title">
              {postGame.outcome === "survived" ? ru.postGameSuccessTitle : ru.postGameFailedTitle}
            </div>
            <div className="postgame-text">
              {postGame.outcome === "survived" ? ru.postGameSuccessText : ru.postGameFailedText}
            </div>
            <button className="primary postgame-exit" onClick={onExitGame}>
              {ru.exitButton}
            </button>
          </div>
        </div>
      ) : null}

      {!isMobileNarrow ? (
        <Modal
          open={Boolean(specialDialog)}
          title={specialDialog?.title}
          onClose={closeSpecialDialog}
          dismissible={true}
        >
          {specialDialog?.description ? <div className="muted">{specialDialog.description}</div> : null}
          {specialDialog && specialDialog.kind !== "none" ? (
            <>
              {specialDialog.options.length === 0 ? (
                <div className="muted">{ru.noTargetCandidates}</div>
              ) : (
                <>
                  {isPlayerCardPickerDialog && specialDialog?.cardPicker?.requireSourceCard ? (
                    <>
                      <div className="muted">1) Ваша карта</div>
                      <select
                        value={dialogSourceCardSelection}
                        onChange={(event) => setDialogSourceCardSelection(event.target.value)}
                        disabled={dialogSourceCards.length === 0}
                      >
                        <option value="" disabled>
                          Выберите свою карту
                        </option>
                        {dialogSourceCards.map((card) => (
                          <option key={card.instanceId} value={card.instanceId}>
                            {card.hint}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

                  {isPlayerCardPickerDialog && specialDialog?.cardPicker?.requireSourceCard ? (
                    <div className="muted">2) Игрок</div>
                  ) : null}
                  <select
                    value={dialogSelection}
                    onChange={(event) => selectDialogPlayer(event.target.value)}
                    disabled={specialDialog.options.length === 0}
                  >
                    <option value="" disabled>
                      {isPlayerCardPickerDialog && specialDialog?.cardPicker?.requireSourceCard
                        ? "Выберите игрока"
                        : ru.modalSelect}
                    </option>
                    {specialDialog.options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {isPlayerCardPickerDialog && dialogSelection ? (
                    <>
                      {specialDialog?.cardPicker?.requireSourceCard ? (
                        <div className="muted">3) Карта игрока</div>
                      ) : (
                        <div className="muted">Карта игрока</div>
                      )}
                      <select
                        value={dialogTargetCardSelection}
                        onChange={(event) => setDialogTargetCardSelection(event.target.value)}
                        disabled={dialogTargetCards.length === 0}
                      >
                        <option value="" disabled>
                          Выберите карту игрока
                        </option>
                        {dialogTargetCards.map((card) => (
                          <option key={card.instanceId} value={card.instanceId}>
                            {card.hint}
                          </option>
                        ))}
                      </select>
                      {selectedTargetCardHint ? (
                        <div className="muted">
                          {specialDialog?.cardPicker?.requireSourceCard && selectedSourceCardHint
                            ? `Ваша карта: ${selectedSourceCardHint} - Карта игрока: ${selectedTargetCardHint}`
                            : `Карта игрока: ${selectedTargetCardHint}`}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </>
          ) : null}
          <div className="modal-actions">
            <button className="ghost" onClick={closeSpecialDialog}>
              {ru.modalCancel}
            </button>
            <button
              className="primary"
              disabled={!canSubmitSpecialDialog}
              onClick={submitSpecialDialog}
            >
              {ru.modalApply}
            </button>
          </div>
        </Modal>
      ) : null}

      {isMobileNarrow && specialDialog ? (
        <div className="mobile-special-backdrop" onClick={closeSpecialDialog}>
          <div
            className="mobile-special-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-special-header">
              <div className="mobile-special-title">{specialDialog.title}</div>
              <button className="icon-button" onClick={closeSpecialDialog}>
                ✕
              </button>
            </div>
            {specialDialog.description ? (
              <div className="muted mobile-special-description">{specialDialog.description}</div>
            ) : null}
            <div className="mobile-special-body">
              {specialDialog.options.length === 0 ? (
                <div className="muted">{ru.noTargetCandidates}</div>
              ) : (
                <>
                  {isPlayerCardPickerDialog && specialDialog?.cardPicker?.requireSourceCard ? (
                    <>
                      <div className="muted">1) Ваша карта</div>
                      <select
                        value={dialogSourceCardSelection}
                        onChange={(event) => setDialogSourceCardSelection(event.target.value)}
                        disabled={dialogSourceCards.length === 0}
                      >
                        <option value="" disabled>
                          Выберите свою карту
                        </option>
                        {dialogSourceCards.map((card) => (
                          <option key={card.instanceId} value={card.instanceId}>
                            {card.hint}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : null}

                  {isPlayerCardPickerDialog && specialDialog?.cardPicker?.requireSourceCard ? (
                    <div className="muted">2) Игрок</div>
                  ) : null}
                  <div className="mobile-special-options">
                    {specialDialog.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`mobile-special-option${dialogSelection === option.id ? " selected" : ""}`}
                        onClick={() => selectDialogPlayer(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>

                  {isPlayerCardPickerDialog && dialogSelection ? (
                    <>
                      {specialDialog?.cardPicker?.requireSourceCard ? (
                        <div className="muted">3) Карта игрока</div>
                      ) : (
                        <div className="muted">Карта игрока</div>
                      )}
                      <select
                        value={dialogTargetCardSelection}
                        onChange={(event) => setDialogTargetCardSelection(event.target.value)}
                        disabled={dialogTargetCards.length === 0}
                      >
                        <option value="" disabled>
                          Выберите карту игрока
                        </option>
                        {dialogTargetCards.map((card) => (
                          <option key={card.instanceId} value={card.instanceId}>
                            {card.hint}
                          </option>
                        ))}
                      </select>
                      {selectedTargetCardHint ? (
                        <div className="muted">
                          {specialDialog?.cardPicker?.requireSourceCard && selectedSourceCardHint
                            ? `Ваша карта: ${selectedSourceCardHint} - Карта игрока: ${selectedTargetCardHint}`
                            : `Карта игрока: ${selectedTargetCardHint}`}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </div>
            <div className="mobile-special-footer">
              <button className="ghost" onClick={closeSpecialDialog}>
                {ru.modalCancel}
              </button>
              <button
                className="primary"
                disabled={!canSubmitSpecialDialog}
                onClick={submitSpecialDialog}
              >
                {ru.modalApply}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
