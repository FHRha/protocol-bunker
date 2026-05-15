import { useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type {
  GameEvent,
  GameSettings,
  GameView,
  RoomState,
  ScenarioMeta,
} from "@bunker/shared";
import { LINK_PATHS } from "@bunker/shared";
import { BunkerClient, type ConnectionStatus } from "./wsClient";
import { API_BASE, DEV_TAB_IDENTITY, IDENTITY_MODE, WS_URL } from "./config";
import { clearPlayerToken, initTabIdentity, writePlayerToken } from "./storage";
import {
  getCurrentLocale,
  type LocaleCode,
  useUiLocaleNamespace,
} from "./localization";
import { getOrCreateSessionId } from "./session/storage";
import type { RulesUpdatePayload, SessionIntent } from "./session/types";
import { createSessionActions } from "./session/actions";
import {
  beginCreateSession,
  beginJoinSession,
  buildStoredReconnectIntent,
  sendHelloWithIntent as sendSessionHelloWithIntent,
  sendResume as sendSessionResume,
} from "./session/connectionFlow";
import { getRoomRouteTarget, hasRouteReconnectContext } from "./session/routing";
import { handleConnectionStatus, handleServerMessage } from "./session/wsMessageHandlers";
import EyeIcon from "./components/EyeIcon";
import AnimatedRouteContainer from "./components/AnimatedRouteContainer";
import ErrorBoundary from "./components/ErrorBoundary";
import ErrorScreen from "./components/ErrorScreen";
import RouteIssuePanel from "./components/RouteIssuePanel";
import HomePage from "./pages/HomePage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import SpectatorTablePage from "./pages/SpectatorTablePage";
import { useUiLocaleNamespacesActivation } from "./localization/useUiLocaleNamespacesActivation";
import { useAppUiSideEffects } from "./hooks/useAppUiSideEffects";
import { useViewportFlags } from "./hooks/useViewportFlags";
import { usePopoverDismissal } from "./hooks/usePopoverDismissal";
import {
  AppModalLayer,
} from "./app/AppModalLayer";
import { AppSettingsPopover } from "./app/AppSettingsPopover";
import { AppThemePopover } from "./app/AppThemePopover";
import {
  buildConnectionDisplay,
  buildRoleLabel,
  buildRoomCodeDisplay,
  buildToastViews,
  getDevKickCandidates,
  getTransferHostCandidates,
  type UiToast,
} from "./app/derivedUi";
import {
  getInitialAutoCopyRoomCode,
  getInitialAiAccessKey,
  getInitialCompactMode,
  getInitialConfirmDangerousActions,
  getInitialConfirmExitGame,
  getInitialReduceMotion,
  getInitialShowHints,
  getInitialShowRoomCode,
  getInitialShowSpectatorLinks,
  getInitialStreamerMode,
  getInitialTheme,
  getInitialToastDuration,
  getInitialToastPosition,
  getInitialUiScale,
  type ThemeMode,
  type ToastDuration,
  type ToastPosition,
  type UiScale,
  UI_STORAGE_KEYS,
} from "./app/uiPreferences";
const MAX_EVENTS = 20;
const SNAPSHOT_TIMEOUT_MS = 8000;

function fallbackCopy(value: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(area);
  return ok;
}

function isSuspiciousLabel(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return true;
  const mojibakeChunks = normalized.match(/[Р РЎ][\u0400-\u04ff]/g);
  return Boolean(mojibakeChunks && mojibakeChunks.length >= 2);
}

function safeLabel(value: string, fallback: string): string {
  return isSuspiciousLabel(value) ? fallback : value;
}

export default function App() {
  useUiLocaleNamespacesActivation(["app", "common", "reconnect", "dev", "misc", "lobby", "game", "overlay-links", "room-settings", "rules", "format", "maps", "world", "special", "voting"]);
  const appNs = useUiLocaleNamespace("app", {
    fallbacks: ["common", "reconnect", "dev", "misc", "lobby", "game", "overlay-links", "room-settings", "rules", "format", "maps", "world", "special", "voting"],
  });
  const appLocale = useMemo(() => {
    const getString = (key: string) => appNs.t(key);
    const getFn = <T extends (...args: any[]) => any>(key: string, fallback: T): T => {
      const raw = appNs.getRaw(key);
      return (typeof raw === "function" ? raw : fallback) as T;
    };

    return {
      themeDarkMint: getString("themeDarkMint"),
      themeLightPaper: getString("themeLightPaper"),
      themeCyberAmber: getString("themeCyberAmber"),
      themeSteelBlue: getString("themeSteelBlue"),
      themeCrimsonNight: getString("themeCrimsonNight"),
      roleControl: getString("roleControl"),
      roleHost: getString("roleHost"),
      rolePlayer: getString("rolePlayer"),
      statusOnline: getString("statusOnline"),
      statusReconnecting: getString("statusReconnecting"),
      statusOffline: getString("statusOffline"),
      statusReconnectHint: getString("statusReconnectHint"),
      statusOfflineHint: getString("statusOfflineHint"),
      errorScreenExitToMenu: getString("errorScreenExitToMenu"),
      routeIssueTitle: getString("routeIssueTitle"),
      routeIssueRoomMessage: getString("routeIssueRoomMessage"),
      routeIssueNotFoundMessage: getString("routeIssueNotFoundMessage"),
      devSkipRoundButton: getString("devSkipRoundButton"),
      errorReconnectNetwork: getString("errorReconnectNetwork"),
      errorReconnectFailed: getString("errorReconnectFailed"),
      wsActionRetryHint: getString("wsActionRetryHint"),
      hostChangedYou: getString("hostChangedYou"),
      roomFullUnknown: getString("roomFullUnknown"),
      genericPlayer: getString("genericPlayer"),
      copyFailed: getString("copyFailed"),
      notificationTitle: getString("notificationTitle"),
      hiddenValue: getString("hiddenValue"),
      showSecret: getString("showSecret"),
      hideSecret: getString("hideSecret"),
      spectatorLinkTitle: getString("spectatorLinkTitle"),
      copiedButton: getString("copiedButton"),
      copyButton: getString("copyButton"),
      transferHostButton: getString("transferHostButton"),
      exitButton: getString("exitButton"),
      settingsTitle: getString("settingsTitle"),
      settingsGameSectionTitle: getString("settingsGameSectionTitle"),
      streamerModeLabel: getString("streamerModeLabel"),
      settingsShowRoomCodeInLobby: getString("settingsShowRoomCodeInLobby"),
      settingsToastPosition: getString("settingsToastPosition"),
      toastPosTopRight: getString("toastPosTopRight"),
      toastPosTopLeft: getString("toastPosTopLeft"),
      toastPosBottomRight: getString("toastPosBottomRight"),
      toastPosBottomLeft: getString("toastPosBottomLeft"),
      settingsToastDuration: getString("settingsToastDuration"),
      toastDuration3s: getString("toastDuration3s"),
      toastDuration4s: getString("toastDuration4s"),
      toastDuration6s: getString("toastDuration6s"),
      settingsUiScale: getString("settingsUiScale"),
      settingsReduceMotion: getString("settingsReduceMotion"),
      settingsConfirmDangerous: getString("settingsConfirmDangerous"),
      settingsConfirmExit: getString("settingsConfirmExit"),
      settingsCompactMode: getString("settingsCompactMode"),
      settingsAutoCopyRoomCode: getString("settingsAutoCopyRoomCode"),
      settingsShowSpectatorLinks: getString("settingsShowSpectatorLinks"),
      settingsShowHints: getString("settingsShowHints"),
      settingsAiAccessKey: getString("settingsAiAccessKey"),
      settingsAiAccessKeyPlaceholder: getString("settingsAiAccessKeyPlaceholder"),
      settingsAiAccessValidate: getString("settingsAiAccessValidate"),
      settingsAiAccessChecking: getString("settingsAiAccessChecking"),
      settingsAiAccessValid: getString("settingsAiAccessValid"),
      settingsAiAccessInvalid: getString("settingsAiAccessInvalid"),
      settingsResetUi: getString("settingsResetUi"),
      settingsLocaleSectionTitle: getString("settingsLocaleSectionTitle"),
      localeRu: getString("localeRu"),
      localeEnBeta: getString("localeEnBeta"),
      themeTitle: getString("themeTitle"),
      retryButton: getString("retryButton"),
      closeButton: getString("closeButton"),
      confirmActionTitle: getString("confirmActionTitle"),
      modalCancel: getString("modalCancel"),
      modalApply: getString("modalApply"),
      transferHostTitle: getString("transferHostTitle"),
      transferHostSelectPlaceholder: getString("transferHostSelectPlaceholder"),
      transferHostSelectLabel: getString("transferHostSelectLabel"),
      transferHostAgreeLabel: getString("transferHostAgreeLabel"),
      exitConfirmTitle: getString("exitConfirmTitle"),
      exitConfirmText: getString("exitConfirmText"),
      devKickTitle: getString("devKickTitle"),
      devKickNoTargets: getString("devKickNoTargets"),
      devKickSelectPlaceholder: getString("devKickSelectPlaceholder"),
      devKickAgreeLabel: getString("devKickAgreeLabel"),
      devKickConfirm: getString("devKickConfirm"),
      devKickButton: getString("devKickButton"),
      devBadge: getString("devBadge"),
      roomFull: getFn("roomFull", (maxPlayers: number) => appNs.t("roomFull", { maxPlayers })),
      hostChangedOther: getFn("hostChangedOther", (name: string) => appNs.t("hostChangedOther", { name })),
      toastKind: getFn("toastKind", (kind: string) => appNs.t(`toastKind.${kind}`) || kind),
      roomPill: getFn("roomPill", (code: string) => appNs.t("roomPill", { code })),
      scenarioPill: getFn("scenarioPill", (name: string) => appNs.t("scenarioPill", { name })),
      confirmSkipRound: getString("confirmSkipRound"),
      confirmKickFromLobby: getString("confirmKickFromLobby"),
      confirmTransferHost: getString("confirmTransferHost"),
    };
  }, [appNs]);
  const client = useMemo(() => new BunkerClient(WS_URL), []);
  const navigate = useNavigate();
  const location = useLocation();
  const [tabId, setTabId] = useState<string | undefined>(undefined);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameView, setGameView] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fatalErrorMessage, setFatalErrorMessage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [lastWsError, setLastWsError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [streamerMode, setStreamerMode] = useState<boolean>(() => getInitialStreamerMode());
  const [showRoomCode, setShowRoomCode] = useState<boolean>(() => getInitialShowRoomCode());
  const [toastPosition, setToastPosition] = useState<ToastPosition>(() => getInitialToastPosition());
  const [uiScale, setUiScale] = useState<UiScale>(() => getInitialUiScale());
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => getInitialReduceMotion());
  const [confirmDangerousActions, setConfirmDangerousActions] = useState<boolean>(() =>
    getInitialConfirmDangerousActions()
  );
  const [confirmExitGame, setConfirmExitGame] = useState<boolean>(() => getInitialConfirmExitGame());
  const [toastDuration, setToastDuration] = useState<ToastDuration>(() => getInitialToastDuration());
  const [compactMode, setCompactMode] = useState<boolean>(() => getInitialCompactMode());
  const [autoCopyRoomCode, setAutoCopyRoomCode] = useState<boolean>(() => getInitialAutoCopyRoomCode());
  const [showSpectatorLinks, setShowSpectatorLinks] = useState<boolean>(() =>
    getInitialShowSpectatorLinks()
  );
  const [showHints, setShowHints] = useState<boolean>(() => getInitialShowHints());
  const [aiAccessKey, setAiAccessKey] = useState<string>(() => getInitialAiAccessKey());
  const [aiAccessValidation, setAiAccessValidation] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [locale, setLocale] = useState<LocaleCode>(() => getCurrentLocale());
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [settingsSectionsCollapsed, setSettingsSectionsCollapsed] = useState<{
    game: boolean;
    locale: boolean;
  }>({ game: false, locale: false });
  const [eventLog, setEventLog] = useState<GameEvent[]>([]);
  const [toasts, setToasts] = useState<GameEvent[]>([]);
  const [uiToasts, setUiToasts] = useState<UiToast[]>([]);
  const [devKickModalOpen, setDevKickModalOpen] = useState(false);
  const [transferHostModalOpen, setTransferHostModalOpen] = useState(false);
  const [exitConfirmModalOpen, setExitConfirmModalOpen] = useState(false);
  const [dangerConfirmMessage, setDangerConfirmMessage] = useState<string | null>(null);
  const [devKickTargetId, setDevKickTargetId] = useState("");
  const [devKickAgree, setDevKickAgree] = useState(false);
  const [transferHostTargetId, setTransferHostTargetId] = useState("");
  const [transferHostAgree, setTransferHostAgree] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { isMobile, isMobileNarrow } = useViewportFlags();
  const [mobileDossierError, setMobileDossierError] = useState<string | null>(null);
  const THEME_OPTIONS: Array<{ id: ThemeMode; label: string }> = useMemo(
    () => [
      { id: "dark-mint", label: appLocale.themeDarkMint },
      { id: "light-paper", label: appLocale.themeLightPaper },
      { id: "cyber-amber", label: appLocale.themeCyberAmber },
      { id: "steel-blue", label: appLocale.themeSteelBlue },
      { id: "crimson-night", label: appLocale.themeCrimsonNight },
    ],
    [appLocale]
  );

  const intentRef = useRef<SessionIntent | null>(null);
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingRoomStateRef = useRef(false);
  const awaitingGameViewRef = useRef(false);
  const roomStateRef = useRef<RoomState | null>(null);
  const gameViewRef = useRef<GameView | null>(null);
  const roomStateRevisionRef = useRef(0);
  const gameViewRevisionRef = useRef(0);
  const sessionIdRef = useRef<string | null>(null);
  const lastHelloAtRef = useRef<number | null>(null);
  const reconnectPendingRef = useRef(false);
  const dossierActionRef = useRef(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const autoCopiedRoomCodeRef = useRef<string | null>(null);
  const dangerConfirmResolveRef = useRef<((value: boolean) => void) | null>(null);
  const shouldValidateStoredAiAccessKeyRef = useRef(Boolean(aiAccessKey.trim()));
  const isHost = roomState?.hostId === playerId;
  const isControl = roomState?.controlId === playerId;
  const presenterModeEnabled = Boolean(roomState?.settings.enablePresenterMode);
  const presenterControlActive = Boolean(isControl && presenterModeEnabled);
  const showDevSkipRound = Boolean(
    roomState?.isDev && roomState.scenarioMeta.id === "classic" && isControl && !presenterControlActive
  );
  const showDevKick = showDevSkipRound;
  const isLobbyRoute = location.pathname.startsWith("/lobby");
  const isGameRoute = location.pathname.startsWith("/game");
  const isSpectateRoute = location.pathname.startsWith("/spectate");
  const showConnectionStatus = isGameRoute || isLobbyRoute;
  const showRolePill = Boolean(roomState);
  const showRolePillCompact = showRolePill && isMobile;
  const showDevIdentityBadge = roomState ? Boolean(roomState.isDev) : DEV_TAB_IDENTITY;
  const wsInteractive = connectionStatus === "connected";
  const toastDurationMs = Number(toastDuration);
  const roleLabel = buildRoleLabel({
    isControl: Boolean(isControl),
    isHost: Boolean(isHost),
    roleControl: appLocale.roleControl,
    roleHost: appLocale.roleHost,
    rolePlayer: appLocale.rolePlayer,
  });
  const connectionDisplay = buildConnectionDisplay(connectionStatus, {
    statusOnline: appLocale.statusOnline,
    statusReconnecting: appLocale.statusReconnecting,
    statusOffline: appLocale.statusOffline,
    statusReconnectHint: appLocale.statusReconnectHint,
    statusOfflineHint: appLocale.statusOfflineHint,
  });
  const devKickCandidates = getDevKickCandidates(gameView, playerId);
  const transferHostCandidates = getTransferHostCandidates(roomState);
  const devSkipRoundButtonLabel = safeLabel(appLocale.devSkipRoundButton, "DEV");

  useAppUiSideEffects({
    keys: UI_STORAGE_KEYS,
    appTitle: appNs.t("appTitle"),
    theme,
    streamerMode,
    showRoomCode,
    setShowRoomCode,
    toastPosition,
    uiScale,
    reduceMotion,
    confirmDangerousActions,
    confirmExitGame,
    toastDuration,
    compactMode,
    autoCopyRoomCode,
    showSpectatorLinks,
    showHints,
    aiAccessKey,
    locale,
  });

  usePopoverDismissal({
    routeKey: `${location.pathname}\n${location.search}`,
    settingsMenuRef,
    themeMenuRef,
    setSettingsMenuOpen,
    setThemeMenuOpen,
  });

  const clearSnapshotTimer = () => {
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    awaitingRoomStateRef.current = false;
    awaitingGameViewRef.current = false;
  };

  const clearAppErrors = () => {
    setErrorMessage(null);
    setFatalErrorMessage(null);
  };

  const startSnapshotWait = (expectGameView: boolean) => {
    clearSnapshotTimer();
    awaitingRoomStateRef.current = true;
    awaitingGameViewRef.current = expectGameView;
    snapshotTimerRef.current = setTimeout(() => {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
      reconnectPendingRef.current = false;
    }, SNAPSHOT_TIMEOUT_MS);
  };

  const hardResetSession = (options?: { clearLastRoom?: boolean; preserveError?: boolean }) => {
    clearSnapshotTimer();
    reconnectPendingRef.current = false;
    if (options?.clearLastRoom) {
      const lastRoom = localStorage.getItem("bunker.lastRoomCode");
      if (lastRoom) {
        clearPlayerToken(lastRoom);
      }
      localStorage.removeItem("bunker.lastRoomCode");
    }
    setRoomState(null);
    setGameView(null);
    setPlayerId(null);
    setPlayerToken(null);
    if (!options?.preserveError) {
      clearAppErrors();
    }
    intentRef.current = null;
    client.disconnect();
  };

  const messageIncludesAny = (message: string, tokens: string[]): boolean => {
    const lowered = String(message ?? "").toLowerCase();
    return tokens.some((token) => lowered.includes(token.toLowerCase()));
  };

  const isReconnectError = (message: string, code?: string) =>
    code === "PLAYER_RESTORE_FAILED" ||
    messageIncludesAny(message, [
      appLocale.errorReconnectFailed,
      "failed to restore player",
      "failed to restore player",
      "Player not found",
      "You are not in room",
      "Room not found",
      "Game not found",
    ]);

  const sendHelloWithIntent = async (intent: SessionIntent) => {
    await sendSessionHelloWithIntent(intent, {
      client,
      locale,
      sessionId,
      sessionIdRef,
      ensureSessionId,
      startSnapshotWait,
      lastHelloAtRef,
    });
  };

  const sendResume = async () => {
    await sendSessionResume({
      client,
      locale,
      tabId,
      sessionId,
      sessionIdRef,
      roomStateRef,
      locationPathname: location.pathname,
      locationSearch: location.search,
      ensureSessionId,
      startSnapshotWait,
      lastHelloAtRef,
    });
  };



  useEffect(() => {
    if (connectionStatus !== "connected") return;
    try {
      client.send({ type: "updateLocale", payload: { locale } });
    } catch {
      // ignore transient reconnect race
    }
  }, [client, connectionStatus, locale]);

  useEffect(
    () => () => {
      if (dangerConfirmResolveRef.current) {
        dangerConfirmResolveRef.current(false);
        dangerConfirmResolveRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    if (!roomCodeCopied) return;
    const timer = window.setTimeout(() => setRoomCodeCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [roomCodeCopied]);

  useEffect(() => {
    if (!errorMessage) return;
    const timer = window.setTimeout(() => {
      setErrorMessage((current) => (current === errorMessage ? null : current));
    }, Math.max(3500, toastDurationMs));
    return () => window.clearTimeout(timer);
  }, [errorMessage, toastDurationMs]);

  useEffect(() => {
    setTransferHostTargetId((prev) =>
      transferHostCandidates.some((player) => player.playerId === prev)
        ? prev
        : (transferHostCandidates[0]?.playerId ?? "")
    );
    if (transferHostCandidates.length === 0) {
      setTransferHostAgree(false);
    }
  }, [transferHostCandidates]);

  useEffect(() => {
    if (!transferHostModalOpen) return;
    if (!isGameRoute || !isControl || isSpectateRoute || isLobbyRoute) {
      setTransferHostModalOpen(false);
      setTransferHostAgree(false);
    }
  }, [isControl, isGameRoute, isLobbyRoute, isSpectateRoute, transferHostModalOpen]);

  useEffect(() => {
    if (!autoCopyRoomCode) {
      autoCopiedRoomCodeRef.current = null;
    }
  }, [autoCopyRoomCode]);

  useEffect(() => {
    if (!roomState?.roomCode) return;
    if (!autoCopyRoomCode) return;
    if (!isLobbyRoute) return;
    if (!isControl) return;
    if (autoCopiedRoomCodeRef.current === roomState.roomCode) return;
    void (async () => {
      const ok = await copyRoomCodeToClipboard({ silent: true, markCopied: false });
      if (ok) {
        autoCopiedRoomCodeRef.current = roomState.roomCode;
      }
    })();
  }, [autoCopyRoomCode, isControl, isLobbyRoute, roomState?.roomCode]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    gameViewRef.current = gameView;
  }, [gameView]);

  useEffect(() => {
    if (IDENTITY_MODE !== "dev_tab") {
      setTabId(undefined);
      return;
    }
    let active = true;
    initTabIdentity().then((id) => {
      if (!active) return;
      setTabId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = getOrCreateSessionId(DEV_TAB_IDENTITY);
    setSessionId(id);
    sessionIdRef.current = id;
  }, []);

  const shouldSuppressEvent = (event: GameEvent) => {
    if (event.kind !== "playerDisconnected") return false;
    const view = gameViewRef.current;
    if (!view) return false;
    const match = event.message.match(
      /(?:Игрок|Player)\s+(.+?)\s+(?:вышел|отсутствует|покинул|disconnected|missing|left)/i
    );
    if (!match) return false;
    const name = match[1].trim();
    const found = view.public.players.find((player) => player.name === name);
    return found?.status === "eliminated";
  };

  const pushEvent = (event: GameEvent) => {
    if (shouldSuppressEvent(event)) return;
    setEventLog((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    setToasts((prev) => [...prev, event]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== event.id));
    }, toastDurationMs);

    const isPlayerStatusEvent =
      event.kind === "playerDisconnected" ||
      event.kind === "playerReconnected" ||
      event.kind === "playerLeftBunker";
    if (!isPlayerStatusEvent && typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(event.message);
      }
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const pushUiToast = (message: string, variant: UiToast["variant"] = "info") => {
    const id = `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setUiToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setUiToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, toastDurationMs);
  };

  const ensureSessionId = () => {
    if (sessionIdRef.current) return;
    if (typeof window === "undefined") return;
    const id = getOrCreateSessionId(DEV_TAB_IDENTITY);
    sessionIdRef.current = id;
    setSessionId(id);
  };

  const removeUiToast = (id: string) => {
    setUiToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const ensureWsInteractive = () => {
    if (wsInteractive) return true;
    pushUiToast(appLocale.wsActionRetryHint, "info");
    return false;
  };

  const sessionActions = createSessionActions({
    client,
    clearAppErrors,
    ensureWsInteractive,
  });

  useEffect(() => {
    const key = aiAccessKey.trim();
    if (aiAccessValidation !== "valid" || !key || !roomState || !playerId) return;
    sessionActions.updateAiAccessKey(key);
  }, [aiAccessKey, aiAccessValidation, playerId, roomState?.roomCode]);

  const applyRoomStatePatch = (patch: Partial<RoomState>) => {
    const patchRevision = patch.revision;
    if (typeof patchRevision === "number" && patchRevision <= roomStateRevisionRef.current) {
      return;
    }
    setRoomState((prev) => {
      if (!prev) {
        void sendResume();
        return prev;
      }
      const next = { ...prev, ...patch };
      roomStateRevisionRef.current = next.revision ?? patchRevision ?? roomStateRevisionRef.current;
      return next;
    });
    awaitingRoomStateRef.current = false;
    if (!awaitingGameViewRef.current) {
      clearSnapshotTimer();
    }
  };

  const applyGameViewPatch = (patch: Partial<GameView>) => {
    const patchRevision = patch.revision;
    if (typeof patchRevision === "number" && patchRevision <= gameViewRevisionRef.current) {
      return;
    }
    setGameView((prev) => {
      if (!prev) {
        void sendResume();
        return prev;
      }
      const next = { ...prev, ...patch };
      gameViewRevisionRef.current = next.revision ?? patchRevision ?? gameViewRevisionRef.current;
      return next;
    });
    awaitingGameViewRef.current = false;
    if (!awaitingRoomStateRef.current) {
      clearSnapshotTimer();
    }
  };

  useEffect(() => {
    const unsubscribeMessage = client.onMessage((message) => {
      handleServerMessage(message, {
        appLocale,
        connectionStatus,
        isMobileNarrow,
        playerId,
        tabId,
        awaitingRoomStateRef,
        awaitingGameViewRef,
        dossierActionRef,
        gameViewRef,
        roomStateRef,
        gameViewRevisionRef,
        roomStateRevisionRef,
        setPlayerId,
        setPlayerToken,
        setRoomState,
        setGameView,
        setMobileDossierError,
        setErrorMessage,
        setFatalErrorMessage,
        clearAppErrors,
        clearSnapshotTimer,
        applyRoomStatePatch,
        applyGameViewPatch,
        pushEvent,
        pushUiToast,
        messageIncludesAny,
        isReconnectError,
        hardResetSession,
        navigateHome: () => navigate("/"),
      });
    });

    const unsubscribeStatus = client.onStatus((status, error) => {
      handleConnectionStatus(status, error, {
        intentRef,
        reconnectPendingRef,
        roomStateRef,
        setConnectionStatus,
        setLastWsError,
        sendHelloWithIntent,
        sendResume,
      });
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
    };
  }, [client, isMobileNarrow]);

  useEffect(() => {
    const target = getRoomRouteTarget(roomState);
    if (!target) return;
    if (isSpectateRoute) return;

    const currentSearch = location.search || "";

    if (location.pathname === target.pathname && currentSearch === target.search) {
      return;
    }

    navigate(`${target.pathname}${target.search}`, { replace: true });
  }, [
    isSpectateRoute,
    location.pathname,
    location.search,
    navigate,
    roomState?.phase,
    roomState?.roomCode,
  ]);

  useEffect(() => {
    if (!roomState) return;
    localStorage.setItem("bunker.lastRoomCode", roomState.roomCode);
    if (!playerToken || DEV_TAB_IDENTITY) return;
    writePlayerToken(roomState.roomCode, playerToken);
  }, [roomState, playerToken]);

  useEffect(() => {
    const intent = buildStoredReconnectIntent({
      locationPathname: location.pathname,
      locationSearch: location.search,
      playerId,
      roomState,
      tabId,
    });
    if (!intent) return;
    intentRef.current = intent;
    void sendHelloWithIntent(intent).catch(() => {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
    });
  }, [client, location.pathname, location.search, playerId, roomState, tabId]);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    const loadScenarios = () => {
      setScenariosLoading(true);
      fetch(`${API_BASE}/api/scenarios`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data: ScenarioMeta[]) => {
          if (!active) return;
          setScenarios(data);
          setScenariosLoading(false);
          retryDelay = 1000;
        })
        .catch(() => {
          if (!active) return;
          setScenarios([]);
          setScenariosLoading(false);
          retryTimer = setTimeout(loadScenarios, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 10000);
        });
    };

    loadScenarios();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const handleCreate = async (name: string, scenarioId: string) => {
    await beginCreateSession(name, scenarioId, {
      locale,
      tabId,
      setTabId,
      setFatalErrorMessage,
      errorReconnectNetwork: appLocale.errorReconnectNetwork,
      clearAppErrors,
      sendHello: sendHelloWithIntent,
      intentRef,
    });
  };

  const handleJoin = async (name: string, roomCode: string) => {
    await beginJoinSession(name, roomCode, {
      locale,
      tabId,
      setTabId,
      setFatalErrorMessage,
      errorReconnectNetwork: appLocale.errorReconnectNetwork,
      clearAppErrors,
      sendHello: sendHelloWithIntent,
      intentRef,
    });
  };

  const handleStart = () => {
    sessionActions.start();
  };

  const confirmDangerousAction = async (message: string): Promise<boolean> => {
    if (!confirmDangerousActions) return true;
    if (dangerConfirmResolveRef.current) return false;
    return new Promise<boolean>((resolve) => {
      dangerConfirmResolveRef.current = resolve;
      setDangerConfirmMessage(message);
    });
  };

  const resolveDangerousActionConfirm = (value: boolean) => {
    const resolve = dangerConfirmResolveRef.current;
    dangerConfirmResolveRef.current = null;
    setDangerConfirmMessage(null);
    resolve?.(value);
  };

  const handleRevealCard = (cardId: string) => {
    sessionActions.revealCard(cardId);
  };

  const handleVote = (targetPlayerId: string) => {
    sessionActions.vote(targetPlayerId);
  };

  const handleApplySpecial = (specialInstanceId: string, payload?: Record<string, unknown>) => {
    sessionActions.applySpecial(specialInstanceId, payload);
  };

  const markDossierSpecialAction = () => {
    dossierActionRef.current = true;
    setMobileDossierError(null);
  };

  const clearMobileDossierError = () => {
    setMobileDossierError(null);
    dossierActionRef.current = false;
  };

  const handleFinalizeVoting = () => {
    sessionActions.finalizeVoting();
  };

  const handleContinueRound = () => {
    sessionActions.continueRound();
  };

  const handleSendMatchMessage = (text: string) => {
    sessionActions.sendMatchMessage(text);
  };

  const handleRevealWorldThreat = (index: number) => {
    sessionActions.revealWorldThreat(index);
  };

  const handleSetBunkerOutcome = (outcome: "survived" | "failed") => {
    sessionActions.setBunkerOutcome(outcome);
  };

  const handleDevSkipRound = async () => {
    if (!(await confirmDangerousAction(appLocale.confirmSkipRound))) return;
    sessionActions.devSkipRound();
  };

  const handleDevKickPlayer = async () => {
    if (!devKickTargetId) return;
    if (!devKickAgree) return;
    if (!sessionActions.devKickPlayer(devKickTargetId)) return;
    setDevKickModalOpen(false);
    setDevKickTargetId("");
    setDevKickAgree(false);
  };

  const handleUpdateSettings = (settings: GameSettings) => {
    sessionActions.updateSettings(settings);
  };

  const handleUpdateRules = (payload: RulesUpdatePayload) => {
    sessionActions.updateRules(payload);
  };

  const handleKickFromLobby = async (
    targetPlayerId: string,
    options?: { skipConfirm?: boolean }
  ) => {
    if (!options?.skipConfirm) {
      if (!(await confirmDangerousAction(appLocale.confirmKickFromLobby))) return;
    }
    sessionActions.kickFromLobby(targetPlayerId);
  };

  const handleRequestHostTransfer = async (
    targetPlayerId?: string,
    options?: { skipConfirm?: boolean }
  ) => {
    if (!options?.skipConfirm) {
      if (!(await confirmDangerousAction(appLocale.confirmTransferHost))) return;
    }
    sessionActions.requestHostTransfer(targetPlayerId);
  };

  const openTransferHostModal = () => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    setTransferHostAgree(false);
    setTransferHostModalOpen(true);
  };

  const handleTransferHostFromModal = async () => {
    const targetPlayerId = String(transferHostTargetId || "").trim();
    if (!targetPlayerId || !transferHostAgree) return;
    await handleRequestHostTransfer(targetPlayerId, { skipConfirm: true });
    setTransferHostModalOpen(false);
    setTransferHostAgree(false);
  };

  const handleDevAddPlayer = (name?: string) => {
    sessionActions.devAddPlayer(name);
  };

  const handleDevRemovePlayer = (targetPlayerId?: string) => {
    sessionActions.devRemovePlayer(targetPlayerId);
  };

  const performExitGame = () => {
    clearAppErrors();
    hardResetSession();
    navigate("/");
  };

  const handleExitGame = (options?: { skipConfirm?: boolean }) => {
    if (!options?.skipConfirm && confirmExitGame) {
      setExitConfirmModalOpen(true);
      return;
    }
    performExitGame();
  };

  const handleResetUiSettings = () => {
    setTheme("dark-mint");
    setStreamerMode(true);
    setShowRoomCode(false);
    setToastPosition("top-right");
    setToastDuration("4000");
    setUiScale("100");
    setReduceMotion(false);
    setConfirmDangerousActions(true);
    setConfirmExitGame(true);
    setCompactMode(false);
    setAutoCopyRoomCode(false);
    setShowSpectatorLinks(true);
    setShowHints(true);
    setAiAccessKey("");
    setAiAccessValidation("idle");
  };

  const validateAiAccessKey = async () => {
    const key = aiAccessKey.trim();
    if (!key) {
      setAiAccessValidation("invalid");
      return;
    }
    setAiAccessValidation("checking");
    try {
      const response = await fetch(`${API_BASE}${LINK_PATHS.apiAiAccessValidate}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const payload = (await response.json().catch(() => null)) as { valid?: boolean } | null;
      const valid = response.ok && payload?.valid === true;
      setAiAccessValidation(valid ? "valid" : "invalid");
      if (valid) {
        sessionActions.updateAiAccessKey(key);
      }
    } catch {
      setAiAccessValidation("invalid");
    }
  };

  useEffect(() => {
    if (!shouldValidateStoredAiAccessKeyRef.current) return;
    shouldValidateStoredAiAccessKeyRef.current = false;
    if (!aiAccessKey.trim()) return;
    void validateAiAccessKey();
  }, []);

  const copyRoomCodeToClipboard = async (options?: { silent?: boolean; markCopied?: boolean }) => {
    if (!roomState) return false;
    let copied = false;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(roomState.roomCode);
        copied = true;
      } catch {
        copied = false;
      }
    }
    if (!copied) {
      copied = fallbackCopy(roomState.roomCode);
    }
    if (!copied) {
      if (!options?.silent) {
        window.alert(appLocale.copyFailed);
      }
      return false;
    }
    if (options?.markCopied !== false) {
      setRoomCodeCopied(true);
    }
    return true;
  };

  const handleCopyRoomCode = async () => {
    await copyRoomCodeToClipboard({ silent: false, markCopied: true });
  };

  const toggleSettingsSection = (section: "game" | "locale") => {
    setSettingsSectionsCollapsed((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleRetry = async () => {
    const intent = intentRef.current;
    if (!intent) return;
    clearAppErrors();
    hardResetSession();
    intentRef.current = intent;
    try {
      await sendHelloWithIntent(intent);
    } catch {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
    }
  };

  const { visibleUiToasts, visibleEventToasts, mobileToasts } = buildToastViews({
    isMobile,
    uiToasts,
    eventToasts: toasts,
    notificationTitle: appLocale.notificationTitle,
    toastKind: appLocale.toastKind,
    removeUiToast,
    removeEventToast: removeToast,
  });
  const roomCodeDisplay = buildRoomCodeDisplay({
    roomState,
    isLobbyRoute,
    streamerMode,
    showRoomCode,
    hiddenValue: appLocale.hiddenValue,
    roomPill: appLocale.roomPill,
  });
  const isExactLobbyRoute = location.pathname === "/lobby";
  const isExactGameRoute = location.pathname === "/game";
  const hasReconnectContext = hasRouteReconnectContext({
    roomState,
    playerId,
    intentExists: Boolean(intentRef.current),
    locationSearch: location.search,
  });
  const showErrorScreen = Boolean(fatalErrorMessage && (isLobbyRoute || isGameRoute));
  const showRoomRouteIssue =
    (isExactLobbyRoute || isExactGameRoute) && !showErrorScreen && !hasReconnectContext;
  const exitToMenu = () => {
    clearAppErrors();
    hardResetSession();
    navigate("/");
  };
  const renderRouteIssueScreen = (message: string) => (
    <RouteIssuePanel
      appTitle={appNs.t("appTitle")}
      title={appLocale.routeIssueTitle}
      message={message}
      exitLabel={appLocale.errorScreenExitToMenu}
      onExit={exitToMenu}
    />
  );

  return (
    <ErrorBoundary onReset={() => hardResetSession({ clearLastRoom: true })}>
      <div className={`app${compactMode ? " app--compact" : ""}`}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            {appNs.t("appTitle")}
          </div>
          {showDevIdentityBadge ? <span className="pill">{appLocale.devBadge}</span> : null}
          {showConnectionStatus ? (
            <>
              <span className={`status ${connectionDisplay.className}`}>{connectionDisplay.label}</span>
              {connectionDisplay.hint ? <span className="status-hint">{connectionDisplay.hint}</span> : null}
              {lastWsError ? <span className="status-error">{lastWsError}</span> : null}
              {showRolePillCompact ? <span className="pill role-pill role-pill-mobile">{roleLabel}</span> : null}
            </>
          ) : null}
        </div>
        <div className="topbar-center">
          {showDevSkipRound ? (
            <div className="dev-topbar-controls">
              <button className="ghost button-small" onClick={handleDevSkipRound}>
                {devSkipRoundButtonLabel}
              </button>
              {showRolePill ? <span className="pill role-pill">{roleLabel}</span> : null}
              {showDevKick ? (
                <button
                  className="ghost button-small"
                  onClick={() => {
                    setDevKickAgree(false);
                    setDevKickModalOpen(true);
                  }}
                >
                  {appLocale.devKickButton}
                </button>
              ) : null}
            </div>
          ) : showRolePill && !showRolePillCompact ? (
            <span className="pill role-pill">{roleLabel}</span>
          ) : isSpectateRoute ? (
            <span className="pill role-pill">{appLocale.spectatorLinkTitle}</span>
          ) : null}
        </div>
        <div className="topbar-rightArea">
          <div className="topbar-actions">
            {roomState && !isSpectateRoute ? (
              <div className={`topbar-room${isLobbyRoute ? " topbar-room-lobby" : ""}`}>
                <span
                  className={`topbar-room-code${roomCodeDisplay.hidden ? " maskedText" : ""}`}
                  title={roomCodeDisplay.hidden ? appLocale.showSecret : roomState.roomCode}
                >
                  {roomCodeDisplay.label}
                </span>
                {showRolePillCompact ? <span className="pill role-pill topbar-room-role">{roleLabel}</span> : null}
                <span>{appLocale.scenarioPill(roomState.scenarioMeta.name)}</span>
                {isLobbyRoute ? (
                  <div className="topbar-room-controls">
                    <button
                      type="button"
                      className="ghost iconButton"
                      aria-label={roomCodeDisplay.hidden ? appLocale.showSecret : appLocale.hideSecret}
                      title={roomCodeDisplay.hidden ? appLocale.showSecret : appLocale.hideSecret}
                      onClick={() => setShowRoomCode((prev) => !prev)}
                    >
                      <EyeIcon open={!roomCodeDisplay.hidden} />
                    </button>
                    <button type="button" className="ghost button-small" onClick={handleCopyRoomCode}>
                      {roomCodeCopied ? appLocale.copiedButton : appLocale.copyButton}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="topbar-rightStack">
            <div className="topbar-uiTools">
              <AppSettingsPopover
                popoverRef={settingsMenuRef}
                locale={{
                  settingsTitle: appLocale.settingsTitle,
                  settingsGameSectionTitle: appLocale.settingsGameSectionTitle,
                  streamerModeLabel: appLocale.streamerModeLabel,
                  settingsShowRoomCodeInLobby: appLocale.settingsShowRoomCodeInLobby,
                  settingsToastPosition: appLocale.settingsToastPosition,
                  toastPosTopRight: appLocale.toastPosTopRight,
                  toastPosTopLeft: appLocale.toastPosTopLeft,
                  toastPosBottomRight: appLocale.toastPosBottomRight,
                  toastPosBottomLeft: appLocale.toastPosBottomLeft,
                  settingsToastDuration: appLocale.settingsToastDuration,
                  toastDuration3s: appLocale.toastDuration3s,
                  toastDuration4s: appLocale.toastDuration4s,
                  toastDuration6s: appLocale.toastDuration6s,
                  settingsUiScale: appLocale.settingsUiScale,
                  settingsReduceMotion: appLocale.settingsReduceMotion,
                  settingsConfirmDangerous: appLocale.settingsConfirmDangerous,
                  settingsConfirmExit: appLocale.settingsConfirmExit,
                  settingsCompactMode: appLocale.settingsCompactMode,
                  settingsAutoCopyRoomCode: appLocale.settingsAutoCopyRoomCode,
                  settingsShowSpectatorLinks: appLocale.settingsShowSpectatorLinks,
                  settingsShowHints: appLocale.settingsShowHints,
                  settingsAiAccessKey: appLocale.settingsAiAccessKey,
                  settingsAiAccessKeyPlaceholder: appLocale.settingsAiAccessKeyPlaceholder,
                  settingsAiAccessValidate: appLocale.settingsAiAccessValidate,
                  settingsAiAccessChecking: appLocale.settingsAiAccessChecking,
                  settingsAiAccessValid: appLocale.settingsAiAccessValid,
                  settingsAiAccessInvalid: appLocale.settingsAiAccessInvalid,
                  settingsResetUi: appLocale.settingsResetUi,
                  settingsLocaleSectionTitle: appLocale.settingsLocaleSectionTitle,
                  localeRu: appLocale.localeRu,
                  localeEnBeta: appLocale.localeEnBeta,
                }}
                open={settingsMenuOpen}
                setOpen={setSettingsMenuOpen}
                closeThemeMenu={() => setThemeMenuOpen(false)}
                settingsSectionsCollapsed={settingsSectionsCollapsed}
                toggleSettingsSection={toggleSettingsSection}
                isSpectateRoute={isSpectateRoute}
                streamerMode={streamerMode}
                setStreamerMode={setStreamerMode}
                showRoomCode={showRoomCode}
                setShowRoomCode={setShowRoomCode}
                toastPosition={toastPosition}
                setToastPosition={setToastPosition}
                toastDuration={toastDuration}
                setToastDuration={setToastDuration}
                uiScale={uiScale}
                setUiScale={setUiScale}
                reduceMotion={reduceMotion}
                setReduceMotion={setReduceMotion}
                confirmDangerousActions={confirmDangerousActions}
                setConfirmDangerousActions={setConfirmDangerousActions}
                confirmExitGame={confirmExitGame}
                setConfirmExitGame={setConfirmExitGame}
                compactMode={compactMode}
                setCompactMode={setCompactMode}
                autoCopyRoomCode={autoCopyRoomCode}
                setAutoCopyRoomCode={setAutoCopyRoomCode}
                showSpectatorLinks={showSpectatorLinks}
                setShowSpectatorLinks={setShowSpectatorLinks}
                showHints={showHints}
                setShowHints={setShowHints}
                aiAccessKey={aiAccessKey}
                setAiAccessKey={(value) => {
                  setAiAccessKey(value);
                  setAiAccessValidation("idle");
                }}
                aiAccessValidation={aiAccessValidation}
                onValidateAiAccessKey={validateAiAccessKey}
                handleResetUiSettings={handleResetUiSettings}
                localeCode={locale}
                setLocale={setLocale}
              />
              <AppThemePopover
                popoverRef={themeMenuRef}
                title={appLocale.themeTitle}
                theme={theme}
                options={THEME_OPTIONS}
                open={themeMenuOpen}
                setOpen={setThemeMenuOpen}
                setTheme={setTheme}
                closeSettingsMenu={() => setSettingsMenuOpen(false)}
              />
            </div>
            <div className="topbar-actionButtons">
              {roomState && isControl && !isSpectateRoute && !isLobbyRoute ? (
                <button className="ghost button-small" onClick={openTransferHostModal}>
                  {appLocale.transferHostButton}
                </button>
              ) : null}
              {roomState ? (
                <button className="primary topbar-exit-button" onClick={() => handleExitGame()}>
                  {appLocale.exitButton}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="error-banner">
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {!isMobile ? (
        <div className={`toast-stack toast-pos-${toastPosition}`}>
          {visibleUiToasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.variant}`.trim()}>
              <div className="toast-kind">{appLocale.notificationTitle}</div>
              <div>{toast.message}</div>
              <button className="toast-close" onClick={() => removeUiToast(toast.id)} aria-label={appLocale.closeButton}>
                {"\u00D7"}
              </button>
            </div>
          ))}
          {visibleEventToasts.map((toast) => {
            const variant =
              toast.kind === "playerDisconnected" || toast.kind === "playerLeftBunker"
                ? "danger"
                : toast.kind === "playerReconnected"
                  ? "success"
                  : "";
            return (
              <div key={toast.id} className={`toast ${variant}`.trim()}>
                <div className="toast-kind">{appLocale.toastKind(toast.kind)}</div>
                <div>{toast.message}</div>
                <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label={appLocale.closeButton}>
                  {"\u00D7"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={`toast-stack-mobile toast-pos-${toastPosition}`}>
          {mobileToasts.map((toast) => (
            <div key={toast.id} className={`toast-mobile ${toast.variant}`.trim()}>
              <div className="toast-mobile-header">
                <div className="toast-mobile-title">{toast.title}</div>
                <button className="toast-mobile-close" onClick={toast.onClose} aria-label={appLocale.closeButton}>
                  {"\u00D7"}
                </button>
              </div>
              <div className="toast-mobile-message">{toast.message}</div>
            </div>
          ))}
        </div>
      )}

      <main className="container">
        {showErrorScreen ? (
          <ErrorScreen
            message={fatalErrorMessage ?? appLocale.errorReconnectNetwork}
            canRetry={Boolean(intentRef.current)}
            reconnecting={connectionStatus === "reconnecting"}
            onRetry={() => void handleRetry()}
          />
        ) : null}
        <AnimatedRouteContainer>
          <Routes location={location}>
            <Route
              path="/"
              element={
                <HomePage
                  scenarios={scenarios}
                  scenariosLoading={scenariosLoading}
                  onCreate={handleCreate}
                  onJoin={handleJoin}
                  devBadgeActive={showDevIdentityBadge}
                />
              }
            />
            <Route
              path="/lobby"
              element={
                showRoomRouteIssue ? (
                  renderRouteIssueScreen(appLocale.routeIssueRoomMessage)
                ) : (
                  <LobbyPage
                    roomState={roomState}
                    playerId={playerId}
                    playerToken={playerToken}
                    isControl={Boolean(isControl)}
                    streamerMode={streamerMode}
                    showSpectatorLinks={showSpectatorLinks}
                    showHints={showHints}
                    wsInteractive={wsInteractive}
                    onStart={handleStart}
                    onUpdateSettings={handleUpdateSettings}
                    onUpdateRules={handleUpdateRules}
                    onKickPlayer={handleKickFromLobby}
                    onTransferHost={handleRequestHostTransfer}
                  />
                )
              }
            />
            <Route
              path="/game"
              element={
                showRoomRouteIssue ? (
                  renderRouteIssueScreen(appLocale.routeIssueRoomMessage)
                ) : (
                  <GamePage
                    roomState={roomState}
                    gameView={gameView}
                      isControl={Boolean(isControl)}
                      presenterModeEnabled={presenterModeEnabled}
                      showHints={showHints}
                      wsInteractive={wsInteractive}
                      eventLog={eventLog}
                    onRevealCard={handleRevealCard}
                    onVote={handleVote}
                    onApplySpecial={handleApplySpecial}
                    onFinalizeVoting={handleFinalizeVoting}
                    onContinueRound={handleContinueRound}
                    onSendMatchMessage={handleSendMatchMessage}
                    onRevealWorldThreat={handleRevealWorldThreat}
                    onSetBunkerOutcome={handleSetBunkerOutcome}
                    onDevAddPlayer={handleDevAddPlayer}
                    onDevRemovePlayer={handleDevRemovePlayer}
                    onExitGame={handleExitGame}
                    mobileDossierError={mobileDossierError}
                    onMarkDossierSpecialAction={markDossierSpecialAction}
                    onClearMobileDossierError={clearMobileDossierError}
                  />
                )
              }
            />
            <Route path="/spectate" element={<SpectatorTablePage />} />
            <Route path="*" element={renderRouteIssueScreen(appLocale.routeIssueNotFoundMessage)} />
          </Routes>
        </AnimatedRouteContainer>
      </main>

      <AppModalLayer
        locale={appLocale}
        dangerConfirmMessage={dangerConfirmMessage}
        onResolveDangerConfirm={resolveDangerousActionConfirm}
        transferHostOpen={transferHostModalOpen}
        transferHostEnabled={Boolean(roomState && isControl && !isSpectateRoute && !isLobbyRoute)}
        transferHostCandidates={transferHostCandidates}
        transferHostTargetId={transferHostTargetId}
        transferHostAgree={transferHostAgree}
        onTransferHostTargetIdChange={setTransferHostTargetId}
        onTransferHostAgreeChange={setTransferHostAgree}
        onCloseTransferHost={() => {
          setTransferHostModalOpen(false);
          setTransferHostAgree(false);
        }}
        onSubmitTransferHost={handleTransferHostFromModal}
        exitConfirmOpen={exitConfirmModalOpen}
        onCloseExitConfirm={() => setExitConfirmModalOpen(false)}
        onConfirmExit={() => {
          setExitConfirmModalOpen(false);
          performExitGame();
        }}
        devKickOpen={devKickModalOpen && showDevKick}
        devKickCandidates={devKickCandidates}
        devKickTargetId={devKickTargetId}
        devKickAgree={devKickAgree}
        onDevKickTargetIdChange={setDevKickTargetId}
        onDevKickAgreeChange={setDevKickAgree}
        onCloseDevKick={() => {
          setDevKickModalOpen(false);
          setDevKickTargetId("");
          setDevKickAgree(false);
        }}
        onSubmitDevKick={handleDevKickPlayer}
      />
    </div>
    </ErrorBoundary>
  );
}
