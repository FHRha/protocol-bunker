import { useEffect, useMemo, useRef, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type {
  GameEvent,
  GameSettings,
  GameView,
  ManualRulesConfig,
  RoomState,
  ScenarioMeta,
} from "@bunker/shared";
import { BunkerClient, type ConnectionStatus } from "./wsClient";
import { API_BASE, DEV_TAB_IDENTITY, IDENTITY_MODE, WS_URL } from "./config";
import { clearPlayerToken, initTabIdentity, readPlayerToken, writePlayerToken } from "./storage";
import {
  getCurrentLocale,
  setCurrentLocale,
  type LocaleCode,
  useUiLocaleNamespace,
} from "./localization";
import Modal from "./components/Modal";
import EyeIcon from "./components/EyeIcon";
import AnimatedRouteContainer from "./components/AnimatedRouteContainer";
import ErrorBoundary from "./components/ErrorBoundary";
import ErrorScreen from "./components/ErrorScreen";
import HomePage from "./pages/HomePage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import SpectatorTablePage from "./pages/SpectatorTablePage";
import { useUiLocaleNamespacesActivation } from "./localization/useUiLocaleNamespacesActivation";

const THEME_STORAGE_KEY = "bunker.theme";
const STREAMER_MODE_KEY = "bunker.streamerMode";
const SHOW_ROOM_CODE_KEY = "bunker.showRoomCode";
const TOAST_POSITION_KEY = "bunker.toastPosition";
const UI_SCALE_KEY = "bunker.uiScale";
const REDUCE_MOTION_KEY = "bunker.reduceMotion";
const CONFIRM_DANGEROUS_KEY = "bunker.confirmDangerousActions";
const CONFIRM_EXIT_KEY = "bunker.confirmExitGame";
const COMPACT_MODE_KEY = "bunker.compactMode";
const AUTO_COPY_ROOM_CODE_KEY = "bunker.autoCopyRoomCode";
const SHOW_SPECTATOR_LINKS_KEY = "bunker.showSpectatorLinks";
const SHOW_HINTS_KEY = "bunker.showHints";
const TOAST_DURATION_KEY = "bunker.toastDurationMs";
const MAX_EVENTS = 20;
const SNAPSHOT_TIMEOUT_MS = 8000;
const SESSION_ID_KEY = "bunker.sessionId";

type ThemeMode =
  | "dark-mint"
  | "light-paper"
  | "cyber-amber"
  | "steel-blue"
  | "crimson-night";
type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";
type UiScale = "90" | "100" | "110";
type ToastDuration = "3000" | "4000" | "6000";
type UiToast = { id: string; message: string; variant: "danger" | "success" | "info" };
type RulesUpdatePayload = {
  mode: "auto" | "manual";
  presetPlayerCount?: number;
  manualConfig?: ManualRulesConfig;
};

type SessionIntent =
  | { mode: "create"; name: string; scenarioId: string; locale: LocaleCode; tabId?: string }
  | { mode: "join"; name: string; roomCode: string; playerToken?: string; tabId?: string }
  | { mode: "reconnect"; name: string; roomCode: string; playerToken?: string; tabId?: string };


function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark-mint";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (
    stored === "dark-mint" ||
    stored === "light-paper" ||
    stored === "cyber-amber" ||
    stored === "steel-blue" ||
    stored === "crimson-night"
  ) {
    return stored;
  }
  if (stored === "dark") return "dark-mint";
  if (stored === "light") return "light-paper";
  return "dark-mint";
}

function getInitialStreamerMode(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(STREAMER_MODE_KEY) !== "0";
}

function getInitialShowRoomCode(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(SHOW_ROOM_CODE_KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return localStorage.getItem(STREAMER_MODE_KEY) === "0";
}

function getInitialToastPosition(): ToastPosition {
  if (typeof window === "undefined") return "top-right";
  const stored = localStorage.getItem(TOAST_POSITION_KEY);
  if (
    stored === "top-right" ||
    stored === "top-left" ||
    stored === "bottom-right" ||
    stored === "bottom-left"
  ) {
    return stored;
  }
  return "top-right";
}

function getInitialUiScale(): UiScale {
  if (typeof window === "undefined") return "100";
  const stored = localStorage.getItem(UI_SCALE_KEY);
  if (stored === "90" || stored === "100" || stored === "110") {
    return stored;
  }
  return "100";
}

function getInitialReduceMotion(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(REDUCE_MOTION_KEY) === "1";
}

function getInitialConfirmDangerousActions(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(CONFIRM_DANGEROUS_KEY);
  if (stored === "0") return false;
  return true;
}

function getInitialConfirmExitGame(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(CONFIRM_EXIT_KEY);
  if (stored === "0") return false;
  return true;
}

function getInitialToastDuration(): ToastDuration {
  if (typeof window === "undefined") return "4000";
  const stored = localStorage.getItem(TOAST_DURATION_KEY);
  if (stored === "3000" || stored === "4000" || stored === "6000") return stored;
  return "4000";
}

function getInitialCompactMode(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(COMPACT_MODE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return true;
}

function getInitialAutoCopyRoomCode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTO_COPY_ROOM_CODE_KEY) === "1";
}

function getInitialShowSpectatorLinks(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(SHOW_SPECTATOR_LINKS_KEY);
  if (stored === "0") return false;
  return true;
}

function getInitialShowHints(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(SHOW_HINTS_KEY);
  if (stored === "0") return false;
  return true;
}

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

function getOrCreateSessionId(useSessionStorage: boolean): string {
  const storage = useSessionStorage ? window.sessionStorage : window.localStorage;
  const existing = storage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  storage.setItem(SESSION_ID_KEY, generated);
  return generated;
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
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1250px)").matches : false
  );
  const [isMobileNarrow, setIsMobileNarrow] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 600px)").matches : false
  );
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
  const sessionIdRef = useRef<string | null>(null);
  const lastHelloAtRef = useRef<number | null>(null);
  const reconnectPendingRef = useRef(false);
  const dossierActionRef = useRef(false);
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);
  const autoCopiedRoomCodeRef = useRef<string | null>(null);
  const dangerConfirmResolveRef = useRef<((value: boolean) => void) | null>(null);
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
  const roleLabel = isControl ? appLocale.roleControl : isHost ? appLocale.roleHost : appLocale.rolePlayer;
  const statusLabel =
    connectionStatus === "connected"
      ? appLocale.statusOnline
      : connectionStatus === "reconnecting"
        ? appLocale.statusReconnecting
        : appLocale.statusOffline;
  const statusClass =
    connectionStatus === "connected"
      ? "online"
      : connectionStatus === "reconnecting"
        ? "reconnecting"
        : "offline";
  const statusHint =
    connectionStatus === "reconnecting"
      ? appLocale.statusReconnectHint
      : connectionStatus === "disconnected"
        ? appLocale.statusOfflineHint
        : null;
  const devKickCandidates =
    gameView?.public.players.filter(
      (player) => player.status === "alive" && player.playerId !== playerId
    ) ?? [];
  const transferHostCandidates =
    roomState?.players.filter((player) => player.playerId !== roomState.hostId) ?? [];
  const devSkipRoundButtonLabel = safeLabel(appLocale.devSkipRoundButton, "DEV");

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

  const buildHelloPayload = (intent: SessionIntent) => {
    const effectiveSessionId = sessionIdRef.current ?? sessionId ?? undefined;
    if (intent.mode === "create") {
	  return {
		name: intent.name,
		create: true,
		scenarioId: intent.scenarioId,
		locale: intent.locale,
		tabId: intent.tabId,
		sessionId: effectiveSessionId,
	  };
	}
    return {
      name: intent.name,
      roomCode: intent.roomCode,
      playerToken: intent.playerToken,
      tabId: intent.tabId,
      sessionId: effectiveSessionId,
      locale,
    };
  };

  const sendHelloWithIntent = async (intent: SessionIntent) => {
    ensureSessionId();
    const payload = buildHelloPayload(intent);
    startSnapshotWait(true);
    lastHelloAtRef.current = Date.now();
    if (IDENTITY_MODE !== "prod") {
      console.log("[dev] hello sent", intent);
    }
    await client.connect();
    client.send({ type: "hello", payload });
  };

  const getResumePayload = () => {
    const roomCode =
      roomStateRef.current?.roomCode ??
      new URLSearchParams(location.search).get("room") ??
      localStorage.getItem("bunker.lastRoomCode") ??
      "";
    const sessionIdValue = sessionIdRef.current ?? sessionId ?? "";
    if (!roomCode || !sessionIdValue) return null;
    return { roomCode: roomCode.toUpperCase(), sessionId: sessionIdValue };
  };

  const sendResume = async () => {
    ensureSessionId();
    const payload = getResumePayload();
    if (!payload) return;
    const expectGameView =
      roomStateRef.current?.phase === "game" || location.pathname.startsWith("/game");
    startSnapshotWait(expectGameView);
    lastHelloAtRef.current = Date.now();
    if (IDENTITY_MODE !== "prod") {
      console.log("[dev] resume sent", payload.roomCode);
    }
    await client.connect(true);
    client.send({ type: "resume", payload });
  };



  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
  document.title = appNs.t("appTitle");
  }, [appNs, locale]);

  useEffect(() => {
    setCurrentLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    try {
      client.send({ type: "updateLocale", payload: { locale } });
    } catch {
      // ignore transient reconnect race
    }
  }, [client, connectionStatus, locale]);

  useEffect(() => {
    localStorage.setItem(STREAMER_MODE_KEY, streamerMode ? "1" : "0");
    if (!streamerMode) {
      setShowRoomCode(true);
      return;
    }
    if (localStorage.getItem(SHOW_ROOM_CODE_KEY) === null) {
      setShowRoomCode(false);
    }
  }, [streamerMode]);

  useEffect(() => {
    localStorage.setItem(SHOW_ROOM_CODE_KEY, showRoomCode ? "1" : "0");
  }, [showRoomCode]);

  useEffect(() => {
    localStorage.setItem(TOAST_POSITION_KEY, toastPosition);
  }, [toastPosition]);

  useEffect(() => {
    localStorage.setItem(UI_SCALE_KEY, uiScale);
    document.documentElement.dataset.uiScale = uiScale;
  }, [uiScale]);

  useEffect(() => {
    localStorage.setItem(REDUCE_MOTION_KEY, reduceMotion ? "1" : "0");
    document.documentElement.dataset.motion = reduceMotion ? "off" : "on";
  }, [reduceMotion]);

  useEffect(() => {
    localStorage.setItem(CONFIRM_DANGEROUS_KEY, confirmDangerousActions ? "1" : "0");
  }, [confirmDangerousActions]);

  useEffect(() => {
    localStorage.setItem(CONFIRM_EXIT_KEY, confirmExitGame ? "1" : "0");
  }, [confirmExitGame]);

  useEffect(() => {
    localStorage.setItem(TOAST_DURATION_KEY, toastDuration);
  }, [toastDuration]);

  useEffect(() => {
    localStorage.setItem(COMPACT_MODE_KEY, compactMode ? "1" : "0");
  }, [compactMode]);

  useEffect(() => {
    localStorage.setItem(AUTO_COPY_ROOM_CODE_KEY, autoCopyRoomCode ? "1" : "0");
  }, [autoCopyRoomCode]);

  useEffect(() => {
    localStorage.setItem(SHOW_SPECTATOR_LINKS_KEY, showSpectatorLinks ? "1" : "0");
  }, [showSpectatorLinks]);

  useEffect(() => {
    localStorage.setItem(SHOW_HINTS_KEY, showHints ? "1" : "0");
  }, [showHints]);

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
    setSettingsMenuOpen(false);
    setThemeMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(target)) {
        setSettingsMenuOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(target)) {
        setThemeMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsMenuOpen(false);
        setThemeMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    if (isMobile) {
      html.classList.add("viewport-compact");
      body.classList.add("viewport-compact");
    } else {
      html.classList.remove("viewport-compact");
      body.classList.remove("viewport-compact");
    }
  }, [isMobile]);

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

  const applyRoomStatePatch = (patch: Partial<RoomState>) => {
    setRoomState((prev) => {
      if (!prev) {
        void sendResume();
        return prev;
      }
      return { ...prev, ...patch };
    });
    awaitingRoomStateRef.current = false;
    if (!awaitingGameViewRef.current) {
      clearSnapshotTimer();
    }
  };

  const applyGameViewPatch = (patch: Partial<GameView>) => {
    setGameView((prev) => {
      if (!prev) {
        void sendResume();
        return prev;
      }
      return { ...prev, ...patch };
    });
    awaitingGameViewRef.current = false;
    if (!awaitingRoomStateRef.current) {
      clearSnapshotTimer();
    }
  };

  useEffect(() => {
    const unsubscribeMessage = client.onMessage((message) => {
      switch (message.type) {
        case "helloAck":
          setPlayerId(message.payload.playerId);
          setPlayerToken(message.payload.playerToken);
          if (IDENTITY_MODE !== "prod") {
            console.log("[dev] helloAck", { playerId: message.payload.playerId });
          }
          if (DEV_TAB_IDENTITY) {
            console.log("[dev] tabId/playerId", { tabId, playerId: message.payload.playerId });
          }
          return;
        case "roomState":
          setRoomState(message.payload);
          clearAppErrors();
          if (IDENTITY_MODE !== "prod") {
            console.log("[dev] roomState", message.payload.roomCode, message.payload.phase);
          }
          awaitingRoomStateRef.current = false;
          if (message.payload.phase === "lobby") {
            setGameView(null);
            clearSnapshotTimer();
          } else if (gameViewRef.current) {
            clearSnapshotTimer();
          }
          return;
        case "gameView":
          setGameView(message.payload);
          clearAppErrors();
          setMobileDossierError(null);
          dossierActionRef.current = false;
          if (IDENTITY_MODE !== "prod") {
            console.log("[dev] gameView", message.payload.phase, message.payload.round);
            if (message.payload.postGame?.outcome) {
              console.log("[dev] postGame outcome", message.payload.postGame.outcome);
            }
          }
          awaitingGameViewRef.current = false;
          if (roomStateRef.current?.phase === "game") {
            clearSnapshotTimer();
          }
          return;
        case "statePatch": {
          if (message.payload.roomState) {
            applyRoomStatePatch(message.payload.roomState);
          }
          if (message.payload.gameView) {
            applyGameViewPatch(message.payload.gameView);
          }
          return;
        }
        case "gameEvent":
          pushEvent(message.payload);
          return;
        case "hostChanged": {
          const newHostId = message.payload.newHostId;
          setRoomState((prev) => (prev ? { ...prev, hostId: newHostId } : prev));
          if (newHostId === playerId) {
            clearAppErrors();
            pushUiToast(appLocale.hostChangedYou, "success");
            return;
          }
          const candidate =
            roomStateRef.current?.players.find((player) => player.playerId === newHostId) ??
            gameViewRef.current?.public.players.find((player) => player.playerId === newHostId);
          pushUiToast(appLocale.hostChangedOther(candidate?.name ?? appLocale.genericPlayer), "info");
          return;
        }
        case "error": {
          const msg = message.payload.message;
          const code = message.payload.code;
          const maxPlayers = message.payload.maxPlayers;
          const isPermissionError =
            code === "PERMISSION_DENIED" ||
            messageIncludesAny(msg, [
              "action is available only for control role",
              "insufficient permissions for player action",
              "only control can",
              "only host can",
              "only presenter can",
            ]);
          if (isMobileNarrow && dossierActionRef.current) {
            setMobileDossierError(msg);
            dossierActionRef.current = false;
            return;
          }
          if (isPermissionError && connectionStatus === "connected") {
            clearAppErrors();
            pushUiToast(msg, "danger");
            return;
          }
          if (
            code === "ROOM_FULL" ||
            messageIncludesAny(msg, [appLocale.roomFullUnknown, "room is full"])
          ) {
            const roomFullMessage =
              typeof maxPlayers === "number" && Number.isFinite(maxPlayers)
                ? appLocale.roomFull(maxPlayers)
                : appLocale.roomFullUnknown;
            pushUiToast(roomFullMessage, "danger");
            hardResetSession({ clearLastRoom: true });
            navigate("/");
            return;
          }
          setErrorMessage(msg);
          if (code === "RECONNECT_FORBIDDEN") {
            hardResetSession({ clearLastRoom: true, preserveError: true });
            navigate("/");
            return;
          }
          if (code === "LEFT_BUNKER" || messageIncludesAny(msg, ["left bunker"])) {
            hardResetSession({ clearLastRoom: true, preserveError: true });
            navigate("/");
            return;
          }
          if (isReconnectError(msg, code)) {
            setFatalErrorMessage(msg);
            // Keep token/session for quick retry; clear only on explicit "left bunker" timeout.
            hardResetSession({ preserveError: true });
            navigate("/");
          }
          return;
        }
        default:
          return;
      }
    });

    const unsubscribeStatus = client.onStatus((status, error) => {
      if (IDENTITY_MODE !== "prod") {
        console.log("[dev] ws status", status, error ?? "");
      }
      setConnectionStatus(status);
      setLastWsError(error ?? null);
      if (status === "reconnecting") {
        if (roomStateRef.current || intentRef.current) {
          reconnectPendingRef.current = true;
        }
      }
      if (status === "connected" && reconnectPendingRef.current) {
        reconnectPendingRef.current = false;
        if (roomStateRef.current) {
          void sendResume();
        } else if (intentRef.current) {
          void sendHelloWithIntent(intentRef.current);
        }
      }
    });

    return () => {
      unsubscribeMessage();
      unsubscribeStatus();
    };
  }, [client, isMobileNarrow]);

  useEffect(() => {
    const roomCode = roomState?.roomCode;
    const phase = roomState?.phase;
    if (!roomCode || !phase) return;
    if (isSpectateRoute) return;

    const targetPath = phase === "lobby" ? "/lobby" : "/game";
    const targetSearch = `?room=${encodeURIComponent(roomCode)}`;
    const currentSearch = location.search || "";

    if (location.pathname === targetPath && currentSearch === targetSearch) {
      return;
    }

    navigate(`${targetPath}${targetSearch}`, { replace: true });
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
    if (roomState || playerId) return;
    const roomFromUrl = new URLSearchParams(location.search).get("room");
    const hasRoomInUrl = Boolean(roomFromUrl);
    const shouldAttempt =
      hasRoomInUrl || location.pathname.startsWith("/game") || location.pathname.startsWith("/lobby");
    if (!shouldAttempt) return;

    const roomCode = (roomFromUrl ?? localStorage.getItem("bunker.lastRoomCode") ?? "")
      .trim()
      .toUpperCase();
    const name = localStorage.getItem("bunker.playerName") ?? "";
    if (!roomCode || !name) return;

    const token = IDENTITY_MODE === "prod" ? readPlayerToken(roomCode) : undefined;
    const effectiveTabId = IDENTITY_MODE === "dev_tab" ? tabId : undefined;
    if (IDENTITY_MODE === "dev_tab" && !effectiveTabId) return;
    const intent: SessionIntent = {
      mode: "reconnect",
      name,
      roomCode,
      playerToken: token,
      tabId: effectiveTabId,
    };
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
    clearAppErrors();
    localStorage.setItem("bunker.playerName", name);
    let effectiveTabId = tabId;
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      effectiveTabId = await initTabIdentity();
      if (effectiveTabId) {
        setTabId(effectiveTabId);
      }
    }
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
      return;
    }
    const intent: SessionIntent = {
	  mode: "create",
	  name,
	  scenarioId,
	  locale,
	  tabId: DEV_TAB_IDENTITY ? effectiveTabId : undefined,
	};
    intentRef.current = intent;
    try {
      await sendHelloWithIntent(intent);
    } catch {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
    }
  };

  const handleJoin = async (name: string, roomCode: string) => {
    clearAppErrors();
    localStorage.setItem("bunker.playerName", name);
    let effectiveTabId = tabId;
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      effectiveTabId = await initTabIdentity();
      if (effectiveTabId) {
        setTabId(effectiveTabId);
      }
    }
    const token = DEV_TAB_IDENTITY ? undefined : readPlayerToken(roomCode);
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
      return;
    }
    const intent: SessionIntent = {
      mode: "join",
      name,
      roomCode,
      playerToken: token,
      tabId: DEV_TAB_IDENTITY ? effectiveTabId : undefined,
    };
    intentRef.current = intent;
    try {
      await sendHelloWithIntent(intent);
    } catch {
      setFatalErrorMessage(appLocale.errorReconnectNetwork);
    }
  };

  const handleStart = () => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "startGame", payload: {} });
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
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "revealCard", payload: { cardId } });
  };

  const handleVote = (targetPlayerId: string) => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "vote", payload: { targetPlayerId } });
  };

  const handleApplySpecial = (specialInstanceId: string, payload?: Record<string, unknown>) => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "applySpecial", payload: { specialInstanceId, payload } });
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
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "finalizeVoting", payload: {} });
  };

  const handleContinueRound = () => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "continueRound", payload: {} });
  };

  const handleRevealWorldThreat = (index: number) => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "revealWorldThreat", payload: { index } });
  };

  const handleSetBunkerOutcome = (outcome: "survived" | "failed") => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    if (IDENTITY_MODE !== "prod") {
      console.log("[dev] setBunkerOutcome", outcome);
    }
    client.send({ type: "setBunkerOutcome", payload: { outcome } });
  };

  const handleDevSkipRound = async () => {
    if (!ensureWsInteractive()) return;
    if (!(await confirmDangerousAction(appLocale.confirmSkipRound))) return;
    clearAppErrors();
    client.send({ type: "devSkipRound", payload: {} });
  };

  const handleDevKickPlayer = async () => {
    if (!ensureWsInteractive()) return;
    if (!devKickTargetId) return;
    if (!devKickAgree) return;
    clearAppErrors();
    client.send({ type: "devKickPlayer", payload: { targetPlayerId: devKickTargetId } });
    setDevKickModalOpen(false);
    setDevKickTargetId("");
    setDevKickAgree(false);
  };

  const handleUpdateSettings = (settings: GameSettings) => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "updateSettings", payload: settings });
  };

  const handleUpdateRules = (payload: RulesUpdatePayload) => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "updateRules", payload });
  };

  const handleKickFromLobby = async (
    targetPlayerId: string,
    options?: { skipConfirm?: boolean }
  ) => {
    if (!ensureWsInteractive()) return;
    if (!options?.skipConfirm) {
      if (!(await confirmDangerousAction(appLocale.confirmKickFromLobby))) return;
    }
    clearAppErrors();
    client.send({ type: "kickFromLobby", payload: { targetPlayerId } });
  };

  const handleRequestHostTransfer = async (
    targetPlayerId?: string,
    options?: { skipConfirm?: boolean }
  ) => {
    if (!ensureWsInteractive()) return;
    if (!options?.skipConfirm) {
      if (!(await confirmDangerousAction(appLocale.confirmTransferHost))) return;
    }
    clearAppErrors();
    const normalizedTargetId = String(targetPlayerId ?? "").trim();
    client.send({
      type: "requestHostTransfer",
      payload: normalizedTargetId ? { targetPlayerId: normalizedTargetId } : {},
    });
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
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "devAddPlayer", payload: { name } });
  };

  const handleDevRemovePlayer = (targetPlayerId?: string) => {
    if (!ensureWsInteractive()) return;
    clearAppErrors();
    client.send({ type: "devRemovePlayer", payload: { targetPlayerId } });
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
  };

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

  const visibleUiToasts = isMobile ? uiToasts.slice(-1) : uiToasts;
  const visibleToasts = isMobile ? toasts.slice(-2) : toasts;
  const mobileToasts = isMobile
    ? [
        ...visibleUiToasts.map((toast) => ({
          id: `ui-${toast.id}`,
          title: appLocale.notificationTitle,
          message: toast.message,
          variant: toast.variant ?? "",
          onClose: () => removeUiToast(toast.id),
        })),
        ...visibleToasts.map((toast) => {
          const variant =
            toast.kind === "playerDisconnected" || toast.kind === "playerLeftBunker"
              ? "danger"
              : toast.kind === "playerReconnected"
                ? "success"
                : "";
          return {
            id: `event-${toast.id}`,
            title: appLocale.toastKind(toast.kind),
            message: toast.message,
            variant,
            onClose: () => removeToast(toast.id),
          };
        }),
      ]
    : [];
  const roomCodeHidden = Boolean(roomState && isLobbyRoute && streamerMode && !showRoomCode);
  const roomCodeLabel = roomState
    ? appLocale.roomPill(roomCodeHidden ? appLocale.hiddenValue : roomState.roomCode)
    : "";
  const roomCodeFromUrl = new URLSearchParams(location.search).get("room")?.trim().toUpperCase() ?? "";
  const storedPlayerName =
    typeof window !== "undefined" ? (localStorage.getItem("bunker.playerName") ?? "").trim() : "";
  const isExactLobbyRoute = location.pathname === "/lobby";
  const isExactGameRoute = location.pathname === "/game";
  const hasReconnectContext =
    Boolean(roomState) ||
    Boolean(playerId) ||
    Boolean(intentRef.current) ||
    (Boolean(roomCodeFromUrl) && Boolean(storedPlayerName));
  const showErrorScreen = Boolean(fatalErrorMessage && (isLobbyRoute || isGameRoute));
  const showRoomRouteIssue =
    (isExactLobbyRoute || isExactGameRoute) && !showErrorScreen && !hasReconnectContext;
  const exitToMenu = () => {
    clearAppErrors();
    hardResetSession();
    navigate("/");
  };
  const renderRouteIssueScreen = (message: string) => (
    <section className="panel game-loading forbiddenStatePanel">
      <div className="forbiddenStateCard" role="alert">
        <div className="forbiddenStateEyebrow">{appNs.t("appTitle")}</div>
        <h3 className="forbiddenStateTitle">{appLocale.routeIssueTitle}</h3>
        <p className="forbiddenStateMessage">{message}</p>
        <div className="forbiddenStateActions">
          <button type="button" className="forbiddenStateButton" onClick={exitToMenu}>
            {appLocale.errorScreenExitToMenu}
          </button>
        </div>
      </div>
    </section>
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
              <span className={`status ${statusClass}`}>{statusLabel}</span>
              {statusHint ? <span className="status-hint">{statusHint}</span> : null}
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
                  className={`topbar-room-code${roomCodeHidden ? " maskedText" : ""}`}
                  title={roomCodeHidden ? appLocale.showSecret : roomState.roomCode}
                >
                  {roomCodeLabel}
                </span>
                <span>{appLocale.scenarioPill(roomState.scenarioMeta.name)}</span>
                {isLobbyRoute ? (
                  <div className="topbar-room-controls">
                    <button
                      type="button"
                      className="ghost iconButton"
                      aria-label={roomCodeHidden ? appLocale.showSecret : appLocale.hideSecret}
                      title={roomCodeHidden ? appLocale.showSecret : appLocale.hideSecret}
                      onClick={() => setShowRoomCode((prev) => !prev)}
                    >
                      <EyeIcon open={!roomCodeHidden} />
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
              <div className="topbar-popover" ref={settingsMenuRef}>
                <button
                  className="ghost topbar-icon-toggle"
                  aria-label={appLocale.settingsTitle}
                  title={appLocale.settingsTitle}
                  onClick={() => {
                    setSettingsMenuOpen((prev) => !prev);
                    setThemeMenuOpen(false);
                  }}
                >
                  <svg
                    className="topbar-icon-svg"
                    viewBox="0 0 32 32"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M29 12.256h-1.88c-0.198-0.585-0.405-1.072-0.643-1.541l0.031 0.067 1.338-1.324c0.35-0.3 0.57-0.742 0.57-1.236 0-0.406-0.149-0.778-0.396-1.063l0.002 0.002-3.178-3.178c-0.283-0.246-0.654-0.395-1.061-0.395-0.494 0-0.937 0.221-1.234 0.57l-0.002 0.002-1.332 1.33c-0.402-0.206-0.888-0.413-1.39-0.586l-0.082-0.025 0.009-1.88c0.003-0.04 0.005-0.086 0.005-0.133 0-0.854-0.66-1.554-1.498-1.617l-0.005-0h-4.496c-0.844 0.063-1.505 0.763-1.505 1.617 0 0.047 0.002 0.093 0.006 0.139l-0-0.006v1.879c-0.585 0.198-1.071 0.404-1.54 0.641l0.067-0.031-1.324-1.336c-0.299-0.352-0.742-0.573-1.236-0.573-0.407 0-0.778 0.15-1.063 0.397l0.002-0.002-3.179 3.179c-0.246 0.283-0.396 0.655-0.396 1.061 0 0.494 0.221 0.937 0.57 1.234l0.002 0.002 1.329 1.329c-0.207 0.403-0.414 0.891-0.587 1.395l-0.024 0.082-1.88-0.009c-0.04-0.003-0.086-0.005-0.133-0.005-0.854 0-1.554 0.661-1.617 1.499l-0 0.005v4.495c0.062 0.844 0.763 1.505 1.617 1.505 0.047 0 0.093-0.002 0.139-0.006l-0.006 0h1.88c0.198 0.585 0.404 1.072 0.642 1.541l-0.03-0.066-1.335 1.32c-0.351 0.3-0.572 0.744-0.572 1.239 0 0.407 0.149 0.779 0.396 1.064l-0.002-0.002 3.179 3.178c0.249 0.246 0.591 0.399 0.97 0.399 0.007 0 0.014-0 0.021-0h-0.001c0.515-0.013 0.977-0.231 1.308-0.576l0.001-0.001 1.33-1.33c0.403 0.207 0.891 0.414 1.395 0.587l0.082 0.025-0.009 1.878c-0.003 0.04-0.005 0.086-0.005 0.132 0 0.854 0.661 1.555 1.499 1.617l0.005 0h4.496c0.843-0.064 1.503-0.763 1.503-1.617 0-0.047-0.002-0.093-0.006-0.139l0 0.006v-1.881c0.585-0.198 1.073-0.405 1.543-0.643l-0.067 0.031 1.321 1.333c0.332 0.344 0.793 0.562 1.304 0.574l0.002 0h0.002c0.006 0 0.013 0 0.019 0 0.378 0 0.72-0.151 0.971-0.395l3.177-3.177c0.244-0.249 0.395-0.591 0.395-0.968 0-0.009-0-0.017-0-0.026l0 0.001c-0.012-0.513-0.229-0.973-0.572-1.304l-0.001-0.001-1.331-1.332c0.206-0.401 0.412-0.887 0.586-1.389l0.025-0.083 1.879 0.009c0.04 0.003 0.086 0.005 0.132 0.005 0.855 0 1.555-0.661 1.617-1.5l0-0.005v-4.495c-0.063-0.844-0.763-1.504-1.618-1.504-0.047 0-0.093 0.002-0.138 0.006l0.006-0zM29.004 18.25l-2.416-0.012c-0.02 0-0.037 0.01-0.056 0.011-0.198 0.024-0.372 0.115-0.501 0.249l-0 0c-0.055 0.072-0.103 0.153-0.141 0.24l-0.003 0.008c-0.005 0.014-0.016 0.024-0.02 0.039-0.24 0.844-0.553 1.579-0.944 2.264l0.026-0.049c-0.054 0.1-0.086 0.218-0.086 0.344 0 0.001 0 0.003 0 0.004v-0c-0 0.016 0.003 0.028 0.004 0.045 0.006 0.187 0.08 0.355 0.199 0.481l-0-0 0.009 0.023 1.707 1.709c0.109 0.109 0.137 0.215 0.176 0.176l-3.102 3.133c-0.099-0.013-0.186-0.061-0.248-0.13l-0-0-1.697-1.713c-0.008-0.009-0.022-0.005-0.03-0.013-0.121-0.112-0.28-0.183-0.456-0.193l-0.002-0c-0.02-0.003-0.044-0.005-0.068-0.006l-0.001-0c-0.125 0-0.243 0.032-0.345 0.088l0.004-0.002c-0.636 0.362-1.373 0.676-2.146 0.903l-0.074 0.019c-0.015 0.004-0.025 0.015-0.039 0.02-0.096 0.042-0.179 0.092-0.255 0.149l0.003-0.002c-0.035 0.034-0.066 0.071-0.093 0.11l-0.002 0.002c-0.027 0.033-0.053 0.07-0.075 0.11l-0.002 0.004c-0.033 0.081-0.059 0.175-0.073 0.274l-0.001 0.007c-0.001 0.016-0.01 0.031-0.01 0.047v2.412c0 0.15-0.055 0.248 0 0.25l-4.41 0.023c-0.052-0.067-0.084-0.153-0.084-0.246 0-0.008 0-0.016 0.001-0.024l-0 0.001 0.012-2.412c0-0.017-0.008-0.032-0.01-0.048-0.005-0.053-0.015-0.102-0.03-0.149l0.001 0.005c-0.012-0.053-0.028-0.1-0.048-0.145l0.002 0.005c-0.052-0.086-0.109-0.16-0.173-0.227l0 0c-0.029-0.024-0.062-0.046-0.096-0.066l-0.004-0.002c-0.044-0.03-0.093-0.056-0.146-0.076l-0.005-0.002c-0.014-0.005-0.024-0.016-0.039-0.02-0.847-0.241-1.585-0.554-2.272-0.944l0.051 0.026c-0.099-0.054-0.216-0.086-0.341-0.086h-0c-0.022-0.001-0.04 0.004-0.062 0.005-0.18 0.008-0.342 0.08-0.465 0.193l0.001-0c-0.008 0.008-0.021 0.004-0.029 0.012l-1.705 1.705c-0.107 0.107-0.216 0.139-0.178 0.178l-3.134-3.101c0.012-0.1 0.06-0.187 0.13-0.25l0-0 1.714-1.695 0.011-0.026c0.115-0.123 0.189-0.286 0.197-0.466l0-0.002c0.001-0.021 0.005-0.037 0.005-0.058 0-0.001 0-0.002 0-0.003 0-0.126-0.032-0.245-0.088-0.348l0.002 0.004c-0.365-0.636-0.679-1.371-0.903-2.145l-0.018-0.072c-0.004-0.015-0.016-0.026-0.021-0.041-0.042-0.094-0.09-0.176-0.146-0.25l0.002 0.003c-0.065-0.061-0.136-0.117-0.212-0.165l-0.006-0.003c-0.051-0.025-0.109-0.045-0.171-0.057l-0.005-0.001c-0.029-0.009-0.065-0.016-0.102-0.021l-0.004-0c-0.02-0.002-0.037-0.012-0.058-0.012h-2.412c-0.152 0.002-0.248-0.055-0.25-0.002l-0.022-4.409c0.067-0.052 0.151-0.084 0.244-0.084 0.009 0 0.017 0 0.026 0.001l-0.001-0 2.416 0.012c0.152-0.004 0.292-0.054 0.407-0.136l-0.002 0.002c0.024-0.014 0.044-0.028 0.064-0.043l-0.002 0.001c0.109-0.088 0.191-0.206 0.235-0.341l0.001-0.005c0.003-0.01 0.014-0.014 0.017-0.025 0.242-0.847 0.555-1.583 0.946-2.27l-0.026 0.05c0.054-0.1 0.086-0.218 0.086-0.344 0-0.001 0-0.001 0-0.002v0c0.001-0.019-0.003-0.033-0.004-0.052-0.007-0.184-0.08-0.35-0.197-0.475l0 0-0.01-0.024-1.705-1.705c-0.108-0.11-0.142-0.221-0.176-0.178l3.102-3.134c0.101 0.008 0.189 0.058 0.248 0.131l0.001 0.001 1.697 1.713c0.018 0.018 0.046 0.011 0.065 0.027 0.125 0.121 0.295 0.196 0.483 0.196 0.13 0 0.251-0.036 0.355-0.098l-0.003 0.002c0.636-0.364 1.372-0.677 2.145-0.902l0.072-0.018c0.014-0.004 0.024-0.015 0.038-0.019 0.057-0.021 0.105-0.047 0.151-0.077l-0.003 0.002c0.163-0.09 0.281-0.244 0.321-0.427l0.001-0.004c0.014-0.043 0.025-0.093 0.03-0.145l0-0.003c0.001-0.016 0.009-0.03 0.009-0.046v-2.412c0-0.151 0.056-0.249 0.001-0.25l4.41-0.023c0.052 0.067 0.083 0.152 0.083 0.245 0 0.009-0 0.017-0.001 0.026l0-0.001-0.012 2.412c-0 0.016 0.008 0.03 0.009 0.047 0.005 0.055 0.015 0.106 0.031 0.155l-0.001-0.005c0.071 0.234 0.243 0.419 0.464 0.506l0.005 0.002c0.014 0.005 0.025 0.016 0.039 0.02 0.845 0.242 1.58 0.555 2.265 0.945l-0.05-0.026c0.105 0.06 0.231 0.096 0.366 0.096 0 0 0.001 0 0.001 0h-0c0.183-0.008 0.347-0.082 0.471-0.198l-0 0c0.017-0.015 0.043-0.008 0.059-0.024l1.709-1.705c0.105-0.106 0.213-0.137 0.176-0.176l3.133 3.102c-0.012 0.1-0.059 0.186-0.129 0.249l-0 0-1.715 1.697-0.011 0.026c-0.116 0.123-0.19 0.287-0.198 0.468l-0 0.002c-0.001 0.02-0.005 0.036-0.005 0.056 0 0.001 0 0.002 0 0.003 0 0.126 0.032 0.245 0.088 0.348l-0.002-0.004c0.365 0.636 0.679 1.371 0.902 2.144l0.018 0.071c0.003 0.012 0.016 0.017 0.019 0.028 0.046 0.137 0.127 0.253 0.232 0.339l0.001 0.001c0.019 0.015 0.041 0.03 0.063 0.043l0.003 0.002c0.112 0.08 0.252 0.13 0.402 0.134l0.001 0h2.412c0.152-0.001 0.248 0.057 0.25 0.001l0.021 4.409c-0.065 0.053-0.149 0.085-0.24 0.085-0.01 0-0.019-0-0.029-0.001l0.001 0zM16 11.25c-2.623 0-4.75 2.127-4.75 4.75s2.127 4.75 4.75 4.75c2.623 0 4.75-2.127 4.75-4.75v0c-0.003-2.622-2.128-4.747-4.75-4.75h-0zM16 19.25c-1.795 0-3.25-1.455-3.25-3.25s1.455-3.25 3.25-3.25c1.795 0 3.25 1.455 3.25 3.25v0c-0.002 1.794-1.456 3.248-3.25 3.25h-0z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                {settingsMenuOpen ? (
                  <div className="topbar-popover-menu">
                  <div className="topbar-popover-title">{appLocale.settingsTitle}</div>
                  <div className="topbar-popover-section">
                    <button
                      type="button"
                      className="topbar-popover-section-toggle"
                      onClick={() => toggleSettingsSection("game")}
                      aria-expanded={!settingsSectionsCollapsed.game}
                    >
                      <span className="topbar-popover-section-title">{appLocale.settingsGameSectionTitle}</span>
                      <svg
                        className={`topbar-popover-section-chevron${settingsSectionsCollapsed.game ? " collapsed" : ""}`}
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 3.5 10.5 8 6 12.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {!settingsSectionsCollapsed.game ? (
                      <div className="topbar-popover-section-body">
                        {!isSpectateRoute ? (
                          <>
                            <label className="topbar-menu-checkbox">
                              <input
                                type="checkbox"
                                checked={streamerMode}
                                onChange={(event) => setStreamerMode(event.target.checked)}
                              />
                              <span>{appLocale.streamerModeLabel}</span>
                            </label>
                            <label className="topbar-menu-checkbox">
                              <input
                                type="checkbox"
                                checked={showRoomCode}
                                onChange={(event) => setShowRoomCode(event.target.checked)}
                              />
                              <span>{appLocale.settingsShowRoomCodeInLobby}</span>
                            </label>
                          </>
                        ) : null}
                        <label className="topbar-menu-field">
                          <span>{appLocale.settingsToastPosition}</span>
                          <select
                            value={toastPosition}
                            onChange={(event) => setToastPosition(event.target.value as ToastPosition)}
                          >
                            <option value="top-right">{appLocale.toastPosTopRight}</option>
                            <option value="top-left">{appLocale.toastPosTopLeft}</option>
                            <option value="bottom-right">{appLocale.toastPosBottomRight}</option>
                            <option value="bottom-left">{appLocale.toastPosBottomLeft}</option>
                          </select>
                        </label>
                        <label className="topbar-menu-field">
                          <span>{appLocale.settingsToastDuration}</span>
                          <select
                            value={toastDuration}
                            onChange={(event) => setToastDuration(event.target.value as ToastDuration)}
                          >
                            <option value="3000">{appLocale.toastDuration3s}</option>
                            <option value="4000">{appLocale.toastDuration4s}</option>
                            <option value="6000">{appLocale.toastDuration6s}</option>
                          </select>
                        </label>
                        <label className="topbar-menu-field">
                          <span>{appLocale.settingsUiScale}</span>
                          <select value={uiScale} onChange={(event) => setUiScale(event.target.value as UiScale)}>
                            <option value="90">90%</option>
                            <option value="100">100%</option>
                            <option value="110">110%</option>
                          </select>
                        </label>
                        <label className="topbar-menu-checkbox">
                          <input
                            type="checkbox"
                            checked={reduceMotion}
                            onChange={(event) => setReduceMotion(event.target.checked)}
                          />
                          <span>{appLocale.settingsReduceMotion}</span>
                        </label>
                        <label className="topbar-menu-checkbox">
                          <input
                            type="checkbox"
                            checked={confirmDangerousActions}
                            onChange={(event) => setConfirmDangerousActions(event.target.checked)}
                          />
                          <span>{appLocale.settingsConfirmDangerous}</span>
                        </label>
                        {!isSpectateRoute ? (
                          <label className="topbar-menu-checkbox">
                            <input
                              type="checkbox"
                              checked={confirmExitGame}
                              onChange={(event) => setConfirmExitGame(event.target.checked)}
                            />
                            <span>{appLocale.settingsConfirmExit}</span>
                          </label>
                        ) : null}
                        <label className="topbar-menu-checkbox">
                          <input
                            type="checkbox"
                            checked={compactMode}
                            onChange={(event) => setCompactMode(event.target.checked)}
                          />
                          <span>{appLocale.settingsCompactMode}</span>
                        </label>
                        {!isSpectateRoute ? (
                          <label className="topbar-menu-checkbox">
                            <input
                              type="checkbox"
                              checked={autoCopyRoomCode}
                              onChange={(event) => setAutoCopyRoomCode(event.target.checked)}
                            />
                            <span>{appLocale.settingsAutoCopyRoomCode}</span>
                          </label>
                        ) : null}
                        <label className="topbar-menu-checkbox">
                          <input
                            type="checkbox"
                            checked={showSpectatorLinks}
                            onChange={(event) => setShowSpectatorLinks(event.target.checked)}
                          />
                          <span>{appLocale.settingsShowSpectatorLinks}</span>
                        </label>
                        <label className="topbar-menu-checkbox">
                          <input
                            type="checkbox"
                            checked={showHints}
                            onChange={(event) => setShowHints(event.target.checked)}
                          />
                          <span>{appLocale.settingsShowHints}</span>
                        </label>
                        <button type="button" className="ghost button-small" onClick={handleResetUiSettings}>
                          {appLocale.settingsResetUi}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="topbar-popover-section">
                    <button
                      type="button"
                      className="topbar-popover-section-toggle"
                      onClick={() => toggleSettingsSection("locale")}
                      aria-expanded={!settingsSectionsCollapsed.locale}
                    >
                      <span className="topbar-popover-section-title">{appLocale.settingsLocaleSectionTitle}</span>
                      <svg
                        className={`topbar-popover-section-chevron${settingsSectionsCollapsed.locale ? " collapsed" : ""}`}
                        viewBox="0 0 16 16"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 3.5 10.5 8 6 12.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    {!settingsSectionsCollapsed.locale ? (
                      <div className="topbar-popover-section-body">
                        <button
                          type="button"
                          className={`topbar-locale-option${locale === "ru" ? " selected" : ""}`}
                          onClick={() => setLocale("ru")}
                        >
                          <span className="topbar-locale-flag" aria-hidden="true">
                            🇷🇺
                          </span>
                          <span>{appLocale.localeRu}</span>
                        </button>
                        <button
                          type="button"
                          className={`topbar-locale-option${locale === "en" ? " selected" : ""}`}
                          onClick={() => setLocale("en")}
                        >
                          <span className="topbar-locale-flag" aria-hidden="true">
                            🇬🇧
                          </span>
                          <span>{appLocale.localeEnBeta}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  </div>
                ) : null}
              </div>
              <div className="topbar-popover" ref={themeMenuRef}>
                <button
                  className="ghost topbar-icon-toggle"
                  aria-label={appLocale.themeTitle}
                  title={appLocale.themeTitle}
                  onClick={() => {
                    setThemeMenuOpen((prev) => !prev);
                    setSettingsMenuOpen(false);
                  }}
                >
                  <span
                    className={`topbar-theme-swatch topbar-theme-swatch--current topbar-theme-swatch--${theme}`}
                    aria-hidden="true"
                  />
                </button>
                {themeMenuOpen ? (
                  <div className="topbar-popover-menu">
                    <div className="topbar-popover-title">{appLocale.themeTitle}</div>
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`topbar-theme-option${theme === option.id ? " selected" : ""}`}
                        onClick={() => {
                          setTheme(option.id);
                          setThemeMenuOpen(false);
                        }}
                      >
                        <span className="topbar-theme-option-content">
                          <span
                            className={`topbar-theme-swatch topbar-theme-swatch--${option.id}`}
                            aria-hidden="true"
                          />
                          <span>{option.label}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
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
          {visibleToasts.map((toast) => {
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

      <Modal
        open={Boolean(dangerConfirmMessage)}
        title={appLocale.confirmActionTitle}
        onClose={() => resolveDangerousActionConfirm(false)}
        dismissible={true}
      >
        <div className="muted">{dangerConfirmMessage}</div>
        <div className="modal-actions">
          <button className="ghost" onClick={() => resolveDangerousActionConfirm(false)}>
            {appLocale.modalCancel}
          </button>
          <button className="primary" onClick={() => resolveDangerousActionConfirm(true)}>
            {appLocale.modalApply}
          </button>
        </div>
      </Modal>

      <Modal
        open={Boolean(
          transferHostModalOpen && roomState && isControl && !isSpectateRoute && !isLobbyRoute
        )}
        title={appLocale.transferHostTitle}
        onClose={() => {
          setTransferHostModalOpen(false);
          setTransferHostAgree(false);
        }}
        dismissible={true}
      >
        {transferHostCandidates.length === 0 ? (
          <div className="muted">{appLocale.transferHostSelectPlaceholder}</div>
        ) : (
          <>
            <label className="topbar-menu-field">
              <span>{appLocale.transferHostSelectLabel}</span>
              <select
                value={transferHostTargetId}
                onChange={(event) => setTransferHostTargetId(event.target.value)}
              >
                {transferHostCandidates.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="topbar-menu-checkbox">
              <input
                type="checkbox"
                checked={transferHostAgree}
                onChange={(event) => setTransferHostAgree(event.target.checked)}
              />
              <span>{appLocale.transferHostAgreeLabel}</span>
            </label>
            <div className="modal-actions">
              <button
                className="ghost"
                onClick={() => {
                  setTransferHostModalOpen(false);
                  setTransferHostAgree(false);
                }}
              >
                {appLocale.modalCancel}
              </button>
              <button
                className="primary"
                disabled={!transferHostTargetId || !transferHostAgree}
                onClick={handleTransferHostFromModal}
              >
                {appLocale.transferHostButton}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={exitConfirmModalOpen}
        title={appLocale.exitConfirmTitle}
        onClose={() => setExitConfirmModalOpen(false)}
        dismissible={true}
      >
        <div className="muted">{appLocale.exitConfirmText}</div>
        <div className="modal-actions">
          <button className="ghost" onClick={() => setExitConfirmModalOpen(false)}>
            {appLocale.modalCancel}
          </button>
          <button
            className="primary"
            onClick={() => {
              setExitConfirmModalOpen(false);
              performExitGame();
            }}
          >
            {appLocale.exitButton}
          </button>
        </div>
      </Modal>

      <Modal
        open={devKickModalOpen && showDevKick}
        title={appLocale.devKickTitle}
        onClose={() => {
          setDevKickModalOpen(false);
          setDevKickTargetId("");
          setDevKickAgree(false);
        }}
        dismissible={true}
      >
        {devKickCandidates.length === 0 ? (
          <div className="muted">{appLocale.devKickNoTargets}</div>
        ) : (
          <>
            <select
              value={devKickTargetId}
              onChange={(event) => setDevKickTargetId(event.target.value)}
            >
              <option value="" disabled>
                {appLocale.devKickSelectPlaceholder}
              </option>
              {devKickCandidates.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.name}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="ghost"
                onClick={() => {
                  setDevKickModalOpen(false);
                  setDevKickTargetId("");
                  setDevKickAgree(false);
                }}
              >
                {appLocale.modalCancel}
              </button>
              <label className="topbar-menu-checkbox">
                <input
                  type="checkbox"
                  checked={devKickAgree}
                  onChange={(event) => setDevKickAgree(event.target.checked)}
                />
                <span>{appLocale.devKickAgreeLabel}</span>
              </label>
              <button
                className="primary"
                disabled={!devKickTargetId || !devKickAgree}
                onClick={handleDevKickPlayer}
              >
                {appLocale.devKickConfirm}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
    </ErrorBoundary>
  );
}

