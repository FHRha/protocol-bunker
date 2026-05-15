import type { WebSocket } from "ws";
import type { ClientMessage, ScenarioAction } from "@bunker/shared";
import type { IdentityMode, Room } from "../core/types.js";
import { appendMatchMessage } from "../game/matchMessages.js";

type GameActionMessage = Extract<
  ClientMessage,
  | { type: "revealCard" }
  | { type: "vote" }
  | { type: "finalizeVoting" }
  | { type: "applySpecial" }
  | { type: "revealWorldThreat" }
  | { type: "setBunkerOutcome" }
  | { type: "continueRound" }
  | { type: "sendMatchMessage" }
  | { type: "devSkipRound" }
  | { type: "devKickPlayer" }
  | { type: "devAddPlayer" }
  | { type: "devRemovePlayer" }
>;

export interface GameActionDeps {
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
  resolveControlActorId: (
    room: Room,
    options?: { preferredId?: string; allowAnyPresentPlayer?: boolean }
  ) => string | undefined;
  getCurrentTurnPlayerId: (room: Room) => string | undefined;
  localizeScenarioMessageForPlayer: (
    room: Room,
    playerId: string,
    message: string,
    vars?: Record<string, string | number>
  ) => string;
  scheduleRuleBasedBots: (room: Room) => void;
  broadcastGameViews: (room: Room) => void;
  devScenariosEnabled: boolean;
  identityMode: IdentityMode;
  classicScenarioId: string;
}

const CONTROL_ONLY_ACTIONS = new Set([
  "finalizeVoting",
  "devSkipRound",
  "devKickPlayer",
  "devAddPlayer",
  "devRemovePlayer",
]);

const MATCH_MESSAGE_MIN_INTERVAL_MS = 1_200;
const MATCH_MESSAGE_WINDOW_MS = 10_000;
const MATCH_MESSAGE_MAX_PER_WINDOW = 6;

function canSendMatchMessage(room: Room, playerId: string, now: number): boolean {
  if (!room.matchMessageRateLimits) {
    room.matchMessageRateLimits = new Map();
  }
  const current = room.matchMessageRateLimits.get(playerId);
  if (!current || now - current.windowStartedAt > MATCH_MESSAGE_WINDOW_MS) {
    room.matchMessageRateLimits.set(playerId, {
      windowStartedAt: now,
      count: 1,
      lastSentAt: now,
    });
    return true;
  }
  if (now - current.lastSentAt < MATCH_MESSAGE_MIN_INTERVAL_MS) {
    return false;
  }
  if (current.count >= MATCH_MESSAGE_MAX_PER_WINDOW) {
    return false;
  }
  current.count += 1;
  current.lastSentAt = now;
  return true;
}

export function handleGameActionMessage(ws: WebSocket, message: GameActionMessage, deps: GameActionDeps): void {
  const info = deps.connectionInfo.get(ws);
  if (!info) {
    deps.sendLocalizedError(ws, {
      key: "error.notInRoom",
    });
    return;
  }

  const room = deps.rooms.get(info.roomCode);
  if (!room || !room.session) {
    deps.sendLocalizedError(ws, {
      key: "error.gameNotFound",
      room,
    });
    return;
  }

  const role = deps.getRoleForPlayer(room, info.playerId);
  const continueRequiresControl =
    message.type === "continueRound" && Boolean(room.settings.enablePresenterMode);

  if ((CONTROL_ONLY_ACTIONS.has(message.type) || continueRequiresControl) && !deps.canControl(role)) {
    deps.sendLocalizedError(ws, {
      key: "error.actionControlOnly",
      room,
      code: "PERMISSION_DENIED",
    });
    return;
  }

  if (
    (message.type === "revealCard" ||
      message.type === "vote" ||
      message.type === "applySpecial" ||
      message.type === "revealWorldThreat" ||
      message.type === "sendMatchMessage") &&
    !deps.canPlayerAction(role)
  ) {
    deps.sendLocalizedError(ws, {
      key: "error.actionPlayerPermission",
      room,
      code: "PERMISSION_DENIED",
    });
    return;
  }

  if (
    (message.type === "devAddPlayer" || message.type === "devRemovePlayer") &&
    !(deps.devScenariosEnabled && room.scenarioMeta.devOnly)
  ) {
    deps.sendLocalizedError(ws, {
      key: "error.devCommandsOnlyDevScenarios",
      room,
    });
    return;
  }

  if (message.type === "devSkipRound" || message.type === "devKickPlayer") {
    if (deps.identityMode !== "dev_tab") {
      deps.sendLocalizedError(ws, {
        key: "error.devModeDisabled",
        room,
      });
      return;
    }
    if (room.scenarioMeta.id !== deps.classicScenarioId) {
      deps.sendLocalizedError(ws, {
        key: "error.commandClassicOnly",
        room,
      });
      return;
    }
  }

  if (message.type === "sendMatchMessage") {
    const player = room.players.get(info.playerId);
    const text = message.payload.text.trim().slice(0, 500);
    if (!player || !text) return;
    if (!canSendMatchMessage(room, player.playerId, Date.now())) return;
    appendMatchMessage(room, {
      kind: "player",
      text,
      sourcePlayerId: player.playerId,
      sourceName: player.name,
    });
    deps.broadcastGameViews(room);
    return;
  }

  const action = message as ScenarioAction;
  let actorId =
    CONTROL_ONLY_ACTIONS.has(message.type) || continueRequiresControl
      ? deps.resolveControlActorId(room, { preferredId: room.hostId, allowAnyPresentPlayer: true }) || room.hostId
      : info.playerId;

  if (
    message.type === "continueRound" &&
    deps.canControl(role) &&
    room.settings.continuePermission === "revealer_only"
  ) {
    const turnActorId = deps.getCurrentTurnPlayerId(room);
    actorId =
      deps.resolveControlActorId(room, {
        preferredId: turnActorId || room.hostId,
        allowAnyPresentPlayer: true,
      }) || actorId;
  }

  if (message.type === "continueRound" && room.settings.continuePermission === "host_only") {
    const canProxyContinueAsHost = info.playerId === room.hostId || deps.canControl(role);
    if (canProxyContinueAsHost) {
      actorId =
        deps.resolveControlActorId(room, {
          preferredId: room.hostId,
          allowAnyPresentPlayer: true,
        }) || actorId;
    }
  }

  const result = room.session.handleAction(actorId, action);
  if (result.error) {
    deps.send(ws, {
      type: "error",
      payload: {
        message: deps.localizeScenarioMessageForPlayer(
          room,
          info.playerId,
          result.errorKey ?? result.error,
          result.errorVars
        ),
      },
    });
    return;
  }
  if (result.stateChanged) {
    deps.scheduleRuleBasedBots(room);
    deps.broadcastGameViews(room);
  }
}
