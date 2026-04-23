import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { GameEvent, GameView, RoomState, ServerMessage } from "@bunker/shared";
import { DEV_TAB_IDENTITY, IDENTITY_MODE } from "../config";
import type { ConnectionStatus } from "../wsClient";
import type { SessionIntent } from "./types";

type UiToastVariant = "danger" | "success" | "info";

type AppMessageLocale = {
  genericPlayer: string;
  hostChangedYou: string;
  hostChangedOther: (name: string) => string;
  roomFullUnknown: string;
  roomFull: (maxPlayers: number) => string;
};

export type ServerMessageHandlerDeps = {
  appLocale: AppMessageLocale;
  connectionStatus: ConnectionStatus;
  isMobileNarrow: boolean;
  playerId: string | null;
  tabId: string | undefined;
  awaitingRoomStateRef: MutableRefObject<boolean>;
  awaitingGameViewRef: MutableRefObject<boolean>;
  dossierActionRef: MutableRefObject<boolean>;
  gameViewRef: MutableRefObject<GameView | null>;
  roomStateRef: MutableRefObject<RoomState | null>;
  gameViewRevisionRef: MutableRefObject<number>;
  roomStateRevisionRef: MutableRefObject<number>;
  setPlayerId: Dispatch<SetStateAction<string | null>>;
  setPlayerToken: Dispatch<SetStateAction<string | null>>;
  setRoomState: Dispatch<SetStateAction<RoomState | null>>;
  setGameView: Dispatch<SetStateAction<GameView | null>>;
  setMobileDossierError: Dispatch<SetStateAction<string | null>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setFatalErrorMessage: Dispatch<SetStateAction<string | null>>;
  clearAppErrors: () => void;
  clearSnapshotTimer: () => void;
  applyRoomStatePatch: (patch: Partial<RoomState>) => void;
  applyGameViewPatch: (patch: Partial<GameView>) => void;
  pushEvent: (event: GameEvent) => void;
  pushUiToast: (message: string, variant?: UiToastVariant) => void;
  messageIncludesAny: (message: string, tokens: string[]) => boolean;
  isReconnectError: (message: string, code?: string) => boolean;
  hardResetSession: (options?: { clearLastRoom?: boolean; preserveError?: boolean }) => void;
  navigateHome: () => void;
};

export function handleServerMessage(message: ServerMessage, deps: ServerMessageHandlerDeps): void {
  switch (message.type) {
    case "helloAck":
      deps.setPlayerId(message.payload.playerId);
      deps.setPlayerToken(message.payload.playerToken);
      if (IDENTITY_MODE !== "prod") {
        console.log("[dev] helloAck", { playerId: message.payload.playerId });
      }
      if (DEV_TAB_IDENTITY) {
        console.log("[dev] tabId/playerId", { tabId: deps.tabId, playerId: message.payload.playerId });
      }
      return;
    case "roomState":
      deps.roomStateRevisionRef.current = message.payload.revision ?? deps.roomStateRevisionRef.current;
      deps.setRoomState(message.payload);
      deps.clearAppErrors();
      if (IDENTITY_MODE !== "prod") {
        console.log("[dev] roomState", message.payload.roomCode, message.payload.phase);
      }
      deps.awaitingRoomStateRef.current = false;
      if (message.payload.phase === "lobby") {
        deps.setGameView(null);
        deps.clearSnapshotTimer();
      } else if (deps.gameViewRef.current) {
        deps.clearSnapshotTimer();
      }
      return;
    case "gameView":
      deps.gameViewRevisionRef.current = message.payload.revision ?? deps.gameViewRevisionRef.current;
      deps.setGameView(message.payload);
      deps.clearAppErrors();
      deps.setMobileDossierError(null);
      deps.dossierActionRef.current = false;
      if (IDENTITY_MODE !== "prod") {
        console.log("[dev] gameView", message.payload.phase, message.payload.round);
        if (message.payload.postGame?.outcome) {
          console.log("[dev] postGame outcome", message.payload.postGame.outcome);
        }
      }
      deps.awaitingGameViewRef.current = false;
      if (deps.roomStateRef.current?.phase === "game") {
        deps.clearSnapshotTimer();
      }
      return;
    case "statePatch":
      if (message.payload.roomState) {
        deps.applyRoomStatePatch({
          ...message.payload.roomState,
          revision: message.payload.roomState.revision ?? message.payload.roomStateRevision,
        });
      }
      if (message.payload.gameView) {
        deps.applyGameViewPatch({
          ...message.payload.gameView,
          revision: message.payload.gameView.revision ?? message.payload.gameViewRevision,
        });
      }
      return;
    case "gameEvent":
      deps.pushEvent(message.payload);
      return;
    case "hostChanged": {
      const newHostId = message.payload.newHostId;
      deps.setRoomState((prev) => (prev ? { ...prev, hostId: newHostId } : prev));
      if (newHostId === deps.playerId) {
        deps.clearAppErrors();
        deps.pushUiToast(deps.appLocale.hostChangedYou, "success");
        return;
      }
      const candidate =
        deps.roomStateRef.current?.players.find((player) => player.playerId === newHostId) ??
        deps.gameViewRef.current?.public.players.find((player) => player.playerId === newHostId);
      deps.pushUiToast(
        deps.appLocale.hostChangedOther(candidate?.name ?? deps.appLocale.genericPlayer),
        "info"
      );
      return;
    }
    case "error": {
      const msg = message.payload.message;
      const code = message.payload.code;
      const maxPlayers = message.payload.maxPlayers;
      const isPermissionError =
        code === "PERMISSION_DENIED" ||
        deps.messageIncludesAny(msg, [
          "action is available only for control role",
          "insufficient permissions for player action",
          "only control can",
          "only host can",
          "only presenter can",
        ]);
      if (deps.isMobileNarrow && deps.dossierActionRef.current) {
        deps.setMobileDossierError(msg);
        deps.dossierActionRef.current = false;
        return;
      }
      if (isPermissionError && deps.connectionStatus === "connected") {
        deps.clearAppErrors();
        deps.pushUiToast(msg, "danger");
        return;
      }
      if (code === "ROOM_FULL" || deps.messageIncludesAny(msg, [deps.appLocale.roomFullUnknown, "room is full"])) {
        const roomFullMessage =
          typeof maxPlayers === "number" && Number.isFinite(maxPlayers)
            ? deps.appLocale.roomFull(maxPlayers)
            : deps.appLocale.roomFullUnknown;
        deps.pushUiToast(roomFullMessage, "danger");
        deps.hardResetSession({ clearLastRoom: true });
        deps.navigateHome();
        return;
      }
      deps.setErrorMessage(msg);
      if (code === "RECONNECT_FORBIDDEN") {
        deps.hardResetSession({ clearLastRoom: true, preserveError: true });
        deps.navigateHome();
        return;
      }
      if (code === "LEFT_BUNKER" || deps.messageIncludesAny(msg, ["left bunker"])) {
        deps.hardResetSession({ clearLastRoom: true, preserveError: true });
        deps.navigateHome();
        return;
      }
      if (deps.isReconnectError(msg, code)) {
        deps.setFatalErrorMessage(msg);
        deps.hardResetSession({ preserveError: true });
        deps.navigateHome();
      }
      return;
    }
    default:
      return;
  }
}

export type ConnectionStatusHandlerDeps = {
  intentRef: MutableRefObject<SessionIntent | null>;
  reconnectPendingRef: MutableRefObject<boolean>;
  roomStateRef: MutableRefObject<RoomState | null>;
  setConnectionStatus: Dispatch<SetStateAction<ConnectionStatus>>;
  setLastWsError: Dispatch<SetStateAction<string | null>>;
  sendHelloWithIntent: (intent: SessionIntent) => Promise<void>;
  sendResume: () => Promise<void>;
};

export function handleConnectionStatus(
  status: ConnectionStatus,
  error: string | null | undefined,
  deps: ConnectionStatusHandlerDeps
): void {
  if (IDENTITY_MODE !== "prod") {
    console.log("[dev] ws status", status, error ?? "");
  }
  deps.setConnectionStatus(status);
  deps.setLastWsError(error ?? null);
  if (status === "reconnecting") {
    if (deps.roomStateRef.current || deps.intentRef.current) {
      deps.reconnectPendingRef.current = true;
    }
  }
  if (status === "connected" && deps.reconnectPendingRef.current) {
    deps.reconnectPendingRef.current = false;
    if (deps.roomStateRef.current) {
      void deps.sendResume();
    } else if (deps.intentRef.current) {
      void deps.sendHelloWithIntent(deps.intentRef.current);
    }
  }
}
