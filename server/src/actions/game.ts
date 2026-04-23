import type { WebSocket } from "ws";
import type { ClientMessage, ScenarioAction } from "@bunker/shared";
import type { IdentityMode, Room } from "../core/types.js";

type GameActionMessage = Extract<
  ClientMessage,
  | { type: "revealCard" }
  | { type: "vote" }
  | { type: "finalizeVoting" }
  | { type: "applySpecial" }
  | { type: "revealWorldThreat" }
  | { type: "setBunkerOutcome" }
  | { type: "continueRound" }
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
  localizeScenarioMessageForRoom: (room: Room, key: string) => string;
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
      message.type === "revealWorldThreat") &&
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
    deps.send(ws, { type: "error", payload: { message: deps.localizeScenarioMessageForRoom(room, result.error) } });
    return;
  }
  if (result.stateChanged) {
    deps.broadcastGameViews(room);
  }
}
