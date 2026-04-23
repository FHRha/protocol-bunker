import type { WebSocket } from "ws";
import type {
  ClientHelloPayload,
  ClientMessage,
  GameView,
  RoomState,
  ScenarioModule,
} from "@bunker/shared";
import type { IdentityMode, Player, Room } from "../../core/types.js";

type HelloMessage = Extract<ClientMessage, { type: "hello" }>;
type ResumeMessage = Extract<ClientMessage, { type: "resume" }>;
type OverlaySubscribeMessage = Extract<ClientMessage, { type: "overlaySubscribe" }>;

export interface SessionHandlerDeps {
  identityMode: IdentityMode;
  devLogs: boolean;
  devScenariosEnabled: boolean;
  reconnectGraceAfterKickMs: number;
  disconnectGraceMs: number;
  minClassicPlayers: number;
  defaultSettings: import("@bunker/shared").GameSettings;
  assets: import("@bunker/shared").AssetCatalog;
  scenarioMap: Map<string, ScenarioModule>;
  rooms: Map<string, Room>;
  connectionInfo: WeakMap<WebSocket, { roomCode: string; playerId: string }>;
  overlaySubscriptions: Map<WebSocket, { roomCode: string; role: string }>;
  sendLocalizedError: (
    ws: WebSocket,
    options: {
      key: string;
      room?: Room;
      code?: string;
      vars?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    }
  ) => void;
  sendReconnectForbidden: (ws: WebSocket, room?: Room) => void;
  send: (ws: WebSocket, message: import("@bunker/shared").ServerMessage) => void;
  devLog: (...args: unknown[]) => void;
  logProtocol: (event: string, details: Record<string, unknown>) => void;
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  createLobbyRoom: (options: {
    scenarioModule: ScenarioModule;
    assets: import("@bunker/shared").AssetCatalog;
    defaultSettings: import("@bunker/shared").GameSettings;
    locale: unknown;
    identityMode: IdentityMode;
    buildAutoRuleset: (playerCount: number) => import("@bunker/shared").GameRuleset;
    minClassicPlayers: number;
    generateRoomCode: () => string;
    buildDisasterOptions: (
      assets: import("@bunker/shared").AssetCatalog
    ) => Array<{ id: string; title: string }>;
    normalizeCardLocale: (value: unknown) => import("@bunker/shared").GameSettings["cardLocale"];
    generateOverlayViewToken: () => string;
    generateSpectatorToken: () => string;
    generateOverlayControlToken: () => string;
    generateOverlayControlInviteToken: () => string;
  }) => Room;
  buildAutoRuleset: (playerCount: number) => import("@bunker/shared").GameRuleset;
  generateRoomCode: () => string;
  buildDisasterOptions: (
    assets: import("@bunker/shared").AssetCatalog
  ) => Array<{ id: string; title: string }>;
  normalizeCardLocale: (value: unknown) => import("@bunker/shared").GameSettings["cardLocale"];
  generateOverlayViewToken: () => string;
  generateSpectatorToken: () => string;
  generateOverlayControlToken: () => string;
  generateOverlayControlInviteToken: () => string;
  attachPlayer: (room: Room, payload: ClientHelloPayload, ws: WebSocket, existing?: Player) => Player;
  printOverlayInfo: (
    roomCode: string,
    token: string,
    controlToken: string,
    inviteToken: string,
    urlParams: Record<string, string> | undefined,
    spectatorToken?: string
  ) => void;
  updateRulesetIfAuto: (room: Room) => void;
  broadcastRoomState: (room: Room) => void;
  broadcastGameViews: (room: Room) => void;
  sendGameView: (room: Room, player: Player) => void;
  buildRoomState: (room: Room) => RoomState;
  localizeGameViewForLocale: (
    view: GameView,
    locale: import("@bunker/shared").GameSettings["cardLocale"],
    scenarioId: string
  ) => GameView;
  getRoomCardLocale: (room: Room) => import("@bunker/shared").GameSettings["cardLocale"];
  findPlayerByTabId: (room: Room, tabId?: string) => Player | undefined;
  findPlayerByToken: (room: Room, token?: string) => Player | undefined;
  findPlayerBySessionId: (room: Room, sessionId?: string) => Player | undefined;
  getScenarioStatus: (room: Room, playerId: string) => string | undefined;
  computeKickRemainingMs: (player: Player, now?: number) => number;
  markPlayerLeftBunker: (room: Room, player: Player) => void;
  getEffectiveMaxPlayers: (room: Room) => number;
  getRoleForToken: (room: Room, token: string) => import("@bunker/shared").Role | null;
  canControl: (role: import("@bunker/shared").Role) => boolean;
  sendOverlayState: (
    room: Room,
    ws: WebSocket,
    role?: import("@bunker/shared").Role
  ) => Promise<void>;
  tServerForRoom: (room: Room | undefined, key: string, vars?: Record<string, unknown>) => string;
}

export function handleHelloMessage(ws: WebSocket, message: HelloMessage, deps: SessionHandlerDeps): void {
  const payload = message.payload;
  deps.devLog("hello received", {
    mode: deps.identityMode,
    room: payload.roomCode ?? "(create)",
    tabId: payload.tabId ?? null,
    token: payload.playerToken ? "set" : "none",
  });

  if (deps.identityMode === "dev_tab" && !payload.tabId && !payload.playerToken) {
    deps.logProtocol("hello rejected", { reason: "missing_tabId", mode: deps.identityMode });
    deps.sendLocalizedError(ws, {
      key: "error.tabIdRequiredDev",
    });
    return;
  }

  if (payload.create) {
    if (!payload.scenarioId) {
      deps.logProtocol("hello rejected", { reason: "missing_scenarioId" });
      deps.sendLocalizedError(ws, {
        key: "error.scenarioIdRequired",
      });
      return;
    }
    const scenarioModule = deps.scenarioMap.get(payload.scenarioId);
    if (!scenarioModule) {
      deps.logProtocol("hello rejected", { reason: "scenario_not_found", scenarioId: payload.scenarioId });
      deps.sendLocalizedError(ws, {
        key: "error.scenarioNotFound",
      });
      return;
    }
    const room = deps.createLobbyRoom({
      scenarioModule,
      assets: deps.assets,
      defaultSettings: deps.defaultSettings,
      locale: payload.locale,
      identityMode: deps.identityMode,
      buildAutoRuleset: deps.buildAutoRuleset,
      minClassicPlayers: deps.minClassicPlayers,
      generateRoomCode: deps.generateRoomCode,
      buildDisasterOptions: deps.buildDisasterOptions,
      normalizeCardLocale: deps.normalizeCardLocale,
      generateOverlayViewToken: deps.generateOverlayViewToken,
      generateSpectatorToken: deps.generateSpectatorToken,
      generateOverlayControlToken: deps.generateOverlayControlToken,
      generateOverlayControlInviteToken: deps.generateOverlayControlInviteToken,
    });
    deps.rooms.set(room.code, room);
    if (deps.devLogs) {
      console.log(`[dev] room created code=${room.code} scenario=${room.scenarioMeta.id}`);
    }
    deps.logRoomLifecycle("created", room.code, {
      scenario: room.scenarioMeta.id,
      phase: room.phase,
    });
    deps.attachPlayer(room, payload, ws);
    deps.printOverlayInfo(
      room.code,
      room.overlayToken,
      room.overlayEditToken,
      room.overlayControlInviteToken,
      room.overlayOverrides?.overlayUrlParams,
      room.spectatorToken
    );
    deps.updateRulesetIfAuto(room);
    deps.logRoomLifecycle("joined", room.code, {
      player: payload.name,
      count: room.players.size,
      phase: room.phase,
    });
    deps.broadcastRoomState(room);
    return;
  }

  if (!payload.roomCode) {
    deps.logProtocol("hello rejected", { reason: "missing_roomCode" });
    deps.sendLocalizedError(ws, {
      key: "error.roomCodeRequired",
    });
    return;
  }

  const room = deps.rooms.get(payload.roomCode.toUpperCase());
  if (!room) {
    deps.logProtocol("hello rejected", { reason: "room_not_found", roomCode: payload.roomCode.toUpperCase() });
    deps.sendLocalizedError(ws, {
      key: "error.roomNotFound",
    });
    return;
  }
  if (payload.locale) {
    room.settings.cardLocale = deps.normalizeCardLocale(payload.locale);
  }

  const controlPlayerForRoom = room.players.get(room.controlId);
  const controlPlayerToken = String(controlPlayerForRoom?.token ?? "");
  const helloPlayerToken = String(payload.playerToken ?? "");
  const isOverlayControlCompanionByToken =
    payload.name === "CONTROL" &&
    Boolean(helloPlayerToken) &&
    (helloPlayerToken === room.overlayEditToken || helloPlayerToken === controlPlayerToken);
  if (isOverlayControlCompanionByToken) {
    const controlPlayer = room.players.get(room.controlId);
    if (!controlPlayer) {
      deps.sendLocalizedError(ws, {
        key: "error.controlPlayerNotFoundInRoom",
        room,
      });
      return;
    }
    deps.connectionInfo.set(ws, { roomCode: room.code, playerId: controlPlayer.playerId });
    deps.send(ws, {
      type: "helloAck",
      payload: { playerId: controlPlayer.playerId, playerToken: controlPlayer.token },
    });
    deps.send(ws, { type: "roomState", payload: deps.buildRoomState(room) });
    if (room.phase === "game" && room.session) {
      try {
        const payloadView =
          room.lastGameViews?.get(controlPlayer.playerId) ??
          deps.localizeGameViewForLocale(
            room.session.getGameView(controlPlayer.playerId),
            deps.getRoomCardLocale(room),
            room.scenarioId
          );
        deps.send(ws, { type: "gameView", payload: payloadView });
      } catch {
      }
    }
    return;
  }

  let existing: Player | undefined;
  if (deps.identityMode === "dev_tab") {
    existing = deps.findPlayerByTabId(room, payload.tabId);
  } else {
    existing = deps.findPlayerByToken(room, payload.playerToken);
    if (!existing) {
      existing = deps.findPlayerBySessionId(room, payload.sessionId);
    }
  }

  const existingPlayer = existing;
  const isCompanionControlSocket =
    payload.name === "CONTROL" &&
    Boolean(payload.playerToken) &&
    existingPlayer !== undefined &&
    existingPlayer.connected &&
    Boolean(existingPlayer.ws) &&
    existingPlayer.ws !== ws;
  if (isCompanionControlSocket && existingPlayer) {
    deps.connectionInfo.set(ws, { roomCode: room.code, playerId: existingPlayer.playerId });
    deps.send(ws, {
      type: "helloAck",
      payload: { playerId: existingPlayer.playerId, playerToken: existingPlayer.token },
    });
    deps.send(ws, { type: "roomState", payload: deps.buildRoomState(room) });
    if (room.phase === "game" && room.session) {
      try {
        const payloadView =
          room.lastGameViews?.get(existingPlayer.playerId) ??
          deps.localizeGameViewForLocale(
            room.session.getGameView(existingPlayer.playerId),
            deps.getRoomCardLocale(room),
            room.scenarioId
          );
        deps.send(ws, { type: "gameView", payload: payloadView });
      } catch {
      }
    }
    return;
  }

  if (existing?.leftBunker) {
    if (!(existing.kickedAt && Date.now() - existing.kickedAt <= deps.reconnectGraceAfterKickMs)) {
      deps.sendReconnectForbidden(ws, room);
      return;
    }
  }

  if (existing && room.phase === "game") {
    const status = deps.getScenarioStatus(room, existing.playerId);
    if (status === "eliminated" && existing.disconnectedAt) {
      if (Date.now() - existing.disconnectedAt > deps.disconnectGraceMs) {
        deps.sendReconnectForbidden(ws, room);
        return;
      }
    }
  }
  if (existing?.disconnectedAt) {
    const remainingMs = deps.computeKickRemainingMs(existing);
    if (remainingMs <= 0) {
      deps.markPlayerLeftBunker(room, existing);
      deps.sendLocalizedError(ws, {
        key: "error.leftBunkerRejoinAsNew",
        room,
        code: "LEFT_BUNKER",
      });
      return;
    }
  }

  if (!existing && room.phase === "lobby" && room.players.size >= deps.getEffectiveMaxPlayers(room)) {
    const maxPlayers = deps.getEffectiveMaxPlayers(room);
    deps.sendLocalizedError(ws, {
      key: "error.roomFull",
      room,
      code: "ROOM_FULL",
      vars: { maxPlayers },
      extra: { maxPlayers },
    });
    return;
  }

  if (!existing && room.phase === "game") {
    deps.devLog("reconnect failed: player not found", { room: room.code });
    deps.sendLocalizedError(ws, {
      key: "error.playerRestoreFailedRejoin",
      room,
      code: "PLAYER_RESTORE_FAILED",
    });
    return;
  }

  const wasDisconnected = Boolean(existing?.disconnectedAt);
  const player = deps.attachPlayer(room, payload, ws, existing);
  deps.devLog("player resolved", { room: room.code, playerId: player.playerId, existing: Boolean(existing) });
  deps.updateRulesetIfAuto(room);
  deps.logRoomLifecycle(existing ? "reconnected" : "joined", room.code, {
    player: player.name,
    count: room.players.size,
    phase: room.phase,
  });
  deps.broadcastRoomState(room);
  if (room.phase === "game") {
    deps.sendGameView(room, player);
    if (wasDisconnected) {
      deps.broadcastGameViews(room);
    }
  }
}

export function handleResumeMessage(ws: WebSocket, message: ResumeMessage, deps: SessionHandlerDeps): void {
  const payload = message.payload;
  const room = deps.rooms.get(payload.roomCode.toUpperCase());
  if (!room) {
    deps.sendLocalizedError(ws, {
      key: "error.roomNotFound",
    });
    return;
  }
  const existing = deps.findPlayerBySessionId(room, payload.sessionId);
  if (!existing) {
    deps.sendLocalizedError(ws, {
      key: "error.playerRestoreFailed",
      room,
      code: "PLAYER_RESTORE_FAILED",
    });
    return;
  }

  if (existing.leftBunker) {
    if (!(existing.kickedAt && Date.now() - existing.kickedAt <= deps.reconnectGraceAfterKickMs)) {
      deps.sendReconnectForbidden(ws, room);
      return;
    }
  }

  if (room.phase === "game") {
    const status = deps.getScenarioStatus(room, existing.playerId);
    if (status === "eliminated" && existing.disconnectedAt) {
      if (Date.now() - existing.disconnectedAt > deps.disconnectGraceMs) {
        deps.sendReconnectForbidden(ws, room);
        return;
      }
    }
  }

  if (existing.disconnectedAt) {
    const remainingMs = deps.computeKickRemainingMs(existing);
    if (remainingMs <= 0) {
      deps.markPlayerLeftBunker(room, existing);
      deps.sendLocalizedError(ws, {
        key: "error.leftBunkerRejoinAsNew",
        room,
        code: "LEFT_BUNKER",
      });
      return;
    }
  }

  const wasDisconnected = Boolean(existing.disconnectedAt);
  const helloPayload: ClientHelloPayload = {
    name: existing.name,
    roomCode: room.code,
    playerToken: existing.token,
    tabId: existing.tabId,
    sessionId: payload.sessionId,
  };
  const player = deps.attachPlayer(room, helloPayload, ws, existing);
  deps.devLog("resume ok", { room: room.code, playerId: player.playerId });
  deps.updateRulesetIfAuto(room);
  deps.broadcastRoomState(room);
  if (room.phase === "game") {
    deps.sendGameView(room, player);
    if (wasDisconnected) {
      deps.broadcastGameViews(room);
    }
  }
}

export function handleOverlaySubscribeMessage(
  ws: WebSocket,
  message: OverlaySubscribeMessage,
  deps: SessionHandlerDeps
): void {
  const roomCode = message.payload.roomCode.toUpperCase();
  const room = deps.rooms.get(roomCode);
  if (!room) {
    deps.send(ws, {
      type: "overlayState",
      payload: {
        ok: false,
        unauthorized: true,
        message: deps.tServerForRoom(undefined, "error.overlaySubscribeRoomNotFound"),
      },
    });
    return;
  }
  const token = message.payload.token;
  const role = deps.getRoleForToken(room, token);
  if (role === null || (role !== "VIEW" && !deps.canControl(role))) {
    deps.send(ws, {
      type: "overlayState",
      payload: {
        ok: false,
        unauthorized: true,
        roomCode,
        message: deps.tServerForRoom(room, "error.overlaySubscribeUnauthorized"),
      },
    });
    return;
  }
  deps.overlaySubscriptions.set(ws, { roomCode, role });
  void deps.sendOverlayState(room, ws, role);
}
