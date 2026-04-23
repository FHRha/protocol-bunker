import type { MutableRefObject } from "react";
import type { RoomState } from "@bunker/shared";
import { DEV_TAB_IDENTITY, IDENTITY_MODE } from "../config";
import { initTabIdentity, readPlayerToken } from "../storage";
import type { BunkerClient } from "../wsClient";
import type { LocaleCode } from "../localization";
import { buildHelloPayload, buildResumePayload } from "./protocol";
import type { SessionIntent } from "./types";

type SendHelloDeps = {
  client: BunkerClient;
  locale: LocaleCode;
  sessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  ensureSessionId: () => void;
  startSnapshotWait: (expectGameView: boolean) => void;
  lastHelloAtRef: MutableRefObject<number | null>;
};

export async function sendHelloWithIntent(intent: SessionIntent, deps: SendHelloDeps): Promise<void> {
  deps.ensureSessionId();
  const payload = buildHelloPayload({
    intent,
    locale: deps.locale,
    sessionId: deps.sessionIdRef.current ?? deps.sessionId ?? undefined,
  });
  deps.startSnapshotWait(true);
  deps.lastHelloAtRef.current = Date.now();
  if (IDENTITY_MODE !== "prod") {
    console.log("[dev] hello sent", intent);
  }
  await deps.client.connect();
  deps.client.send({ type: "hello", payload });
}

type SendResumeDeps = {
  client: BunkerClient;
  locale: LocaleCode;
  tabId: string | undefined;
  sessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  roomStateRef: MutableRefObject<RoomState | null>;
  locationPathname: string;
  locationSearch: string;
  ensureSessionId: () => void;
  startSnapshotWait: (expectGameView: boolean) => void;
  lastHelloAtRef: MutableRefObject<number | null>;
};

export async function sendResume(deps: SendResumeDeps): Promise<void> {
  deps.ensureSessionId();
  const roomCode =
    deps.roomStateRef.current?.roomCode ??
    new URLSearchParams(deps.locationSearch).get("room") ??
    localStorage.getItem("bunker.lastRoomCode");
  if (!roomCode) return;
  const expectGameView =
    deps.roomStateRef.current?.phase === "game" || deps.locationPathname.startsWith("/game");
  if (IDENTITY_MODE === "dev_tab") {
    const name = localStorage.getItem("bunker.playerName") ?? "Player";
    if (!deps.tabId || !name.trim()) return;
    deps.startSnapshotWait(expectGameView);
    deps.lastHelloAtRef.current = Date.now();
    console.log("[dev] resume as hello sent", roomCode);
    await deps.client.connect(true);
    deps.client.send({
      type: "hello",
      payload: {
        name,
        roomCode: roomCode.toUpperCase(),
        tabId: deps.tabId,
        sessionId: deps.sessionIdRef.current ?? deps.sessionId ?? undefined,
        locale: deps.locale,
      },
    });
    return;
  }
  const payload = buildResumePayload({
    roomCode,
    sessionId: deps.sessionIdRef.current ?? deps.sessionId,
  });
  if (!payload) return;
  deps.startSnapshotWait(expectGameView);
  deps.lastHelloAtRef.current = Date.now();
  if (IDENTITY_MODE !== "prod") {
    console.log("[dev] resume sent", payload.roomCode);
  }
  await deps.client.connect(true);
  deps.client.send({ type: "resume", payload });
}

async function resolveEffectiveTabId(currentTabId: string | undefined): Promise<string | undefined> {
  if (!DEV_TAB_IDENTITY || currentTabId) return currentTabId;
  return initTabIdentity();
}

type BeginSessionDeps = {
  locale: LocaleCode;
  tabId: string | undefined;
  setTabId: (tabId: string | undefined) => void;
  setFatalErrorMessage: (message: string) => void;
  errorReconnectNetwork: string;
  clearAppErrors: () => void;
  sendHello: (intent: SessionIntent) => Promise<void>;
  intentRef: MutableRefObject<SessionIntent | null>;
};

export async function beginCreateSession(
  name: string,
  scenarioId: string,
  deps: BeginSessionDeps
): Promise<void> {
  deps.clearAppErrors();
  localStorage.setItem("bunker.playerName", name);
  const effectiveTabId = await resolveEffectiveTabId(deps.tabId);
  if (effectiveTabId && effectiveTabId !== deps.tabId) {
    deps.setTabId(effectiveTabId);
  }
  if (DEV_TAB_IDENTITY && !effectiveTabId) {
    deps.setFatalErrorMessage(deps.errorReconnectNetwork);
    return;
  }
  const intent: SessionIntent = {
    mode: "create",
    name,
    scenarioId,
    locale: deps.locale,
    tabId: DEV_TAB_IDENTITY ? effectiveTabId : undefined,
  };
  deps.intentRef.current = intent;
  try {
    await deps.sendHello(intent);
  } catch {
    deps.setFatalErrorMessage(deps.errorReconnectNetwork);
  }
}

export async function beginJoinSession(
  name: string,
  roomCode: string,
  deps: BeginSessionDeps
): Promise<void> {
  deps.clearAppErrors();
  localStorage.setItem("bunker.playerName", name);
  const effectiveTabId = await resolveEffectiveTabId(deps.tabId);
  if (effectiveTabId && effectiveTabId !== deps.tabId) {
    deps.setTabId(effectiveTabId);
  }
  const token = DEV_TAB_IDENTITY ? undefined : readPlayerToken(roomCode);
  if (DEV_TAB_IDENTITY && !effectiveTabId) {
    deps.setFatalErrorMessage(deps.errorReconnectNetwork);
    return;
  }
  const intent: SessionIntent = {
    mode: "join",
    name,
    roomCode,
    playerToken: token,
    tabId: DEV_TAB_IDENTITY ? effectiveTabId : undefined,
  };
  deps.intentRef.current = intent;
  try {
    await deps.sendHello(intent);
  } catch {
    deps.setFatalErrorMessage(deps.errorReconnectNetwork);
  }
}

type StoredReconnectInput = {
  locationPathname: string;
  locationSearch: string;
  playerId: string | null;
  roomState: RoomState | null;
  tabId: string | undefined;
};

export function buildStoredReconnectIntent(input: StoredReconnectInput): SessionIntent | null {
  if (input.roomState || input.playerId) return null;
  const roomFromUrl = new URLSearchParams(input.locationSearch).get("room");
  const hasRoomInUrl = Boolean(roomFromUrl);
  const shouldAttempt =
    hasRoomInUrl ||
    input.locationPathname.startsWith("/game") ||
    input.locationPathname.startsWith("/lobby");
  if (!shouldAttempt) return null;

  const roomCode = (roomFromUrl ?? localStorage.getItem("bunker.lastRoomCode") ?? "")
    .trim()
    .toUpperCase();
  const name = localStorage.getItem("bunker.playerName") ?? "";
  if (!roomCode || !name) return null;

  const token = IDENTITY_MODE === "prod" ? readPlayerToken(roomCode) : undefined;
  const effectiveTabId = IDENTITY_MODE === "dev_tab" ? input.tabId : undefined;
  if (IDENTITY_MODE === "dev_tab" && !effectiveTabId) return null;
  return {
    mode: "reconnect",
    name,
    roomCode,
    playerToken: token,
    tabId: effectiveTabId,
  };
}
