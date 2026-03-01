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
import { initTabIdentity, tokenKey } from "./storage";
import { ru } from "./i18n/ru";
import { APP_NAME } from "./config/branding";
import Modal from "./components/Modal";
import EyeIcon from "./components/EyeIcon";
import AnimatedRouteContainer from "./components/AnimatedRouteContainer";
import ErrorBoundary from "./components/ErrorBoundary";
import ErrorScreen from "./components/ErrorScreen";
import HomePage from "./pages/HomePage";
import LobbyPage from "./pages/LobbyPage";
import GamePage from "./pages/GamePage";
import SpectatorTablePage from "./pages/SpectatorTablePage";

const THEME_STORAGE_KEY = "bunker.theme";
const STREAMER_MODE_KEY = "bunker.streamerMode";
const SHOW_ROOM_CODE_KEY = "bunker.showRoomCode";
const TOAST_DURATION_MS = 4000;
const MAX_EVENTS = 20;
const SNAPSHOT_TIMEOUT_MS = 8000;
const SESSION_ID_KEY = "bunker.sessionId";

type ThemeMode = "light" | "dark";
type UiToast = { id: string; message: string; variant: "danger" | "success" | "info" };
type RulesUpdatePayload = {
  mode: "auto" | "manual";
  presetPlayerCount?: number;
  manualConfig?: ManualRulesConfig;
};

type SessionIntent =
  | { mode: "create"; name: string; scenarioId: string; tabId?: string }
  | { mode: "join"; name: string; roomCode: string; playerToken?: string; tabId?: string }
  | { mode: "reconnect"; name: string; roomCode: string; playerToken?: string; tabId?: string };

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  const mojibakeChunks = normalized.match(/[РС][\u0400-\u04ff]/g);
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
  const client = useMemo(() => new BunkerClient(WS_URL), []);
  const navigate = useNavigate();
  const location = useLocation();
  const [tabId, setTabId] = useState<string | undefined>(undefined);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [gameView, setGameView] = useState<GameView | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [lastWsError, setLastWsError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [streamerMode, setStreamerMode] = useState<boolean>(() => getInitialStreamerMode());
  const [showRoomCode, setShowRoomCode] = useState<boolean>(() => getInitialShowRoomCode());
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [eventLog, setEventLog] = useState<GameEvent[]>([]);
  const [toasts, setToasts] = useState<GameEvent[]>([]);
  const [uiToasts, setUiToasts] = useState<UiToast[]>([]);
  const [devKickModalOpen, setDevKickModalOpen] = useState(false);
  const [devKickTargetId, setDevKickTargetId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 1250px)").matches : false
  );
  const [isMobileNarrow, setIsMobileNarrow] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 600px)").matches : false
  );
  const [mobileDossierError, setMobileDossierError] = useState<string | null>(null);

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
  const roleLabel = isControl ? ru.roleControl : isHost ? ru.roleHost : ru.rolePlayer;
  const statusLabel =
    connectionStatus === "connected"
      ? ru.statusOnline
      : connectionStatus === "reconnecting"
        ? ru.statusReconnecting
        : ru.statusOffline;
  const statusClass =
    connectionStatus === "connected"
      ? "online"
      : connectionStatus === "reconnecting"
        ? "reconnecting"
        : "offline";
  const statusHint =
    connectionStatus === "reconnecting"
      ? ru.statusReconnectHint
      : connectionStatus === "disconnected"
        ? ru.statusOfflineHint
        : null;
  const devKickCandidates =
    gameView?.public.players.filter(
      (player) => player.status === "alive" && player.playerId !== playerId
    ) ?? [];
  const devSkipRoundButtonLabel = safeLabel(ru.devSkipRoundButton, "DEV");

  const clearSnapshotTimer = () => {
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    awaitingRoomStateRef.current = false;
    awaitingGameViewRef.current = false;
  };

  const startSnapshotWait = (expectGameView: boolean) => {
    clearSnapshotTimer();
    awaitingRoomStateRef.current = true;
    awaitingGameViewRef.current = expectGameView;
    snapshotTimerRef.current = setTimeout(() => {
      setErrorMessage(ru.errorReconnectNetwork);
      reconnectPendingRef.current = false;
    }, SNAPSHOT_TIMEOUT_MS);
  };

  const hardResetSession = (options?: { clearLastRoom?: boolean; preserveError?: boolean }) => {
    clearSnapshotTimer();
    reconnectPendingRef.current = false;
    if (options?.clearLastRoom) {
      const lastRoom = localStorage.getItem("bunker.lastRoomCode");
      if (lastRoom) {
        localStorage.removeItem(tokenKey(lastRoom));
      }
      localStorage.removeItem("bunker.lastRoomCode");
    }
    setRoomState(null);
    setGameView(null);
    setPlayerId(null);
    setPlayerToken(null);
    if (!options?.preserveError) {
      setErrorMessage(null);
    }
    intentRef.current = null;
    client.disconnect();
  };

  const isReconnectError = (message: string) =>
    message.includes("Не удалось восстановить игрока") ||
    message.includes("Игрок не найден") ||
    message.includes("Вы не в комнате") ||
    message.includes("Комната не найдена") ||
    message.includes("Игра не найдена");

  const buildHelloPayload = (intent: SessionIntent) => {
    const effectiveSessionId = sessionIdRef.current ?? sessionId ?? undefined;
    if (intent.mode === "create") {
      return {
        name: intent.name,
        create: true,
        scenarioId: intent.scenarioId,
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
    document.title = APP_NAME;
  }, []);

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
    if (!roomCodeCopied) return;
    const timer = window.setTimeout(() => setRoomCodeCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [roomCodeCopied]);

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
    const match = event.message.match(/Игрок\s+(.+?)\s+(вышел|отсутствует|покинул)/i);
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
    }, TOAST_DURATION_MS);

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
    }, TOAST_DURATION_MS);
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
    pushUiToast(ru.wsActionRetryHint, "info");
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
          setErrorMessage(null);
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
          setErrorMessage(null);
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
            setErrorMessage(null);
            pushUiToast(ru.hostChangedYou, "success");
            return;
          }
          const candidate =
            roomStateRef.current?.players.find((player) => player.playerId === newHostId) ??
            gameViewRef.current?.public.players.find((player) => player.playerId === newHostId);
          pushUiToast(ru.hostChangedOther(candidate?.name ?? "игрок"), "info");
          return;
        }
        case "error": {
          const msg = message.payload.message;
          const code = message.payload.code;
          const maxPlayers = message.payload.maxPlayers;
          const isPermissionError =
            msg.includes("Действие доступно только роли CONTROL.") ||
            msg.includes("Недостаточно прав для действия игрока.") ||
            msg.includes("Только CONTROL может") ||
            msg.includes("Только хост может") ||
            msg.includes("Только ведущий может");
          if (isMobileNarrow && dossierActionRef.current) {
            setMobileDossierError(msg);
            dossierActionRef.current = false;
            return;
          }
          if (isPermissionError && connectionStatus === "connected") {
            setErrorMessage(null);
            pushUiToast(msg, "danger");
            return;
          }
          if (code === "ROOM_FULL" || msg.includes("Комната заполнена")) {
            const roomFullMessage =
              typeof maxPlayers === "number" && Number.isFinite(maxPlayers)
                ? ru.roomFull(maxPlayers)
                : ru.roomFullUnknown;
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
          if (msg.includes("покинул бункер")) {
            hardResetSession({ clearLastRoom: true, preserveError: true });
            navigate("/");
            return;
          }
          if (isReconnectError(msg)) {
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
    if (!roomState) return;
    if (isSpectateRoute) return;
    if (roomState.phase === "lobby") {
      navigate(`/lobby?room=${roomState.roomCode}`);
    } else {
      navigate(`/game?room=${roomState.roomCode}`);
    }
  }, [isSpectateRoute, navigate, roomState]);

  useEffect(() => {
    if (!roomState) return;
    localStorage.setItem("bunker.lastRoomCode", roomState.roomCode);
    if (!playerToken || DEV_TAB_IDENTITY) return;
    localStorage.setItem(tokenKey(roomState.roomCode), playerToken);
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

    const token = IDENTITY_MODE === "prod" ? localStorage.getItem(tokenKey(roomCode)) ?? undefined : undefined;
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
      setErrorMessage(ru.errorReconnectNetwork);
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
    setErrorMessage(null);
    localStorage.setItem("bunker.playerName", name);
    let effectiveTabId = tabId;
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      effectiveTabId = await initTabIdentity();
      if (effectiveTabId) {
        setTabId(effectiveTabId);
      }
    }
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      setErrorMessage(ru.errorReconnectNetwork);
      return;
    }
    const intent: SessionIntent = {
      mode: "create",
      name,
      scenarioId,
      tabId: DEV_TAB_IDENTITY ? effectiveTabId : undefined,
    };
    intentRef.current = intent;
    try {
      await sendHelloWithIntent(intent);
    } catch {
      setErrorMessage(ru.errorReconnectNetwork);
    }
  };

  const handleJoin = async (name: string, roomCode: string) => {
    setErrorMessage(null);
    localStorage.setItem("bunker.playerName", name);
    let effectiveTabId = tabId;
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      effectiveTabId = await initTabIdentity();
      if (effectiveTabId) {
        setTabId(effectiveTabId);
      }
    }
    const token = DEV_TAB_IDENTITY ? undefined : localStorage.getItem(tokenKey(roomCode)) ?? undefined;
    if (DEV_TAB_IDENTITY && !effectiveTabId) {
      setErrorMessage(ru.errorReconnectNetwork);
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
      setErrorMessage(ru.errorReconnectNetwork);
    }
  };

  const handleStart = () => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "startGame", payload: {} });
  };

  const handleRevealCard = (cardId: string) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "revealCard", payload: { cardId } });
  };

  const handleVote = (targetPlayerId: string) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "vote", payload: { targetPlayerId } });
  };

  const handleApplySpecial = (specialInstanceId: string, payload?: Record<string, unknown>) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
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
    setErrorMessage(null);
    client.send({ type: "finalizeVoting", payload: {} });
  };

  const handleContinueRound = () => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "continueRound", payload: {} });
  };

  const handleRevealWorldThreat = (index: number) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "revealWorldThreat", payload: { index } });
  };

  const handleSetBunkerOutcome = (outcome: "survived" | "failed") => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    if (IDENTITY_MODE !== "prod") {
      console.log("[dev] setBunkerOutcome", outcome);
    }
    client.send({ type: "setBunkerOutcome", payload: { outcome } });
  };

  const handleDevSkipRound = () => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "devSkipRound", payload: {} });
  };

  const handleDevKickPlayer = () => {
    if (!ensureWsInteractive()) return;
    if (!devKickTargetId) return;
    setErrorMessage(null);
    client.send({ type: "devKickPlayer", payload: { targetPlayerId: devKickTargetId } });
    setDevKickModalOpen(false);
    setDevKickTargetId("");
  };

  const handleUpdateSettings = (settings: GameSettings) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "updateSettings", payload: settings });
  };

  const handleUpdateRules = (payload: RulesUpdatePayload) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "updateRules", payload });
  };

  const handleKickFromLobby = (targetPlayerId: string) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "kickFromLobby", payload: { targetPlayerId } });
  };

  const handleRequestHostTransfer = (targetPlayerId?: string) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    const normalizedTargetId = String(targetPlayerId ?? "").trim();
    client.send({
      type: "requestHostTransfer",
      payload: normalizedTargetId ? { targetPlayerId: normalizedTargetId } : {},
    });
  };

  const handleDevAddPlayer = (name?: string) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "devAddPlayer", payload: { name } });
  };

  const handleDevRemovePlayer = (targetPlayerId?: string) => {
    if (!ensureWsInteractive()) return;
    setErrorMessage(null);
    client.send({ type: "devRemovePlayer", payload: { targetPlayerId } });
  };

  const handleExitGame = () => {
    setErrorMessage(null);
    hardResetSession();
    navigate("/");
  };

  const handleCopyRoomCode = async () => {
    if (!roomState) return;
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
      window.alert(ru.copyFailed);
      return;
    }
    setRoomCodeCopied(true);
  };

  const handleRetry = async () => {
    const intent = intentRef.current;
    if (!intent) return;
    setErrorMessage(null);
    hardResetSession();
    intentRef.current = intent;
    try {
      await sendHelloWithIntent(intent);
    } catch {
      setErrorMessage(ru.errorReconnectNetwork);
    }
  };

  const visibleUiToasts = isMobile ? uiToasts.slice(-1) : uiToasts;
  const visibleToasts = isMobile ? toasts.slice(-2) : toasts;
  const mobileToasts = isMobile
    ? [
        ...visibleUiToasts.map((toast) => ({
          id: `ui-${toast.id}`,
          title: ru.notificationTitle,
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
            title: ru.toastKind(toast.kind),
            message: toast.message,
            variant,
            onClose: () => removeToast(toast.id),
          };
        }),
      ]
    : [];
  const roomCodeHidden = Boolean(roomState && isLobbyRoute && streamerMode && !showRoomCode);
  const roomCodeLabel = roomState
    ? ru.roomPill(roomCodeHidden ? ru.hiddenValue : roomState.roomCode)
    : "";
  const showErrorScreen = Boolean(errorMessage && (isLobbyRoute || isGameRoute));
  const exitToMenu = () => {
    setErrorMessage(null);
    hardResetSession();
    navigate("/");
  };

  return (
    <ErrorBoundary onReset={() => hardResetSession({ clearLastRoom: true })}>
      <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            {APP_NAME}
          </div>
          {showDevIdentityBadge ? <span className="pill">{ru.devBadge}</span> : null}
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
                <button className="ghost button-small" onClick={() => setDevKickModalOpen(true)}>
                  {ru.devKickButton}
                </button>
              ) : null}
            </div>
          ) : showRolePill && !showRolePillCompact ? (
            <span className="pill role-pill">{roleLabel}</span>
          ) : isSpectateRoute ? (
            <span className="pill role-pill">{ru.spectatorLinkTitle}</span>
          ) : null}
        </div>
        <div className="topbar-rightArea">
          <div className="topbar-actions">
            {roomState && !isSpectateRoute ? (
              <div className={`topbar-room${isLobbyRoute ? " topbar-room-lobby" : ""}`}>
                <span
                  className={`topbar-room-code${roomCodeHidden ? " maskedText" : ""}`}
                  title={roomCodeHidden ? ru.showSecret : roomState.roomCode}
                >
                  {roomCodeLabel}
                </span>
                <span>{ru.scenarioPill(roomState.scenarioMeta.name)}</span>
                {isLobbyRoute ? (
                  <div className="topbar-room-controls">
                    <button
                      type="button"
                      className="ghost iconButton"
                      aria-label={roomCodeHidden ? ru.showSecret : ru.hideSecret}
                      title={roomCodeHidden ? ru.showSecret : ru.hideSecret}
                      onClick={() => setShowRoomCode((prev) => !prev)}
                    >
                      <EyeIcon open={!roomCodeHidden} />
                    </button>
                    <button type="button" className="ghost button-small" onClick={handleCopyRoomCode}>
                      {roomCodeCopied ? ru.copiedButton : ru.copyButton}
                    </button>
                    <label className="topbar-streamer-toggle">
                      <input
                        type="checkbox"
                        checked={streamerMode}
                        onChange={(event) => setStreamerMode(event.target.checked)}
                      />
                      <span>{ru.streamerModeLabel}</span>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="topbar-rightStack">
            {roomState && isControl && !isSpectateRoute && !isLobbyRoute ? (
              <button className="ghost button-small" onClick={handleRequestHostTransfer}>
                {ru.transferHostButton}
              </button>
            ) : null}
            {roomState ? (
              <button className="primary topbar-exit-button" onClick={handleExitGame}>
                {ru.exitButton}
              </button>
            ) : null}
            <button
              className="ghost topbar-theme-button"
              onClick={() => setTheme((prev) => (prev === "light" ? "dark" : "light"))}
            >
              {theme === "light" ? ru.themeToggleDark : ru.themeToggleLight}
            </button>
          </div>
        </div>
      </header>

      {errorMessage ? (
        <div className="error-banner">
          <span>{errorMessage}</span>
          {intentRef.current ? (
            <button className="ghost button-small" onClick={handleRetry}>
              {ru.retryButton}
            </button>
          ) : null}
        </div>
      ) : null}

      {!isMobile ? (
        <div className="toast-stack">
          {visibleUiToasts.map((toast) => (
            <div key={toast.id} className={`toast ${toast.variant}`.trim()}>
              <div className="toast-kind">{ru.notificationTitle}</div>
              <div>{toast.message}</div>
              <button className="toast-close" onClick={() => removeUiToast(toast.id)} aria-label={ru.closeButton}>
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
                <div className="toast-kind">{ru.toastKind(toast.kind)}</div>
                <div>{toast.message}</div>
                <button className="toast-close" onClick={() => removeToast(toast.id)} aria-label={ru.closeButton}>
                  {"\u00D7"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="toast-stack-mobile">
          {mobileToasts.map((toast) => (
            <div key={toast.id} className={`toast-mobile ${toast.variant}`.trim()}>
              <div className="toast-mobile-header">
                <div className="toast-mobile-title">{toast.title}</div>
                <button className="toast-mobile-close" onClick={toast.onClose} aria-label={ru.closeButton}>
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
            message={errorMessage ?? ru.errorReconnectNetwork}
            canRetry={Boolean(intentRef.current)}
            reconnecting={connectionStatus === "reconnecting"}
            onRetry={() => void handleRetry()}
            onExitToMenu={exitToMenu}
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
                <LobbyPage
                  roomState={roomState}
                  playerId={playerId}
                  playerToken={playerToken}
                  isControl={Boolean(isControl)}
                  streamerMode={streamerMode}
                  wsInteractive={wsInteractive}
                  onStart={handleStart}
                  onUpdateSettings={handleUpdateSettings}
                  onUpdateRules={handleUpdateRules}
                  onKickPlayer={handleKickFromLobby}
                  onTransferHost={handleRequestHostTransfer}
                />
              }
            />
            <Route
              path="/game"
              element={
                <GamePage
                  roomState={roomState}
                  gameView={gameView}
                    isControl={Boolean(isControl)}
                    presenterModeEnabled={presenterModeEnabled}
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
              }
            />
            <Route path="/spectate" element={<SpectatorTablePage />} />
          </Routes>
        </AnimatedRouteContainer>
      </main>

      <Modal
        open={devKickModalOpen && showDevKick}
        title={ru.devKickTitle}
        onClose={() => {
          setDevKickModalOpen(false);
          setDevKickTargetId("");
        }}
        dismissible={true}
      >
        {devKickCandidates.length === 0 ? (
          <div className="muted">{ru.devKickNoTargets}</div>
        ) : (
          <>
            <select
              value={devKickTargetId}
              onChange={(event) => setDevKickTargetId(event.target.value)}
            >
              <option value="" disabled>
                {ru.devKickSelectPlaceholder}
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
                }}
              >
                {ru.modalCancel}
              </button>
              <button className="primary" disabled={!devKickTargetId} onClick={handleDevKickPlayer}>
                {ru.devKickConfirm}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
    </ErrorBoundary>
  );
}



