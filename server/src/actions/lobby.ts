import type { WebSocket } from "ws";
import type { ClientMessage } from "@bunker/shared";
import type { Room } from "../core/types.js";

type StartGameMessage = Extract<ClientMessage, { type: "startGame" }>;
type UpdateLocaleMessage = Extract<ClientMessage, { type: "updateLocale" }>;
type UpdateSettingsMessage = Extract<ClientMessage, { type: "updateSettings" }>;
type UpdateRulesMessage = Extract<ClientMessage, { type: "updateRules" }>;
type RequestHostTransferMessage = Extract<ClientMessage, { type: "requestHostTransfer" }>;
type KickFromLobbyMessage = Extract<ClientMessage, { type: "kickFromLobby" }>;

export interface LobbyActionDeps {
  connectionInfo: WeakMap<WebSocket, { roomCode: string; playerId: string }>;
  rooms: Map<string, Room>;
  send: (ws: WebSocket, message: import("@bunker/shared").ServerMessage) => void;
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
  getRoleForPlayer: (room: Room, playerId: string | undefined) => import("@bunker/shared").Role;
  canControl: (role: import("@bunker/shared").Role) => boolean;
  canPlayerAction: (role: import("@bunker/shared").Role) => boolean;
  startGameAsControl: (room: Room) => {
    ok: boolean;
    message?: string;
    messageKey?: string;
    messageVars?: Record<string, unknown>;
  };
  normalizeCardLocale: (value: unknown) => import("@bunker/shared").GameSettings["cardLocale"];
  broadcastRoomState: (room: Room) => void;
  broadcastGameViews: (room: Room) => void;
  isClassicRoom: (room: Room) => boolean;
  clampInt: (value: number, min: number, max: number) => number;
  minClassicPlayers: number;
  maxClassicPlayers: number;
  normalizeForcedDisasterId: (
    value: string | undefined,
    options: Array<{ id: string; title: string }>
  ) => string;
  normalizeManualConfig: (
    config: import("@bunker/shared").ManualRulesConfig,
    presetCount: number
  ) => import("@bunker/shared").ManualRulesConfig;
  seedManualConfigFromPreset: (presetCount: number) => import("@bunker/shared").ManualRulesConfig;
  buildManualRuleset: (
    manualConfig: import("@bunker/shared").ManualRulesConfig,
    playerCount: number
  ) => import("@bunker/shared").GameRuleset;
  buildAutoRuleset: (playerCount: number) => import("@bunker/shared").GameRuleset;
  pickNextHost: (room: Room, excludeId?: string) => string | undefined;
  transferHost: (
    room: Room,
    reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual",
    excludeId?: string,
    preferredHostId?: string
  ) => void;
  removeLobbyPlayer: (room: Room, playerId: string) => boolean;
  devLog: (...args: unknown[]) => void;
}

function getRoomAndRole(ws: WebSocket, deps: LobbyActionDeps): {
  info?: { roomCode: string; playerId: string };
  room?: Room;
  role: import("@bunker/shared").Role | null;
} {
  const info = deps.connectionInfo.get(ws);
  if (!info) return { role: null };
  const room = deps.rooms.get(info.roomCode);
  if (!room) return { info, role: null };
  const role = deps.getRoleForPlayer(room, info.playerId);
  return { info, room, role };
}

export function handleStartGameMessage(ws: WebSocket, _message: StartGameMessage, deps: LobbyActionDeps): void {
  const { room, role } = getRoomAndRole(ws, deps);
  if (!room) {
    deps.sendLocalizedError(ws, { key: "error.roomNotFound" });
    return;
  }
  if (!role || !deps.canControl(role)) {
    deps.sendLocalizedError(ws, { key: "error.onlyControlStartGame", room });
    return;
  }
  const result = deps.startGameAsControl(room);
  if (!result.ok) {
    if (result.messageKey) {
      deps.sendLocalizedError(ws, { key: result.messageKey, room, vars: result.messageVars });
      return;
    }
    if (result.message) {
      deps.send(ws, { type: "error", payload: { message: result.message } });
      return;
    }
    deps.sendLocalizedError(ws, { key: "error.startGameFailed", room });
  }
}

export function handleUpdateLocaleMessage(ws: WebSocket, message: UpdateLocaleMessage, deps: LobbyActionDeps): void {
  const { room } = getRoomAndRole(ws, deps);
  if (!room) {
    deps.sendLocalizedError(ws, { key: "error.roomNotFound" });
    return;
  }
  const nextLocale = deps.normalizeCardLocale(message.payload.locale);
  if (room.settings.cardLocale === nextLocale) return;
  room.settings.cardLocale = nextLocale;
  room.lastRoomState = undefined;
  room.lastGameViews?.clear();
  for (const player of room.players.values()) {
    player.needsFullState = true;
    player.needsFullGameView = true;
  }
  deps.broadcastRoomState(room);
  if (room.session) deps.broadcastGameViews(room);
}

export function handleUpdateSettingsMessage(
  ws: WebSocket,
  message: UpdateSettingsMessage,
  deps: LobbyActionDeps
): void {
  const { room, role } = getRoomAndRole(ws, deps);
  if (!room) {
    deps.sendLocalizedError(ws, { key: "error.roomNotFound" });
    return;
  }
  if (room.phase !== "lobby") {
    deps.sendLocalizedError(ws, { key: "error.settingsLobbyOnly", room });
    return;
  }
  if (!role || !deps.canControl(role)) {
    deps.sendLocalizedError(ws, { key: "error.onlyControlChangeSettings", room });
    return;
  }
  const minAllowedPlayers = deps.isClassicRoom(room) ? deps.minClassicPlayers : 2;
  const nextMaxPlayers = deps.clampInt(message.payload.maxPlayers, minAllowedPlayers, deps.maxClassicPlayers);
  if (nextMaxPlayers < room.players.size) {
    deps.sendLocalizedError(ws, { key: "error.maxPlayersLowerThanCurrent", room });
    return;
  }
  room.settings = {
    ...message.payload,
    maxPlayers: nextMaxPlayers,
    forcedDisasterId: deps.normalizeForcedDisasterId(message.payload.forcedDisasterId, room.disasterOptions),
    cardLocale: deps.normalizeCardLocale(message.payload.cardLocale),
  };
  deps.broadcastRoomState(room);
}

export function handleUpdateRulesMessage(ws: WebSocket, message: UpdateRulesMessage, deps: LobbyActionDeps): void {
  const { room, role } = getRoomAndRole(ws, deps);
  if (!room) {
    deps.sendLocalizedError(ws, { key: "error.roomNotFound" });
    return;
  }
  if (!deps.isClassicRoom(room)) {
    deps.sendLocalizedError(ws, { key: "error.rulesClassicOnly", room });
    return;
  }
  if (room.phase !== "lobby") {
    deps.sendLocalizedError(ws, { key: "error.rulesLobbyOnly", room });
    return;
  }
  if (!role || !deps.canControl(role)) {
    deps.sendLocalizedError(ws, { key: "error.onlyControlChangeRules", room });
    return;
  }

  if (message.payload.mode === "auto") {
    room.rulesOverriddenByHost = false;
    room.rulesPresetCount = undefined;
    room.ruleset = deps.buildAutoRuleset(room.players.size);
  } else {
    const presetCount = deps.clampInt(
      message.payload.presetPlayerCount ?? room.rulesPresetCount ?? room.players.size,
      4,
      16
    );
    room.rulesOverriddenByHost = true;
    room.rulesPresetCount = presetCount;
    if (message.payload.manualConfig) {
      const manualConfig = deps.normalizeManualConfig(message.payload.manualConfig, presetCount);
      room.rulesPresetCount = manualConfig.seedTemplatePlayers ?? presetCount;
      room.ruleset = deps.buildManualRuleset(manualConfig, room.players.size);
    } else {
      const seedConfig = deps.seedManualConfigFromPreset(presetCount);
      room.ruleset = deps.buildManualRuleset(seedConfig, room.players.size);
    }
  }
  deps.broadcastRoomState(room);
}

export function handleRequestHostTransferMessage(
  ws: WebSocket,
  message: RequestHostTransferMessage,
  deps: LobbyActionDeps
): void {
  const { room, role } = getRoomAndRole(ws, deps);
  if (!room) {
    deps.sendLocalizedError(ws, { key: "error.roomNotFound" });
    return;
  }
  if (!role || !deps.canControl(role)) {
    deps.sendLocalizedError(ws, { key: "error.onlyControlTransferRole", room });
    return;
  }
  const requestedTargetId = String(message.payload.targetPlayerId ?? "").trim();
  if (requestedTargetId) {
    if (requestedTargetId === room.hostId) {
      deps.sendLocalizedError(ws, { key: "error.alreadyHost", room });
      return;
    }
    const requestedTarget = room.players.get(requestedTargetId);
    if (!requestedTarget) {
      deps.sendLocalizedError(ws, { key: "error.targetPlayerNotFound", room });
      return;
    }
    if (!requestedTarget.connected) {
      deps.sendLocalizedError(ws, { key: "error.cannotTransferHostOffline", room });
      return;
    }
  }
  const nextHostId = requestedTargetId || deps.pickNextHost(room, room.hostId);
  if (!nextHostId) {
    deps.sendLocalizedError(ws, { key: "error.noOtherPlayerForHostTransfer", room });
    return;
  }
  deps.transferHost(room, "manual", room.hostId, requestedTargetId || undefined);
}

export function handleKickFromLobbyMessage(ws: WebSocket, message: KickFromLobbyMessage, deps: LobbyActionDeps): void {
  const { room, role } = getRoomAndRole(ws, deps);
  if (!room) {
    deps.sendLocalizedError(ws, { key: "error.roomNotFound" });
    return;
  }
  if (room.phase !== "lobby") {
    deps.sendLocalizedError(ws, { key: "error.commandLobbyOnly", room });
    return;
  }
  if (!role || !deps.canControl(role)) {
    deps.sendLocalizedError(ws, { key: "error.onlyControlKick", room });
    return;
  }
  const targetId = message.payload.targetPlayerId;
  if (targetId === room.hostId) {
    deps.sendLocalizedError(ws, { key: "error.cannotKickHost", room });
    return;
  }
  const target = room.players.get(targetId);
  if (!target) {
    deps.sendLocalizedError(ws, { key: "error.targetPlayerNotFound", room });
    return;
  }
  if (target.ws) {
    try {
      target.ws.close();
    } catch {
    }
  }
  deps.removeLobbyPlayer(room, targetId);
  deps.devLog("lobby kick", {
    room: room.code,
    targetId,
    remaining: room.players.size,
  });
  if (deps.rooms.has(room.code)) {
    deps.broadcastRoomState(room);
  }
}
