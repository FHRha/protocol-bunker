import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { GameEvent, GameView, RoomState, SpecialConditionInstance, SpecialTargetScope } from "@bunker/shared";
import { computeNeighbors, getTargetCandidates } from "@bunker/shared";
import { getCurrentLocale, useUiLocaleNamespace, useUiLocaleNamespacesActivation } from "../localization";
import TableLayout from "../components/TableLayout";
import DossierMiniCard from "../components/DossierMiniCard";
import Modal from "../components/Modal";
import { getCardBackUrl, getCardFaceUrl, preloadCategoryBacks } from "../cards";
import { buildGameContextHints, type BuildGameHintsParams } from "../gameContextHints";
import {
  CATEGORY_KEY_ORDER,
  DOSSIER_GRID_ROW_KEYS,
  DOSSIER_MAIN_CATEGORY_KEY,
  PUBLIC_CATEGORY_ORDER,
  getCategoryDisplayLabel,
  getCategoryDisplayLabelFromRaw,
  getCategoryOptions,
  normalizeCategoryKey,
} from "../game/categoryPresentation";
import { CardTile } from "../game/CardTile";
import { GameDossierPanel } from "../game/GameDossierPanel";
import { GameMatchFeed } from "../game/GameMatchFeed";
import { GameMobileChatSheet } from "../game/GameMobileChatSheet";
import { GameMobileDossierPanel } from "../game/GameMobileDossierPanel";
import { GameSpecialDialog } from "../game/GameSpecialDialog";
import { GameVoteModal } from "../game/GameVoteModal";
import { GameWorldModal } from "../game/GameWorldModal";
import type {
  SpecialDialogCardPicker,
  SpecialDialogKind,
  SpecialDialogState,
  WorldDetailState,
} from "../game/gamePageTypes";

interface GamePageProps {
  roomState: RoomState | null;
  gameView: GameView | null;
  isControl: boolean;
  presenterModeEnabled: boolean;
  showHints: boolean;
  wsInteractive: boolean;
  eventLog: GameEvent[];
  onRevealCard: (cardId: string) => void;
  onVote: (targetPlayerId: string) => void;
  onApplySpecial: (specialInstanceId: string, payload?: Record<string, unknown>) => void;
  onFinalizeVoting: () => void;
  onContinueRound: () => void;
  onSendMatchMessage: (text: string) => void;
  onRevealWorldThreat: (index: number) => void;
  onSetBunkerOutcome: (outcome: "survived" | "failed") => void;
  onDevAddPlayer: (name?: string) => void;
  onDevRemovePlayer: (targetPlayerId?: string) => void;
  onExitGame: (options?: { skipConfirm?: boolean }) => void;
  mobileDossierError?: string | null;
  onMarkDossierSpecialAction?: () => void;
  onClearMobileDossierError?: () => void;
}

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

export default function GamePage({
  roomState,
  gameView,
  isControl,
  presenterModeEnabled,
  showHints,
  wsInteractive,
  eventLog,
  onRevealCard,
  onVote,
  onApplySpecial,
  onFinalizeVoting,
  onContinueRound,
  onSendMatchMessage,
  onRevealWorldThreat,
  onSetBunkerOutcome,
  onDevAddPlayer,
  onDevRemovePlayer,
  onExitGame,
  mobileDossierError,
  onMarkDossierSpecialAction,
  onClearMobileDossierError,
}: GamePageProps) {
  const gameFallbacks = useMemo(
    () => ["common", "voting", "special", "world", "dev", "format", "maps", "reconnect", "misc"] as const,
    []
  );
  useUiLocaleNamespacesActivation(["game", ...gameFallbacks]);
  const gameText = useUiLocaleNamespace("game", {
    fallbacks: gameFallbacks,
  });
  const gameLocale = useMemo(
    () => ({
      categoryProfession: gameText.t("categoryProfession"),
      categoryHealth: gameText.t("categoryHealth"),
      categoryHobby: gameText.t("categoryHobby"),
      categoryBaggage: gameText.t("categoryBaggage"),
      categoryFacts: gameText.t("categoryFacts"),
      categoryFact1: gameText.t("categoryFact1"),
      categoryFact2: gameText.t("categoryFact2"),
      categoryBiology: gameText.t("categoryBiology"),
      categorySpecial: gameText.t("categorySpecial"),
      phaseRevealDiscussionWithName: (name: string) =>
        gameText.t("phaseRevealDiscussionWithName", { name }),
      phaseRevealDiscussion: gameText.t("phaseRevealDiscussion"),
      phaseText: (phase: string) => gameText.t(`phaseText.${phase}`),
      noEvents: gameText.t("noEvents"),
      threatModifierText: (delta: number, reasons: string) =>
        gameText.t("threatModifierText", { delta: delta > 0 ? `+${delta}` : String(delta), reasons }),
      voteReasonCode: (code: string) => gameText.t(`voteReasonCode.${code}`),
      votingSummaryForcedSelf: (reason?: string) =>
        reason
          ? gameText.t("votingSummaryForcedSelfWithReason", { reason })
          : gameText.t("votingSummaryForcedSelf"),
      votingSummary: (name: string) => gameText.t("votingSummary", { name }),
      devCheckSeatLayout: gameText.t("devCheckSeatLayout"),
      devCheckStatePlayerSync: gameText.t("devCheckStatePlayerSync"),
      devCheckPlayerIdsUnique: gameText.t("devCheckPlayerIdsUnique"),
      devCheckHandIdsUnique: gameText.t("devCheckHandIdsUnique"),
      devCheckRoundProgress: gameText.t("devCheckRoundProgress"),
      devCheckThreatWindow: gameText.t("devCheckThreatWindow"),
      devCheckBunkerCount: gameText.t("devCheckBunkerCount"),
      devCheckBunkerCountNotSet: (total: number) => gameText.t("devCheckBunkerCountNotSet", { total }),
      devCheckNoWorldState: gameText.t("devCheckNoWorldState"),
      devCheckVoteDisallowedValid: gameText.t("devCheckVoteDisallowedValid"),
      devCheckEntries: (count: number) => gameText.t("devCheckEntries", { count }),
      devCheckUnknownTargets: (value: string) => gameText.t("devCheckUnknownTargets", { value }),
      devCheckVoteAllowedTargets: gameText.t("devCheckVoteAllowedTargets"),
      devCheckTargets: (count: number) => gameText.t("devCheckTargets", { count }),
      devCheckVoteUnavailable: gameText.t("devCheckVoteUnavailable"),
      devCheckSpecialButtonsValid: gameText.t("devCheckSpecialButtonsValid"),
      devCheckCards: (count: number) => gameText.t("devCheckCards", { count }),
      devCheckSelectPanel: gameText.t("devCheckSelectPanel"),
      devCheckNoName: gameText.t("devCheckNoName"),
      devCheckRevealPanel: gameText.t("devCheckRevealPanel"),
      devCheckOk: gameText.t("devCheckOk"),
      devCheckNoRevealedCards: gameText.t("devCheckNoRevealedCards"),
      devCheckNoPlayers: gameText.t("devCheckNoPlayers"),
      devCheckApplySpecialOpensChoice: gameText.t("devCheckApplySpecialOpensChoice"),
      devCheckNoTargetCardAutofill: gameText.t("devCheckNoTargetCardAutofill"),
      devCheckNoSourceCardAutofill: gameText.t("devCheckNoSourceCardAutofill"),
      devCheckDialogOpenedApplied: gameText.t("devCheckDialogOpenedApplied"),
      devCheckDialogNotClosed: gameText.t("devCheckDialogNotClosed"),
      devCheckDialogNotOpened: gameText.t("devCheckDialogNotOpened"),
      devCheckSkipNoChoiceCard: gameText.t("devCheckSkipNoChoiceCard"),
      devCheckCardsNotCropped: gameText.t("devCheckCardsNotCropped"),
      devCheckCropped: (count: number) => gameText.t("devCheckCropped", { count }),
      devCheckHintPrefix: gameText.t("devCheckHintPrefix"),
      hintWsOffline: gameText.t("hintWsOffline"),
      hintObserverMode: gameText.t("hintObserverMode"),
      hintRoundStartReveal: gameText.t("hintRoundStartReveal"),
      hintPickCard: gameText.t("hintPickCard"),
      hintRevealSelected: gameText.t("hintRevealSelected"),
      hintContinueRound: gameText.t("hintContinueRound"),
      hintWaitTurn: gameText.t("hintWaitTurn"),
      hintOpenVoteModal: gameText.t("hintOpenVoteModal"),
      hintVoteAlreadyDone: gameText.t("hintVoteAlreadyDone"),
      hintFinalizeVoteHost: gameText.t("hintFinalizeVoteHost"),
      hintFinalizeVoteWait: gameText.t("hintFinalizeVoteWait"),
      hintRevealThreats: gameText.t("hintRevealThreats"),
      hintDecideOutcome: gameText.t("hintDecideOutcome"),
      devCheckMissingHint: (expected: string, actual: string) => gameText.t("devCheckMissingHint", { expected, actual }),
      devCheckEmpty: gameText.t("devCheckEmpty"),
      worldBunkerCard: (index: number) => gameText.t("worldBunkerCard", { index }),
      unnamedCard: gameText.t("unnamedCard"),
      devPlayersInGame: (count: number) => gameText.t("devPlayersInGame", { count }),
      roundProgressLabel: (round: number, revealed: number, total: number) => gameText.t("roundProgressLabel", { round, revealed, total }),
      turnLabel: (name: string) => gameText.t("turnLabel", { name }),
      roundVoteIndexLabel: (current: number, total: number) => gameText.t("roundVoteIndexLabel", { current, total }),
      roundVotesLabel: (count: number) => gameText.t("roundVotesLabel", { count }),
      mandatoryCategory: (category: string) => gameText.t("mandatoryCategory", { category }),
      ruleNoTalk: gameText.t("ruleNoTalk"),
      wsActionDisabledHint: gameText.t("wsActionDisabledHint"),
      timerLabel: (kind: string, seconds: number) => gameText.t("timerLabel", { kind: gameText.t(`timerKind.${kind}`), seconds }),
      votePhaseLabel: (phase: string | null) => (phase ? gameText.t(`votePhase.${phase}`) : gameText.t("votePhaseNone")),
      votingProgressText: (voted: number, total: number) => gameText.t("votingProgressText", { voted, total }),
      worldThreatCard: (index: number) => gameText.t("worldThreatCard", { index }),
      votingWeightHint: (weight: number) => gameText.t("votingWeightHint", { weight }),
      slotHidden: gameText.t("slotHidden"),
      voteAgainst: (name: string) => gameText.t("voteAgainst", { name }),
      voteInvalid: (reason: string) => gameText.t("voteInvalid", { reason }),
      voteNotVoted: gameText.t("voteNotVoted"),
      dossierTitle: gameText.t("dossierTitle"),
      specialDialogSummaryWithSource: (source: string, target: string) =>
        gameText.t("specialDialogSummaryWithSource", { source, target }),
      specialDialogSummaryTargetOnly: (target: string) =>
        gameText.t("specialDialogSummaryTargetOnly", { target }),
    }),
    [gameText]
  );
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
  const [worldDetail, setWorldDetail] = useState<WorldDetailState | null>(null);
  const [matchFeedExpanded, setMatchFeedExpanded] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileChatSeenCount, setMobileChatSeenCount] = useState(0);
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
  const mobileChatSeenInitializedRef = useRef(false);
  const lastWorldEventRef = useRef<string | null>(null);
  const lastPostGameRef = useRef<number | null>(null);

  const you = gameView?.you;
  const publicPlayers = gameView?.public.players ?? [];
  const world = gameView?.world;
  const worldEvent = gameView?.worldEvent;
  const postGame = gameView?.postGame;
  const cardLocale = getCurrentLocale();
  const youStatus = publicPlayers.find((player) => player.playerId === you?.playerId)?.status ?? "alive";
  const youRevealedThisRound =
    gameView?.public.revealedThisRound.includes(you?.playerId ?? "") ?? false;
  const phase = gameView?.phase ?? "reveal";
  const votePhase = gameView?.public.votePhase ?? null;
  const votesPublic = gameView?.public.votesPublic ?? [];
  const matchMessages = gameView?.public.matchMessages ?? [];
  const mobileUnreadChatCount = isMobile && !mobileChatOpen ? Math.max(0, matchMessages.length - mobileChatSeenCount) : 0;
  const votingProgress = gameView?.public.votingProgress;
  const disallowedVoteTargetIdsForYou = gameView?.public.disallowedVoteTargetIdsForYou ?? [];
  const voteCandidateIds = gameView?.public.voteCandidateIds ?? [];
  const disallowedVoteTargetSet = useMemo(
    () => new Set(disallowedVoteTargetIdsForYou),
    [disallowedVoteTargetIdsForYou]
  );
  const voteCandidateSet = useMemo(() => new Set(voteCandidateIds), [voteCandidateIds]);
  const voteModalOpenFlag = gameView?.public.voteModalOpen ?? false;
  const activeTimer = gameView?.public.activeTimer ?? null;
  const isHost = roomState?.hostId === you?.playerId;
  const useOverlayControl = Boolean(presenterModeEnabled && isControl);
  const categoryOrder = gameView?.categoryOrder ?? [];
  const mainCategories = useMemo(
    () =>
      categoryOrder
        .map((category) => normalizeCategoryKey(category))
        .filter((category) => Boolean(category) && category !== "special"),
    [categoryOrder]
  );
  const handByInstanceId = useMemo(
  () => new Map((you?.hand ?? []).map((card) => [card.instanceId, card] as const)),
  [you?.hand]
  );
  const orderedDossierCategories = useMemo(() => {
    const categorySet = new Set(mainCategories);
    const ordered = [
      DOSSIER_MAIN_CATEGORY_KEY,
      ...DOSSIER_GRID_ROW_KEYS.flat(),
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
  const publicPlayerStatusById = useMemo(() => {
    const next = new Map<string, (typeof publicPlayers)[number]["status"]>();
    for (const player of publicPlayers) {
      next.set(player.playerId, player.status);
    }
    return next;
  }, [publicPlayers]);
  const latestBotMessagesByPlayerId = useMemo(() => {
    const next = new Map<string, (typeof matchMessages)[number]>();
    for (let index = matchMessages.length - 1; index >= 0; index -= 1) {
      const message = matchMessages[index];
      if (!message) continue;
      if (message.kind !== "bot" || !message.sourcePlayerId) continue;
      if (publicPlayerStatusById.get(message.sourcePlayerId) !== "alive") continue;
      if (message.textKey === "match.bot.ruleBased.continue") {
        break;
      }
      next.set(message.sourcePlayerId, message);
      break;
    }
    return next;
  }, [matchMessages, publicPlayerStatusById]);
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
  const forcedRevealCategoryKey = normalizeCategoryKey(forcedRevealCategory);
  const forcedRevealCategoryHasHiddenCards = useMemo(() => {
    if (!forcedRevealCategoryKey) return false;
    const forcedSlot = you?.categories.find(
      (entry) => normalizeCategoryKey(entry.category) === forcedRevealCategoryKey
    );
    if (!forcedSlot) return false;
    return forcedSlot.cards.some((card) => !card.revealed && (canRevealPostGame || youStatus === "alive"));
  }, [canRevealPostGame, forcedRevealCategoryKey, you?.categories, youStatus]);
  const isCategoryLockedByForcedReveal = (category: string) =>
    Boolean(
      canRevealDuringGame &&
        forcedRevealCategoryKey &&
        forcedRevealCategoryHasHiddenCards &&
        normalizeCategoryKey(category) !== forcedRevealCategoryKey
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
        return normalizeCategoryKey(slot.category);
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
  const selectedVoteTargetDisallowed = voteTargetId
    ? disallowedVoteTargetSet.has(voteTargetId) || (voteCandidateSet.size > 0 && !voteCandidateSet.has(voteTargetId))
    : false;
  const currentTurnName = currentTurnPlayerId
    ? publicPlayers.find((player) => player.playerId === currentTurnPlayerId)?.name ?? ""
    : "";
  const latestEvent = eventLog[0];
  const phaseLabel =
    phase === "reveal_discussion"
      ? (() => {
          const shortName = formatPlayerNameShort(currentTurnName, 16);
          return shortName
            ? gameLocale.phaseRevealDiscussionWithName(shortName)
            : gameLocale.phaseRevealDiscussion;
        })()
      : gameLocale.phaseText(phase);
  const statusMessage = gameView?.lastStageText ?? latestEvent?.message ?? gameLocale.noEvents;
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
    const reasons = threatModifier.reasons.join(", ");
    return gameLocale.threatModifierText(threatModifier.delta, reasons);
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
    preloadCategoryBacks(PUBLIC_CATEGORY_ORDER, cardLocale);
  }, [cardLocale, isMobile]);
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
    if (!isMobile) {
      setDossierOpen(false);
      setMobileChatOpen(false);
      setMobileChatSeenCount(matchMessages.length);
      mobileChatSeenInitializedRef.current = false;
      return;
    }
    if (!mobileChatSeenInitializedRef.current) {
      setMobileChatSeenCount(matchMessages.length);
      mobileChatSeenInitializedRef.current = true;
    }
  }, [isMobile, matchMessages.length]);
  useEffect(() => {
    if (!isMobile || !mobileChatOpen) return;
    setMobileChatSeenCount(matchMessages.length);
  }, [isMobile, mobileChatOpen, matchMessages.length]);
  useEffect(() => {
    if (!isMobile || (!dossierOpen && !mobileChatOpen)) return;
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
  }, [isMobile, dossierOpen, mobileChatOpen]);
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
  }, [isMobile, isMobileNarrow, phase, votePhase, useOverlayControl, canDecidePostGameOutcome, isDevScenario, mobileUnreadChatCount]);
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
        message: gameText.t("mobileBannerRoundStartMessage"),
        cta: gameText.t("mobileBannerRoundStartCta"),
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
        message: gameText.t("mobileBannerPostGameMessage"),
        cta: gameText.t("mobileBannerPostGameCta"),
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
  const voteReasonText = (reasonCode?: string, reason?: string) => {
    const direct = String(reason ?? "").trim();
    if (direct) return direct;
    const code = String(reasonCode ?? "").trim();
    if (!code) return "";
    return gameLocale.voteReasonCode(code);
  };
  const yourVoteLabel = useMemo(() => {
    const vote = yourVoteEntry;
    if (!vote || vote.status !== "voted" || !vote.targetName) return gameText.t("votingSummaryNone");
    if (vote.targetId === you?.playerId) {
      return gameLocale.votingSummaryForcedSelf(voteReasonText(vote.reasonCode, vote.reason) || undefined);
    }
    return gameLocale.votingSummary(vote.targetName);
  }, [yourVoteEntry, you?.playerId]);
  const yourVoteWeight = useMemo(() => {
    if (!yourVoteEntry) return 1;
    const weight = Number(yourVoteEntry.weight ?? 1);
    return Number.isFinite(weight) && weight > 0 ? weight : 1;
  }, [yourVoteEntry]);
  const yourVoteDisabledBySpecial = useMemo(() => {
    if (!yourVoteEntry || yourVoteEntry.status !== "invalid") return false;
    const reasonCode = String(yourVoteEntry.reasonCode ?? "");
    return reasonCode === "VOTE_BLOCKED" || reasonCode === "VOTE_SPENT";
  }, [yourVoteEntry]);
  const selectedVotePlayer = useMemo(
    () => publicPlayers.find((entry) => entry.playerId === voteTargetId) ?? null,
    [publicPlayers, voteTargetId]
  );

  useEffect(() => {
    if (!voteTargetId) return;
    if (!disallowedVoteTargetSet.has(voteTargetId) && (voteCandidateSet.size === 0 || voteCandidateSet.has(voteTargetId))) return;
    setVoteTargetId(null);
  }, [disallowedVoteTargetSet, voteCandidateSet, voteTargetId]);
  const selectedBoardPlayer = publicPlayers.find((entry) => entry.playerId === selectedPlayerId) ?? null;
  const selectedBoardIsYou = selectedBoardPlayer?.playerId === you?.playerId;
  const showOwnSelectedFacesImmediately = roomState?.scenarioMeta.id !== "classic";
  
  const selectedBoardLabel = selectedBoardPlayer
    ? selectedBoardPlayer.playerId === you?.playerId
      ? `${selectedBoardPlayer.name} (${gameText.t("youBadge")})`
      : selectedBoardPlayer.name
    : "";

  const selectedCategoryRows = Math.ceil(PUBLIC_CATEGORY_ORDER.length / 2);
  const votingSpecials = useMemo(() => {
    const specials = you?.specialConditions ?? [];
    return specials.filter(
      (special) =>
        special.implemented &&
        !special.used &&
        special.trigger !== "onOwnerEliminated" &&
        special.trigger !== "secret_onEliminate" &&
        !(phase === "voting" && yourVoteDisabledBySpecial && VOTING_ONLY_EFFECTS.has(special.effect.type))
    );
  }, [phase, you?.specialConditions, yourVoteDisabledBySpecial]);
  const showVotingSpecialsSection =
    votePhase === "voting" || votePhase === "voteSpecialWindow";
  const showFinalizeVoting = !useOverlayControl && isControl && votePhase === "voteSpecialWindow";
  const continueRoundBlockedBySpecial = specialActionLock || Boolean(specialDialog);
  const canContinueRoundNow =
    Boolean(wsInteractive && gameView?.public.canContinue && !continueRoundBlockedBySpecial);
  const contextHints = showHints
    ? buildGameContextHints({
        wsInteractive,
        phase,
        votePhase,
        youStatus,
        round: gameView?.round ?? 1,
        roundRevealedCount,
        canReveal,
        selectedCardId,
        canRevealSelectedCard,
        canContinueRound: canContinueRoundNow,
        canOpenVotingModal: Boolean(gameView?.public.canOpenVotingModal),
        canVote,
        showFinalizeVoting,
        canRevealThreats,
        postGameActive: Boolean(postGame?.isActive),
        canDecidePostGameOutcome,
      }, {
        hintWsOffline: gameText.t("hintWsOffline"),
        hintObserverMode: gameText.t("hintObserverMode"),
        hintRoundStartReveal: gameText.t("hintRoundStartReveal"),
        hintOpenVoteModal: gameText.t("hintOpenVoteModal"),
        hintVoteAlreadyDone: gameText.t("hintVoteAlreadyDone"),
        hintFinalizeVoteHost: gameText.t("hintFinalizeVoteHost"),
        hintFinalizeVoteWait: gameText.t("hintFinalizeVoteWait"),
        hintPickCard: gameText.t("hintPickCard"),
        hintRevealSelected: gameText.t("hintRevealSelected"),
        hintContinueRound: gameText.t("hintContinueRound"),
        hintWaitTurn: gameText.t("hintWaitTurn"),
        hintRevealThreats: gameText.t("hintRevealThreats"),
        hintDecideOutcome: gameText.t("hintDecideOutcome"),
      })
    : [];

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
      label: gameLocale.devCheckSeatLayout,
      status: seatCount === publicPlayers.length ? "pass" : "fail",
      detail: `${seatCount}/${publicPlayers.length}`,
    });

    const roomPlayerIds = new Set((roomState?.players ?? []).map((player) => player.playerId));
    const publicPlayerIds = publicPlayers.map((player) => player.playerId);
    const publicPlayerSet = new Set(publicPlayerIds);
    results.push({
      id: "state-player-sync",
      label: gameLocale.devCheckStatePlayerSync,
      status:
        publicPlayerSet.size === publicPlayers.length &&
        publicPlayerIds.every((id) => roomPlayerIds.has(id)) &&
        Array.from(roomPlayerIds).every((id) => publicPlayerSet.has(id))
          ? "pass"
          : "fail",
      detail: `room=${roomPlayerIds.size}, public=${publicPlayerSet.size}`,
    });

    results.push({
      id: "public-player-id-unique",
      label: gameLocale.devCheckPlayerIdsUnique,
      status: publicPlayerSet.size === publicPlayers.length ? "pass" : "fail",
      detail: `${publicPlayerSet.size}/${publicPlayers.length}`,
    });

    const handIds = (you?.hand ?? [])
      .map((card) => String(card.instanceId ?? "").trim())
      .filter(Boolean);
    const handIdSet = new Set(handIds);
    results.push({
      id: "hand-instance-unique",
      label: gameLocale.devCheckHandIdsUnique,
      status: handIdSet.size === handIds.length ? "pass" : "fail",
      detail: `${handIdSet.size}/${handIds.length}`,
    });

    results.push({
      id: "round-progress-valid",
      label: gameLocale.devCheckRoundProgress,
      status:
        roundTotalAlive >= 0 &&
        roundRevealedCount >= 0 &&
        roundRevealedCount <= Math.max(0, roundTotalAlive)
          ? "pass"
          : "fail",
      detail: `${roundRevealedCount}/${roundTotalAlive}`,
    });

    if (world) {
      const threatsCapOk =
        worldThreatFinalCount >= 0 && worldThreatFinalCount <= world.threats.length;
      const visibleThreatsOk = visibleWorldThreats.length === worldThreatFinalCount;
      const bunkerCountRaw = world.counts?.bunker;
      const bunkerCountOk =
        typeof bunkerCountRaw !== "number" ||
        (Number.isFinite(bunkerCountRaw) &&
          Math.trunc(bunkerCountRaw) >= 0 &&
          Math.trunc(bunkerCountRaw) <= world.bunker.length);
      results.push({
        id: "world-threats-window",
        label: gameLocale.devCheckThreatWindow,
        status: threatsCapOk && visibleThreatsOk ? "pass" : "fail",
        detail: `visible=${visibleWorldThreats.length}, final=${worldThreatFinalCount}, total=${world.threats.length}`,
      });
      results.push({
        id: "world-bunker-count",
        label: gameLocale.devCheckBunkerCount,
        status: bunkerCountOk ? "pass" : "fail",
        detail:
          typeof bunkerCountRaw === "number"
            ? `${Math.trunc(bunkerCountRaw)}/${world.bunker.length}`
            : gameLocale.devCheckBunkerCountNotSet(world.bunker.length),
      });
    } else {
      results.push({
        id: "world-threats-window",
        label: gameLocale.devCheckThreatWindow,
        status: "fail",
        detail: gameLocale.devCheckNoWorldState,
      });
      results.push({
        id: "world-bunker-count",
        label: gameLocale.devCheckBunkerCount,
        status: "fail",
        detail: gameLocale.devCheckNoWorldState,
      });
    }

    const unknownDisallowedTargets = disallowedVoteTargetIdsForYou.filter(
      (id) => !publicPlayerSet.has(id)
    );
    results.push({
      id: "vote-disallowed-known",
      label: gameLocale.devCheckVoteDisallowedValid,
      status: unknownDisallowedTargets.length === 0 ? "pass" : "fail",
      detail:
        unknownDisallowedTargets.length === 0
          ? gameLocale.devCheckEntries(disallowedVoteTargetIdsForYou.length)
          : gameLocale.devCheckUnknownTargets(unknownDisallowedTargets.join(", ")),
    });

    if (canVote) {
      const allowedTargets = publicPlayers.filter(
        (player) =>
          player.status === "alive" &&
          player.playerId !== you?.playerId &&
          !disallowedVoteTargetSet.has(player.playerId)
      );
      results.push({
        id: "vote-allowed-targets",
        label: gameLocale.devCheckVoteAllowedTargets,
        status: allowedTargets.length > 0 ? "pass" : "fail",
        detail: gameLocale.devCheckTargets(allowedTargets.length),
      });
    } else {
      results.push({
        id: "vote-allowed-targets",
        label: gameLocale.devCheckVoteAllowedTargets,
        status: "pass",
        detail: gameLocale.devCheckVoteUnavailable,
      });
    }

    const invalidSpecialButtons = votingSpecials.filter((special) => !canUseSpecialNow(special));
    results.push({
      id: "special-buttons-valid",
      label: gameLocale.devCheckSpecialButtonsValid,
      status: invalidSpecialButtons.length === 0 ? "pass" : "fail",
      detail:
        invalidSpecialButtons.length === 0
          ? gameLocale.devCheckCards(votingSpecials.length)
          : invalidSpecialButtons.map((s) => s.instanceId).join(", "),
    });

    const previousSelected = selectedPlayerId;
    const targetPlayer = publicPlayers[0];
    if (targetPlayer) {
      setSelectedPlayerId(targetPlayer.playerId);
      await waitFrame();
      const selectedName = document.querySelector(".selected-name")?.textContent ?? "";
      results.push({
        id: "select-panel",
        label: gameLocale.devCheckSelectPanel,
        status: selectedName.includes(targetPlayer.name) ? "pass" : "fail",
        detail: selectedName || gameLocale.devCheckNoName,
      });

      const firstRevealedCard = targetPlayer.categories
        .flatMap((slot) => slot.cards)
        .find((card) => Boolean(card.imgUrl));
      const expectedUrl = getCardFaceUrl(firstRevealedCard?.imgUrl);
      const images = Array.from(document.querySelectorAll<HTMLImageElement>(".selected-grid .card-tile img"));
      const hasExpected = expectedUrl ? images.some((img) => img.src.includes(expectedUrl)) : images.length > 0;
      results.push({
        id: "reveal-panel",
        label: gameLocale.devCheckRevealPanel,
        status: hasExpected ? "pass" : "fail",
        detail: hasExpected ? gameLocale.devCheckOk : gameLocale.devCheckNoRevealedCards,
      });
    } else {
      results.push({
        id: "select-panel",
        label: gameLocale.devCheckSelectPanel,
        status: "fail",
        detail: gameLocale.devCheckNoPlayers,
      });
      results.push({
        id: "reveal-panel",
        label: gameLocale.devCheckRevealPanel,
        status: "fail",
        detail: gameLocale.devCheckNoPlayers,
      });
    }

    const choiceCandidates = youSafe.specialConditions.filter((special) => {
      if (!special.implemented) return false;
      if (!isDevScenario && special.used) return false;
      if (!canUseSpecialNow(special)) return false;
      if (!hasTargetsForSpecial(special)) return false;
      if (!special.needsChoice && special.choiceKind === "none") return false;
      return true;
    });

    const specialPriority = (special: SpecialConditionInstance) => {
      const choiceKind = special.choiceKind ?? (special.needsChoice ? "player" : "none");
      const hasFixedCategory = Boolean(String(special.effect.params?.category ?? "").trim());
      const isComplexPlayerChoice =
        special.effect.type === "replaceRevealedCard" ||
        special.effect.type === "discardRevealedAndDealHidden" ||
        special.effect.type === "swapRevealedWithNeighbor" ||
        special.effect.type === "stealBaggage_and_giveSpecial";
      if (choiceKind === "category" && !hasFixedCategory) return 1;
      if (choiceKind === "special") return 2;
      if (choiceKind === "bunker") return 3;
      if (choiceKind === "neighbor") return 4;
      if (choiceKind === "player" && !isComplexPlayerChoice) return 5;
      if (choiceKind === "player") return 6;
      return 99;
    };

    const availableChoiceSpecial = choiceCandidates.sort(
      (a, b) => specialPriority(a) - specialPriority(b)
    )[0];

    if (availableChoiceSpecial) {
      handleApplySpecial(availableChoiceSpecial);
      await waitFrame();
      await waitFrame();
      const activeDialog = specialDialogRef.current;
      const opened = Boolean(activeDialog);
      if (opened && activeDialog?.options?.length) {
        const firstOption = activeDialog.options[0];
        if (activeDialog.kind === "player") {
          const payload: Record<string, unknown> = { targetPlayerId: firstOption.id };
          if (activeDialog.cardPicker) {
            const targetCards = getRevealedCategoryCards(
              firstOption.id,
              activeDialog.cardPicker.categoryKey
            );
            const targetCard = targetCards[0];
            if (!targetCard) {
              closeSpecialDialog();
              await waitFrame();
              await waitFrame();
              results.push({
                id: "special-modal",
                label: gameLocale.devCheckApplySpecialOpensChoice,
                status: "fail",
                detail: gameLocale.devCheckNoTargetCardAutofill,
              });
              setDevChecks(results);
              setSelectedPlayerId(previousSelected ?? null);
              return;
            }
            payload.targetCardInstanceId = targetCard.instanceId;
            if (activeDialog.cardPicker.requireSourceCard && you) {
              const ownCards = getRevealedCategoryCards(you.playerId, activeDialog.cardPicker.categoryKey);
              const ownCard = ownCards[0];
              if (!ownCard) {
                closeSpecialDialog();
                await waitFrame();
                await waitFrame();
                results.push({
                  id: "special-modal",
                  label: gameLocale.devCheckApplySpecialOpensChoice,
                  status: "fail",
                  detail: gameLocale.devCheckNoSourceCardAutofill,
                });
                setDevChecks(results);
                setSelectedPlayerId(previousSelected ?? null);
                return;
              }
              payload.sourceCardInstanceId = ownCard.instanceId;
            }
          }
          applySpecialAndLock(activeDialog.specialInstanceId, payload);
        } else if (activeDialog.kind === "neighbor") {
          applySpecialAndLock(activeDialog.specialInstanceId, { side: firstOption.id });
        } else if (activeDialog.kind === "category") {
          applySpecialAndLock(activeDialog.specialInstanceId, { category: firstOption.id });
        } else if (activeDialog.kind === "bunker") {
          const bunkerIndex = Number(firstOption.id);
          if (Number.isInteger(bunkerIndex)) {
            applySpecialAndLock(activeDialog.specialInstanceId, { bunkerIndex });
          }
        } else if (activeDialog.kind === "special") {
          applySpecialAndLock(activeDialog.specialInstanceId, { specialId: firstOption.id });
        } else if (activeDialog.kind === "baggage") {
          const [targetPlayerId, baggageCardId] = firstOption.id.split("::");
          if (targetPlayerId && baggageCardId) {
            applySpecialAndLock(activeDialog.specialInstanceId, { targetPlayerId, baggageCardId });
          }
        }
        closeSpecialDialog();
        await waitFrame();
        await waitFrame();
      }
      const closed = !specialDialogRef.current;
      results.push({
        id: "special-modal",
        label: gameLocale.devCheckApplySpecialOpensChoice,
        status: opened && closed ? "pass" : "fail",
        detail: opened
          ? closed
            ? gameLocale.devCheckDialogOpenedApplied
            : gameLocale.devCheckDialogNotClosed
          : gameLocale.devCheckDialogNotOpened,
      });
      closeSpecialDialog();
    } else {
      results.push({
        id: "special-modal",
        label: gameLocale.devCheckApplySpecialOpensChoice,
        status: "pass",
        detail: gameLocale.devCheckSkipNoChoiceCard,
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
      label: gameLocale.devCheckCardsNotCropped,
      status: cropViolations === 0 ? "pass" : "fail",
      detail: cropViolations === 0 ? gameLocale.devCheckOk : gameLocale.devCheckCropped(cropViolations),
    });

    const baseHintParams: BuildGameHintsParams = {
      wsInteractive: true,
      phase: "reveal",
      votePhase: null,
      youStatus: "alive",
      round: 2,
      roundRevealedCount: 0,
      canReveal: false,
      selectedCardId: null as string | null,
      canRevealSelectedCard: false,
      canContinueRound: false,
      canOpenVotingModal: false,
      canVote: false,
      showFinalizeVoting: false,
      canRevealThreats: false,
      postGameActive: false,
      canDecidePostGameOutcome: false,
    };

    const hintCases: Array<{
      id: string;
      label: string;
      expectedHintId: string;
      params: Partial<BuildGameHintsParams>;
    }> = [
      {
        id: "hint-ws-offline",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintWsOffline}`,
        expectedHintId: "ws-offline",
        params: { wsInteractive: false },
      },
      {
        id: "hint-observer-mode",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintObserverMode}`,
        expectedHintId: "observer-mode",
        params: { youStatus: "eliminated" },
      },
      {
        id: "hint-round-start",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintRoundStartReveal}`,
        expectedHintId: "round-start-reveal",
        params: { phase: "reveal", round: 1, roundRevealedCount: 0, canReveal: true },
      },
      {
        id: "hint-pick-card",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintPickCard}`,
        expectedHintId: "pick-card",
        params: { phase: "reveal", round: 2, canReveal: true, selectedCardId: null },
      },
      {
        id: "hint-reveal-selected",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintRevealSelected}`,
        expectedHintId: "reveal-selected",
        params: {
          phase: "reveal",
          canReveal: true,
          selectedCardId: "card-1",
          canRevealSelectedCard: true,
        },
      },
      {
        id: "hint-continue-round",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintContinueRound}`,
        expectedHintId: "continue-round",
        params: { phase: "reveal_discussion", canReveal: false, canContinueRound: true },
      },
      {
        id: "hint-wait-turn",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintWaitTurn}`,
        expectedHintId: "wait-turn",
        params: { phase: "reveal_discussion", canReveal: false, canContinueRound: false },
      },
      {
        id: "hint-open-vote",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintOpenVoteModal}`,
        expectedHintId: "open-vote-modal",
        params: {
          phase: "voting",
          votePhase: "voting",
          canOpenVotingModal: true,
          canVote: true,
        },
      },
      {
        id: "hint-voted",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintVoteAlreadyDone}`,
        expectedHintId: "vote-already-done",
        params: { phase: "voting", votePhase: "voting", canVote: false },
      },
      {
        id: "hint-finalize-host",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintFinalizeVoteHost}`,
        expectedHintId: "finalize-vote-host",
        params: { phase: "voting", votePhase: "voteSpecialWindow", showFinalizeVoting: true },
      },
      {
        id: "hint-finalize-wait",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintFinalizeVoteWait}`,
        expectedHintId: "finalize-vote-wait",
        params: { phase: "voting", votePhase: "voteSpecialWindow", showFinalizeVoting: false },
      },
      {
        id: "hint-reveal-threats",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintRevealThreats}`,
        expectedHintId: "reveal-threats",
        params: { phase: "ended", canRevealThreats: true },
      },
      {
        id: "hint-decide-outcome",
        label: `${gameLocale.devCheckHintPrefix}${gameLocale.hintDecideOutcome}`,
        expectedHintId: "decide-outcome",
        params: { phase: "ended", postGameActive: true, canDecidePostGameOutcome: true },
      },
    ];

    for (const testCase of hintCases) {
      const hintsForCase = buildGameContextHints({
        ...baseHintParams,
        ...testCase.params,
      }, {
        hintWsOffline: gameText.t("hintWsOffline"),
        hintObserverMode: gameText.t("hintObserverMode"),
        hintRoundStartReveal: gameText.t("hintRoundStartReveal"),
        hintOpenVoteModal: gameText.t("hintOpenVoteModal"),
        hintVoteAlreadyDone: gameText.t("hintVoteAlreadyDone"),
        hintFinalizeVoteHost: gameText.t("hintFinalizeVoteHost"),
        hintFinalizeVoteWait: gameText.t("hintFinalizeVoteWait"),
        hintPickCard: gameText.t("hintPickCard"),
        hintRevealSelected: gameText.t("hintRevealSelected"),
        hintContinueRound: gameText.t("hintContinueRound"),
        hintWaitTurn: gameText.t("hintWaitTurn"),
        hintRevealThreats: gameText.t("hintRevealThreats"),
        hintDecideOutcome: gameText.t("hintDecideOutcome"),
      });
      const ok = hintsForCase.some((hint) => hint.id === testCase.expectedHintId);
      results.push({
        id: testCase.id,
        label: testCase.label,
        status: ok ? "pass" : "fail",
        detail: ok
          ? gameLocale.devCheckOk
          : gameLocale.devCheckMissingHint(
              testCase.expectedHintId,
              hintsForCase.map((hint) => hint.id).join(", ") || gameLocale.devCheckEmpty
            ),
      });
    }

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
    const normalizedCategoryKey = normalizeCategoryKey(categoryKey);
    const result: Array<{ instanceId: string; hint: string }> = [];
    for (const slot of player.categories) {
      if (normalizeCategoryKey(slot.category) !== normalizedCategoryKey) continue;
      if (slot.status !== "revealed") continue;
      const slotLabel = getCategoryDisplayLabelFromRaw(slot.category, gameLocale);
      for (const card of slot.cards) {
        if (card.hidden) continue;
        const instanceId = String(card.instanceId ?? "").trim();
        if (!instanceId) continue;
        const cardLabel = String(card.labelShort ?? "").trim() || "—";
        result.push({ instanceId, hint: `${slotLabel}: ${cardLabel}` });
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
        label: `${gameLocale.worldBunkerCard(entry.index + 1)}: ${entry.card.title || entry.card.description || gameLocale.unnamedCard}`,
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
        const baggageSlot = targetPlayer?.categories.find(
          (entry) => normalizeCategoryKey(entry.category) === "baggage"
        );
        return (baggageSlot?.cards.length ?? 0) > 0;
      });
    }
    return options.length > 0;
  };

  const showNoTargetNotice =
    votingSpecials.length > 0 && !votingSpecials.some((special) => hasTargetsForSpecial(special));

  const canUseSpecialNow = (special: SpecialConditionInstance): boolean => {
    if (youStatus !== "alive") return false;
    if (!wsInteractive || !special.implemented || special.used) return false;
    if (special.trigger === "secret_onEliminate") return false;
    if (special.trigger === "onOwnerEliminated") return false;

    const isVotingEffect = VOTING_ONLY_EFFECTS.has(special.effect.type);
    if (phase === "voting" && yourVoteDisabledBySpecial && isVotingEffect) return false;
    if (!isDevScenario) {
      if (phase !== "voting" && isVotingEffect && votePhase !== "voteSpecialWindow") return false;
      if (phase !== "voting" && REVEAL_ONLY_EFFECTS.has(special.effect.type) && phase !== "reveal") return false;
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
      if (phase !== "voting" && isVotingOnly && votePhase !== "voteSpecialWindow") {
        return;
      }
      if (phase !== "voting" && isRevealOnly && phase !== "reveal") {
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
      openSpecialDialog(
        special.instanceId,
        gameText.t("specialDialogChooseCategory"),
        "category",
        getCategoryOptions(gameLocale),
        special.text
      );
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
        gameText.t("specialDialogChooseSpecial"),
        "special",
        options,
        special.text
      );
      return;
    }

    if (choiceKind === "bunker") {
      const options = getRevealedBunkerOptions();
      openSpecialDialog(
        special.instanceId,
        gameText.t("specialDialogChooseBunkerCard"),
        "bunker",
        options,
        special.text
      );
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
            player.playerId === you.playerId ? `${player.name} (${gameText.t("youBadge")})` : player.name;
          return { id: player.playerId, label };
        })
        .filter((entry): entry is { id: string; label: string } => Boolean(entry));

      if (targetScope === "neighbors") {
        const neighbors = computeNeighbors(orderRing, aliveSet, you.playerId);
        options = options.map((option) => {
          const prefix =
            option.id === neighbors.leftId
              ? gameText.t("specialDialogLeftPrefix")
              : option.id === neighbors.rightId
                ? gameText.t("specialDialogRightPrefix")
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
          targetScope === "neighbors" ? gameText.t("specialDialogChooseNeighbor") : gameText.t("specialDialogChoosePlayer"),
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
          const baggageSlot = targetPlayer.categories.find(
            (entry) => normalizeCategoryKey(entry.category) === "baggage"
          );
          const baggageCards = baggageSlot?.cards ?? [];
          return baggageCards
            .map((card, index) => {
              if (!card.instanceId) return null;
              const cardLabel = card.hidden ? gameText.t("specialDialogHiddenCard", { index: index + 1 }) : card.labelShort;
              return {
                id: `${option.id}::${card.instanceId}`,
                label: `${option.label} - ${cardLabel}`,
              };
            })
            .filter((entry): entry is { id: string; label: string } => Boolean(entry));
        });
        openSpecialDialog(
          special.instanceId,
          gameText.t("specialDialogChooseBaggage"),
          "baggage",
          baggageOptions,
          special.text
        );
        return;
      }

      openSpecialDialog(
        special.instanceId,
        targetScope === "neighbors" ? gameText.t("specialDialogChooseNeighbor") : gameText.t("specialDialogChoosePlayer"),
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
  if (!roomState || !gameView) {
    return (
      <div className="game-layout">
        <section className="panel game-loading">
          <h3>{gameText.t("gameLoadingTitle")}</h3>
          <div className="muted">{gameText.t("gameLoadingText")}</div>
        </section>
      </div>
    );
  }

  const youSafe = gameView.you;

  return (
    <div className="game-layout">
      <section className="panel game-status-bar">
        <div className="status-left">
          <div className="status-title">{gameText.t("gameStatusTitle")}</div>
          <div className="status-compact-primary">
            <span>
              {gameText.t("phaseLabel")}: {phaseLabel}
            </span>
            <span>{gameLocale.roundProgressLabel(gameView.round, roundRevealedCount, roundTotalAlive)}</span>
          </div>
          {currentTurnName || votesTotalThisRound > 0 ? (
            <div className="status-compact-secondary">
              {currentTurnName ? <span>{gameLocale.turnLabel(currentTurnName)}</span> : null}
              {votesTotalThisRound > 0 ? (
                <span>
                  {phase === "voting" && voteIndex > 0
                    ? gameLocale.roundVoteIndexLabel(voteIndex, votesTotalThisRound)
                    : gameLocale.roundVotesLabel(votesTotalThisRound)}
                </span>
              ) : null}
            </div>
          ) : null}
          {gameView.public.roundRules?.forcedRevealCategory ? (
            <div className="rule-pill">
              {gameLocale.mandatoryCategory(gameView.public.roundRules.forcedRevealCategory)}
            </div>
          ) : null}
          {gameView.public.roundRules?.noTalkUntilVoting ? (
            <div className="rule-pill">{gameLocale.ruleNoTalk}</div>
          ) : null}
          {!wsInteractive ? <div className="muted wsDisabledHint">{gameLocale.wsActionDisabledHint}</div> : null}
          {activeTimer && timerRemainingSec !== null ? (
            <div className="status-timer">{gameLocale.timerLabel(activeTimer.kind, timerRemainingSec)}</div>
          ) : null}
          {votePhase ? (
            <div className="status-voting">
              <div className="status-voting-line">
                <span>{gameText.t("votingTitle")}:</span>
                <span className="muted">{gameLocale.votePhaseLabel(votePhase)}</span>
                {votingProgress ? (
                  <span className="muted">{gameLocale.votingProgressText(votingProgress.voted, votingProgress.total)}</span>
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
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="game-main">
        {!isMobile ? (
          <section className={`panel dossier${isDevScenario ? " dossier--dev-scroll" : ""}`}>
            <GameDossierPanel
              you={youSafe}
              youStatus={youStatus}
              postGameActive={Boolean(postGame?.isActive)}
              gameText={gameText}
              gameLocale={gameLocale}
              canUseSpecialNow={canUseSpecialNow}
              handleApplySpecial={handleApplySpecial}
              orderedDossierCategories={orderedDossierCategories}
              isCategoryLockedByForcedReveal={isCategoryLockedByForcedReveal}
              expandedDossierKey={expandedDossierKey}
              selectedCardId={selectedCardId}
              isCardSelectableForReveal={isCardSelectableForReveal}
              setSelectedCardId={setSelectedCardId}
              setExpandedDossierKey={setExpandedDossierKey}
              canReveal={canReveal}
              canRevealSelectedCard={canRevealSelectedCard}
              canRevealPostGame={canRevealPostGame}
              onRevealCard={onRevealCard}
              isDevScenario={isDevScenario}
              publicPlayers={publicPlayers}
              currentPlayerId={you?.playerId}
              devRemoveTargetId={devRemoveTargetId}
              setDevRemoveTargetId={setDevRemoveTargetId}
              onDevAddPlayer={onDevAddPlayer}
              onDevRemovePlayer={onDevRemovePlayer}
              runDevChecks={runDevChecks}
              devChecks={devChecks}
              phase={phase}
              resolutionNote={gameView.public.resolutionNote}
            />
          </section>
        ) : null}

        <section className="panel board">
          <div className="board-layout">
            <div className="table-panel">
              <div className="panel-header table-panel-header">
                <div className="table-panel-header-main">
                  <h3>{gameText.t("boardTitle")}</h3>
                  <div className="muted">{gameText.t("boardSubtitle")}</div>
                </div>
                {contextHints.length > 0 ? (
                  <section className="game-context-hints game-context-hints--inline" aria-live="polite">
                    {contextHints.slice(0, 1).map((hint) => (
                      <div key={hint.id} className={`context-hint context-hint--inline context-hint--${hint.level}`}>
                        <span className="context-hint-dot" aria-hidden="true" />
                        <span>{hint.text}</span>
                      </div>
                    ))}
                  </section>
                ) : null}
              </div>
              {!isMobile && !useOverlayControl && phase === "reveal_discussion" ? (
                <div className="board-controls">
                  <button
                    className="primary button-small"
                    disabled={!canContinueRoundNow}
                    onClick={onContinueRound}
                  >
                    {gameText.t("continueRoundButton")}
                  </button>
                  <span className="muted">
                    {roomState?.settings.continuePermission === "host_only"
                      ? gameText.t("continueHintHost")
                      : roomState?.settings.continuePermission === "revealer_only"
                        ? gameText.t("continueHintRevealer")
                        : gameText.t("continueHintAnyone")}
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
                        <div className="mobile-world-label">{gameText.t("worldKindBunker")}</div>
                        <div className="mobile-world-media">
                          <CardTile
                            src={
                              mobileBunkerPreview?.isRevealed
                                ? getWorldImage(mobileBunkerPreview.imageId)
                                : getCardBackUrl("bunker", cardLocale)
                            }
                            fallback={gameText.t("worldKindBunker")}
                          />
                        </div>
                      </button>
                      <button
                        type="button"
                        className="mobile-world-card"
                        onClick={() => setMobileDeckModal("disaster")}
                      >
                        <div className="mobile-world-label">{gameText.t("worldKindDisaster")}</div>
                        <div className="mobile-world-media">
                          <CardTile
                            src={getWorldImage(world.disaster.imageId)}
                            fallback={gameText.t("worldKindDisaster")}
                          />
                        </div>
                      </button>
                      <button
                        type="button"
                        className="mobile-world-card"
                        onClick={() => setMobileDeckModal("threat")}
                      >
                        <div className="mobile-world-label">{gameText.t("worldKindThreat")}</div>
                        <div className="mobile-world-media">
                          <CardTile
                            src={
                              mobileThreatPreview?.isRevealed
                                ? getWorldImage(mobileThreatPreview.imageId)
                                : getCardBackUrl("threat", cardLocale)
                            }
                            fallback={gameText.t("worldKindThreat")}
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
                        const rawName = (player.name ?? "").trim() || gameText.t("playerFallback", { index: index + 1 });
                        const shortName = formatPlayerNameShort(rawName, 12);
                        const label = isYou ? `${shortName} (${gameText.t("youBadge")})` : shortName;
                        const fullLabel = isYou ? `${rawName} (${gameText.t("youBadge")})` : rawName;
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
                <div className={`table-container${matchFeedExpanded ? " table-container--chat-expanded" : ""}`}>
                  <GameMatchFeed
                    messages={matchMessages}
                    title={gameText.t("matchFeedTitle")}
                    emptyText={gameText.t("matchFeedEmpty")}
                    inputPlaceholder={gameText.t("matchFeedInputPlaceholder")}
                    activePlaceholder={gameText.t("matchFeedActivePlaceholder")}
                    onSendMessage={onSendMatchMessage}
                    onExpandedChange={setMatchFeedExpanded}
                  />
                  <TableLayout
                    players={publicPlayers}
                    youId={you?.playerId ?? null}
                    selectedId={selectedPlayerId}
                    onSelect={handleSelectPlayer}
                    world={world}
                    worldThreatsTotal={worldThreatFinalCount}
                    latestMessagesByPlayerId={latestBotMessagesByPlayerId}
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
                    {gameText.t("openVoting")}
                  </button>
                </div>
              ) : null}
                {showVotingSpecialsSection ? (
                  <div className="vote-special-inline">
                    <div className="vote-special-alert">
                      <div className="vote-special-alert-text">
                        {showHints ? <span className="vote-special-alert-icon">⚑</span> : null}
                        {showHints ? gameText.t("votingSpecialAlert") : gameText.t("voteSpecialFallbackAlert")}
                      </div>
                      <div className="vote-special-alert-actions">
                        {showFinalizeVoting ? (
                          <button
                            className="primary button-small"
                            disabled={!wsInteractive}
                            onClick={onFinalizeVoting}
                          >
                            {gameText.t("finalizeVoting")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {votingSpecials.length > 0 ? (
                      <div className="vote-special-panel">
                        <div className="special-list">
                          {showNoTargetNotice && !isMobile ? (
                            <div className="muted">{gameText.t("noTargetCandidates")}</div>
                          ) : null}
                          {votingSpecials.map((special) => (
                            <div key={special.instanceId} className="special-card">
                              <div className="special-header">
                                <div className="special-title">{special.title}</div>
                                <span className={`badge ${special.revealedPublic ? "revealed" : "hidden"}`}>
                                  {special.revealedPublic ? gameText.t("cardRevealed") : gameText.t("cardHidden")}
                                </span>
                              </div>
                              <div className="special-text">{special.text}</div>
                              <div className="special-actions">
                                <button
                                  className="primary"
                                  disabled={!wsInteractive || !canUseSpecialNow(special)}
                                  onClick={() => handleApplySpecial(special)}
                                >
                                  {gameText.t("useSpecialButton")}
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
                <div className="panel-subtitle">{gameText.t("selectedPlayerTitle")}</div>
                {selectedBoardPlayer ? <div className="selected-name">{selectedBoardLabel}</div> : null}
              </div>
              {selectedBoardPlayer ? (
                <div
                  className="selected-grid"
                  style={{ "--rows": selectedCategoryRows } as CSSProperties}
                >
                  {PUBLIC_CATEGORY_ORDER.map((category) => {
                      if (selectedBoardIsYou) {
                        if (category === "special") {
                          const publicSlot = selectedBoardPlayer.categories.find(
                            (entry) => normalizeCategoryKey(entry.category) === "special"
                          );
                          const publicCard = publicSlot?.cards?.[0];
                          const special = publicCard
                            ? you?.specialConditions?.find((entry) => entry.instanceId === publicCard.instanceId)
                            : you?.specialConditions?.[0];
                          const specialRevealed =
                            showOwnSelectedFacesImmediately || Boolean(special?.revealedPublic || (publicSlot?.status === "revealed" && publicCard && !publicCard.hidden));
                          const faceUrl = specialRevealed
                            ? getCardFaceUrl(special?.imgUrl ?? publicCard?.imgUrl)
                            : undefined;
                          const backUrl = getCardBackUrl(publicCard?.backCategory ?? "special", cardLocale);
                          return (
                            <CardTile
                              key={category}
                              src={faceUrl ?? backUrl}
                              fallback={category}
                              overlayLabel={isDevScenario && specialRevealed ? (special?.title ?? publicCard?.labelShort ?? category) : undefined}
                            />
                          );
                        }

                        const slot = you?.categories.find((entry) => normalizeCategoryKey(entry.category) === category);
                        const card = slot?.cards?.[0];
                        const handCard = card ? handByInstanceId.get(card.instanceId) : undefined;
                        const isRevealed = showOwnSelectedFacesImmediately || Boolean(card?.revealed || handCard?.revealed);
                        const faceUrl = isRevealed ? getCardFaceUrl(handCard?.imgUrl ?? card?.imgUrl) : undefined;
                        const backUrl = getCardBackUrl(category, cardLocale);

                        return (
                          <CardTile
                            key={category}
                            src={faceUrl ?? backUrl}
                            fallback={category}
                          />
                        );
                      }

					  const slot = selectedBoardPlayer.categories.find((entry) => normalizeCategoryKey(entry.category) === category);
					  const isRevealed = Boolean(slot && slot.status === "revealed" && slot.cards.length > 0);
					  const card = slot?.cards[0];
					  const faceUrl = isRevealed ? getCardFaceUrl(card?.imgUrl) : undefined;
					  const backUrl = getCardBackUrl(card?.backCategory ?? category, cardLocale);

					  if (isRevealed && !faceUrl) {
						return (
						  <CardTile
							key={category}
							src={backUrl}
							fallback={category}
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
                <div className="selected-empty muted">{gameText.t("selectedPlayerHint")}</div>
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
            {gameLocale.dossierTitle}
          </button>
          <button className="ghost mobile-action-chat" onClick={() => setMobileChatOpen(true)}>
            <span>{gameText.t("matchFeedInputPlaceholder")}</span>
            {mobileUnreadChatCount > 0 ? (
              <span className="mobile-action-chat-badge" aria-label={`+${mobileUnreadChatCount}`}>
                +{mobileUnreadChatCount > 99 ? "99" : mobileUnreadChatCount}
              </span>
            ) : null}
          </button>
          {isDevScenario ? (
            <div className="mobile-dev-quick-actions">
              <button className="ghost button-small" onClick={() => onDevAddPlayer()}>
                {gameText.t("devAddPlayer")}
              </button>
              <button className="ghost button-small" onClick={() => onDevRemovePlayer(undefined)}>
                {gameText.t("devRemoveButton")}
              </button>
            </div>
          ) : null}
          {!useOverlayControl && phase === "reveal_discussion" ? (
            <button
              className="primary"
              disabled={!canContinueRoundNow}
              onClick={onContinueRound}
            >
              {gameText.t("continueRoundButton")}
            </button>
          ) : null}
          {votePhase === "voting" ? (
            <button
              className="ghost"
              disabled={!wsInteractive || !gameView.public.canOpenVotingModal}
              onClick={() => setVoteModalOpen(true)}
            >
              {gameText.t("openVoting")}
            </button>
          ) : null}
          {isMobileNarrow && canDecidePostGameOutcome ? (
            <div className="mobile-outcome-row">
              <button
                className="primary success"
                onClick={() => onSetBunkerOutcome("survived")}
              >
                {gameText.t("bunkerOutcomeSurvived")}
              </button>
              <button
                className="primary danger"
                onClick={() => onSetBunkerOutcome("failed")}
              >
                {gameText.t("bunkerOutcomeFailed")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {isMobile && mobileChatOpen ? (
        <GameMobileChatSheet
          messages={matchMessages}
          title={gameText.t("matchFeedTitle")}
          emptyText={gameText.t("matchFeedEmpty")}
          inputPlaceholder={gameText.t("matchFeedInputPlaceholder")}
          activePlaceholder={gameText.t("matchFeedActivePlaceholder")}
          closeLabel={gameText.t("closeButton")}
          onClose={() => setMobileChatOpen(false)}
          onSendMessage={onSendMatchMessage}
        />
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
                aria-label={gameText.t("closeButton")}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <div className="mobile-dossier-body">
              {mobileDossierError ? (
                <div className="mobile-dossier-error" role="alert">
                  {mobileDossierError}
                </div>
              ) : null}
              <GameMobileDossierPanel
                you={youSafe}
                orderedDossierCategories={orderedDossierCategories}
                isCategoryLockedByForcedReveal={isCategoryLockedByForcedReveal}
                isCardSelectableForReveal={isCardSelectableForReveal}
                gameText={gameText}
                gameLocale={gameLocale}
                postGameActive={Boolean(postGame?.isActive)}
                youStatus={youStatus}
                canUseSpecialNow={canUseSpecialNow}
                handleApplySpecialFromDossier={handleApplySpecialFromDossier}
                selectedCardId={selectedCardId}
                setSelectedCardId={setSelectedCardId}
              />
            </div>
            <div className="mobile-dossier-footer">
              <button
                className="primary"
                disabled={!canReveal || !selectedCardId || !canRevealSelectedCard}
                onClick={() => selectedCardId && onRevealCard(selectedCardId)}
              >
                {canRevealPostGame ? gameText.t("revealPostGameAction") : gameText.t("revealAction")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <GameVoteModal
        open={voteModalOpen}
        onClose={() => setVoteModalOpen(false)}
        gameText={gameText}
        gameLocale={gameLocale}
        votePhase={votePhase}
        yourVoteLabel={yourVoteLabel}
        yourVoteWeight={yourVoteWeight}
        voteTargetId={voteTargetId}
        setVoteTargetId={setVoteTargetId}
        alivePlayers={alivePlayers}
        currentPlayerId={you?.playerId}
        disallowedVoteTargetSet={disallowedVoteTargetSet}
        voteCandidateSet={voteCandidateSet}
        canVote={canVote}
        selectedVoteTargetDisallowed={selectedVoteTargetDisallowed}
        onVote={onVote}
        categoryOrder={categoryOrder}
        selectedVotePlayer={selectedVotePlayer}
        votesPublic={votesPublic}
        resolutionNote={gameView.public.resolutionNote}
        voteReasonText={voteReasonText}
      />
      <GameWorldModal
        open={!isMobile && worldModalOpen && !!world}
        onClose={() => setWorldModalOpen(false)}
        world={world}
        isMobile={isMobile}
        cardLocale={cardLocale}
        gameText={gameText}
        gameLocale={gameLocale}
        canDecidePostGameOutcome={canDecidePostGameOutcome}
        onSetBunkerOutcome={onSetBunkerOutcome}
        showThreatModifier={showThreatModifier}
        threatModifierText={threatModifierText}
        getWorldImage={getWorldImage}
        visibleWorldThreats={visibleWorldThreats}
        canRevealThreats={canRevealThreats}
        onRevealWorldThreat={onRevealWorldThreat}
        showHints={showHints}
        openWorldDetail={openWorldDetail}
        worldDetail={worldDetail}
        onCloseWorldDetail={() => setWorldDetail(null)}
      />
      <Modal
        open={isMobile && mobileDeckModal !== null && !!world}
        title={gameText.t("worldModalTitle")}
        onClose={() => {
          setMobileDeckModal(null);
          setWorldDetail(null);
        }}
        dismissible={true}
        className="mobile-deck-modal"
      >
        {world && mobileDeckModal ? (
          <div className="mobile-deck-body">
            {mobileDeckModal === "bunker" ? (
              <div className="mobile-deck-grid">
                {world.bunker.map((card, index) => {
                  const label = gameLocale.worldBunkerCard(index + 1);
                  const revealed = card.isRevealed;
                  const imageUrl = revealed ? getWorldImage(card.imageId) : undefined;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className="mobile-deck-card"
                      disabled={!revealed}
                      onClick={() => {
                        if (!revealed) return;
                        openWorldDetail({
                          kind: gameText.t("worldKindBunker"),
                          title: card.title || label,
                          description: card.description,
                          imageUrl,
                          label,
                        });
                      }}
                    >
                      <CardTile src={imageUrl ?? getCardBackUrl("bunker", cardLocale)} fallback={label} />
                      <div className="mobile-deck-title">{revealed ? card.title || label : label}</div>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {mobileDeckModal === "disaster" ? (
              <button
                type="button"
                className="mobile-deck-card mobile-deck-card--single"
                onClick={() =>
                  openWorldDetail({
                    kind: gameText.t("worldKindDisaster"),
                    title: world.disaster.title,
                    description: world.disaster.description,
                    imageUrl: getWorldImage(world.disaster.imageId),
                    label: gameText.t("worldKindDisaster"),
                  })
                }
              >
                <div className="mobile-deck-title">{world.disaster.title}</div>
                <CardTile src={getWorldImage(world.disaster.imageId)} fallback={gameText.t("worldKindDisaster")} />
              </button>
            ) : null}
            {mobileDeckModal === "threat" ? (
              <>
                {showThreatModifier ? (
                  <div className="world-threat-modifier mobile-threat-modifier">{threatModifierText}</div>
                ) : null}
                <div className="mobile-deck-grid">
                  {visibleWorldThreats.map((card, index) => {
                  const label = gameLocale.worldThreatCard(index + 1);
                  const revealed = card.isRevealed;
                  const imageUrl = revealed ? getWorldImage(card.imageId) : undefined;
                  const canReveal = canRevealThreats && !revealed;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      className="mobile-deck-card"
                      disabled={!revealed && !canReveal}
                      onClick={() => {
                        if (!revealed && canReveal) {
                          onRevealWorldThreat(index);
                          return;
                        }
                        if (!revealed) return;
                        openWorldDetail({
                          kind: gameText.t("worldKindThreat"),
                          title: card.title || label,
                          description: card.description,
                          imageUrl,
                          label,
                        });
                      }}
                    >
                      <CardTile src={imageUrl ?? getCardBackUrl("threat", cardLocale)} fallback={label} />
                      <div className="mobile-deck-title">{revealed ? card.title || label : label}</div>
                      {canReveal && showHints ? <div className="mobile-deck-hint">{gameText.t("worldHintTapToReveal")}</div> : null}
                    </button>
                  );
                  })}
                </div>
              </>
            ) : null}
            {worldDetail ? (
              <div className="world-detail-overlay" onClick={() => setWorldDetail(null)}>
                <div className="world-detail-card" onClick={(event) => event.stopPropagation()}>
                  <div className="world-detail-header">
                    <div className="world-detail-title">{worldDetail.title}</div>
                    <button className="icon-button" onClick={() => setWorldDetail(null)} aria-label={gameText.t("closeButton")}>
                      x
                    </button>
                  </div>
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
        ) : null}
        <div className="mobile-deck-footer">
          <button
            className="ghost"
            onClick={() => {
              setMobileDeckModal(null);
              setWorldDetail(null);
            }}
          >
            {gameText.t("closeButton")}
          </button>
        </div>
      </Modal>

      {postGame?.outcome ? (
        <div className="postgame-overlay" role="dialog" aria-modal="true">
          <div className="postgame-card">
            <div className="postgame-title">
              {postGame.outcome === "survived" ? gameText.t("postGameSuccessTitle") : gameText.t("postGameFailedTitle")}
            </div>
            <div className="postgame-text">
              {postGame.outcome === "survived" ? gameText.t("postGameSuccessText") : gameText.t("postGameFailedText")}
            </div>
            <button className="primary postgame-exit" onClick={() => onExitGame({ skipConfirm: true })}>
              {gameText.t("exitButton")}
            </button>
          </div>
        </div>
      ) : null}
      {!isMobileNarrow ? (
        <GameSpecialDialog
          mobile={false}
          specialDialog={specialDialog}
          closeSpecialDialog={closeSpecialDialog}
          gameText={gameText}
          gameLocale={gameLocale}
          isPlayerCardPickerDialog={isPlayerCardPickerDialog}
          dialogSelection={dialogSelection}
          selectDialogPlayer={selectDialogPlayer}
          dialogSourceCardSelection={dialogSourceCardSelection}
          setDialogSourceCardSelection={setDialogSourceCardSelection}
          dialogSourceCards={dialogSourceCards}
          dialogTargetCardSelection={dialogTargetCardSelection}
          setDialogTargetCardSelection={setDialogTargetCardSelection}
          dialogTargetCards={dialogTargetCards}
          selectedSourceCardHint={selectedSourceCardHint}
          selectedTargetCardHint={selectedTargetCardHint}
          canSubmitSpecialDialog={canSubmitSpecialDialog}
          submitSpecialDialog={submitSpecialDialog}
        />
      ) : null}

      {isMobileNarrow && specialDialog ? (
        <GameSpecialDialog
          mobile={true}
          specialDialog={specialDialog}
          closeSpecialDialog={closeSpecialDialog}
          gameText={gameText}
          gameLocale={gameLocale}
          isPlayerCardPickerDialog={isPlayerCardPickerDialog}
          dialogSelection={dialogSelection}
          selectDialogPlayer={selectDialogPlayer}
          dialogSourceCardSelection={dialogSourceCardSelection}
          setDialogSourceCardSelection={setDialogSourceCardSelection}
          dialogSourceCards={dialogSourceCards}
          dialogTargetCardSelection={dialogTargetCardSelection}
          setDialogTargetCardSelection={setDialogTargetCardSelection}
          dialogTargetCards={dialogTargetCards}
          selectedSourceCardHint={selectedSourceCardHint}
          selectedTargetCardHint={selectedTargetCardHint}
          canSubmitSpecialDialog={canSubmitSpecialDialog}
          submitSpecialDialog={submitSpecialDialog}
        />
      ) : null}
    </div>
  );
}














