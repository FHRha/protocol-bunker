import type {
  AssetCatalog,
  GameEvent,
  GameRuleset,
  ManualRulesConfig,
  ScenarioAction,
  ScenarioContext,
  ScenarioModule,
  ScenarioSession,
} from "@bunker/shared";
import { createRandomRng } from "./rng.js";
import type { Player, Room } from "../core/types.js";

export type ControlCommand =
  | "START_GAME"
  | "NEXT_STEP"
  | "SKIP_STEP"
  | "START_VOTE"
  | "END_VOTE"
  | "SET_OUTCOME_SURVIVED"
  | "SET_OUTCOME_FAILED"
  | "SKIP_ROUND"
  | "KICK_PLAYER"
  | "TRANSFER_HOST"
  | "SCENARIO_ACTION";

type ControlCommandError = { errorKey: string; errorVars?: Record<string, unknown> };
export type ControlCommandResult =
  | { ok: true }
  | { ok: false; messageKey?: string; messageVars?: Record<string, unknown>; message?: string };

interface ControlDeps {
  assets: AssetCatalog;
  rooms: Map<string, Room>;
  classicScenarioId: string;
  minClassicPlayers: number;
  isClassicRoom: (room: Room) => boolean;
  updateRulesetIfAuto: (room: Room) => void;
  broadcastRoomState: (room: Room) => void;
  broadcastGameViews: (room: Room) => void;
  broadcastEvent: (room: Room, event: GameEvent) => void;
  buildSystemEvent: (
    room: Room,
    kind: GameEvent["kind"],
    message: string,
    messageKey?: string,
    messageVars?: Record<string, string | number>
  ) => GameEvent;
  pickNextHost: (room: Room, excludeId?: string) => string | undefined;
  transferHost: (
    room: Room,
    reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual",
    excludeId?: string,
    preferredHostId?: string
  ) => void;
  removeLobbyPlayer: (room: Room, playerId: string) => boolean;
  addLobbyBotPlayer: (room: Room, preferredName?: string) => Player | null;
  getCurrentTurnPlayerId: (room: Room) => string | undefined;
  resolveControlActorId: (
    room: Room,
    options?: { preferredId?: string; allowAnyPresentPlayer?: boolean }
  ) => string | undefined;
}

const controlError = (
  messageKey: string,
  messageVars?: Record<string, unknown>
): ControlCommandResult => ({
  ok: false,
  messageKey,
  messageVars,
});

export function startGameAsControl(room: Room, deps: ControlDeps): ControlCommandResult {
  if (room.phase !== "lobby") {
    return controlError("error.control.gameAlreadyStarted");
  }
  if (deps.isClassicRoom(room) && room.players.size < deps.minClassicPlayers) {
    return controlError("error.control.minPlayersRequired", { minPlayers: deps.minClassicPlayers });
  }

  deps.updateRulesetIfAuto(room);

  const rng = createRandomRng();
  room.sessionPlayerIds = new Set(room.players.keys());
  const sessionContext: ScenarioContext = {
    roomCode: room.code,
    createdAt: room.createdAt,
    rng,
    assets: deps.assets,
    players: Array.from(room.players.values()).map((player) => ({
      playerId: player.playerId,
      name: player.name,
    })),
    settings: room.settings,
    hostId: room.hostId,
    ruleset: room.ruleset,
    onStateChange: () => deps.broadcastGameViews(room),
    onEvent: (event) => deps.broadcastEvent(room, event),
  };
  room.sessionContext = sessionContext;
  room.session = room.scenarioModule.createSession(sessionContext);
  try {
    room.world = room.session.getGameView(room.hostId).world;
  } catch {
    room.world = undefined;
  }
  room.phase = "game";
  deps.broadcastRoomState(room);
  deps.broadcastGameViews(room);
  return { ok: true };
}

export function parseControlScenarioAction(
  typeRaw: string,
  payloadRaw: Record<string, unknown>
): ScenarioAction | ControlCommandError {
  const actionType = String(typeRaw ?? "").trim();
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {};
  const requireNonEmpty = (
    value: unknown,
    errorKey: string,
    errorVars?: Record<string, unknown>
  ): string | ControlCommandError => {
    const next = String(value ?? "").trim();
    return next ? next : { errorKey, errorVars };
  };
  const toNumber = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  switch (actionType) {
    case "revealCard": {
      const cardId = requireNonEmpty(payload.cardId, "error.control.cardIdRequired");
      if (typeof cardId !== "string") return cardId;
      return { type: "revealCard", payload: { cardId } };
    }
    case "vote": {
      const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.voteTargetRequired");
      if (typeof targetPlayerId !== "string") return targetPlayerId;
      return { type: "vote", payload: { targetPlayerId } };
    }
    case "finalizeVoting":
      return { type: "finalizeVoting", payload: {} };
    case "applySpecial": {
      const specialInstanceId = requireNonEmpty(payload.specialInstanceId, "error.control.specialInstanceIdRequired");
      if (typeof specialInstanceId !== "string") return specialInstanceId;
      const nestedPayload =
        payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
          ? (payload.payload as Record<string, unknown>)
          : {};
      const fallbackPayload = { ...payload };
      delete fallbackPayload.specialInstanceId;
      delete fallbackPayload.payload;
      const effectivePayload =
        Object.keys(nestedPayload).length > 0 ? nestedPayload : fallbackPayload;
      return {
        type: "applySpecial",
        payload: {
          specialInstanceId,
          payload: effectivePayload,
        },
      };
    }
    case "revealWorldThreat": {
      const index = toNumber(payload.index);
      if (index === null || !Number.isInteger(index) || index < 0) {
        return { errorKey: "error.control.threatIndexInvalid" };
      }
      return { type: "revealWorldThreat", payload: { index } };
    }
    case "setBunkerOutcome": {
      const outcome = String(payload.outcome ?? "").trim();
      if (outcome !== "survived" && outcome !== "failed") {
        return { errorKey: "error.control.bunkerOutcomeInvalid" };
      }
      return { type: "setBunkerOutcome", payload: { outcome } };
    }
    case "devSkipRound":
      return { type: "devSkipRound", payload: {} };
    case "devKickPlayer": {
      const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.kickTargetRequired");
      if (typeof targetPlayerId !== "string") return targetPlayerId;
      return { type: "devKickPlayer", payload: { targetPlayerId } };
    }
    case "markLeftBunker": {
      const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.markLeftBunkerTargetRequired");
      if (typeof targetPlayerId !== "string") return targetPlayerId;
      return { type: "markLeftBunker", payload: { targetPlayerId } };
    }
    case "continueRound":
      return { type: "continueRound", payload: {} };
    case "devAddPlayer": {
      const name = String(payload.name ?? "").trim();
      return { type: "devAddPlayer", payload: name ? { name } : {} };
    }
    case "devRemovePlayer": {
      const targetPlayerId = String(payload.targetPlayerId ?? "").trim();
      return { type: "devRemovePlayer", payload: targetPlayerId ? { targetPlayerId } : {} };
    }
    case "adminReplacePlayerCard": {
      const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.targetPlayerRequired");
      if (typeof targetPlayerId !== "string") return targetPlayerId;
      const cardInstanceId = requireNonEmpty(payload.cardInstanceId, "error.control.playerCardRequired");
      if (typeof cardInstanceId !== "string") return cardInstanceId;
      const targetAreaRaw = String(payload.targetArea ?? "hand").trim().toLowerCase();
      const targetArea = targetAreaRaw === "special" ? "special" : "hand";
      const replacementModeRaw = String(payload.replacementMode ?? "random").trim().toLowerCase();
      const replacementMode = replacementModeRaw === "specific" ? "specific" : "random";
      const replacementCardId = String(payload.replacementCardId ?? "").trim();
      return {
        type: "adminReplacePlayerCard",
        payload: {
          targetPlayerId,
          cardInstanceId,
          targetArea,
          replacementMode,
          replacementCardId: replacementCardId || undefined,
        },
      };
    }
    case "adminSetWorldCardReveal": {
      const kind = String(payload.kind ?? "").trim().toLowerCase();
      if (kind !== "bunker" && kind !== "threat") {
        return { errorKey: "error.control.worldKindBunkerThreatRequired" };
      }
      const index = toNumber(payload.index);
      if (index === null || !Number.isInteger(index) || index < 0) {
        return { errorKey: "error.control.worldCardIndexInvalid" };
      }
      return { type: "adminSetWorldCardReveal", payload: { kind, index, revealed: Boolean(payload.revealed) } };
    }
    case "adminReplaceWorldCard": {
      const kind = String(payload.kind ?? "").trim().toLowerCase();
      if (kind !== "bunker" && kind !== "threat" && kind !== "disaster") {
        return { errorKey: "error.control.worldKindBunkerThreatDisasterRequired" };
      }
      const replacementModeRaw = String(payload.replacementMode ?? "random").trim().toLowerCase();
      const replacementMode = replacementModeRaw === "specific" ? "specific" : "random";
      const replacementCardId = String(payload.replacementCardId ?? "").trim();
      const index = toNumber(payload.index);
      if (kind !== "disaster" && (index === null || !Number.isInteger(index) || index < 0)) {
        return { errorKey: "error.control.worldIndexRequiredForBunkerThreat" };
      }
      return {
        type: "adminReplaceWorldCard",
        payload: {
          kind,
          index: kind === "disaster" ? undefined : index ?? undefined,
          replacementMode,
          replacementCardId: replacementCardId || undefined,
        },
      };
    }
    case "adminSetWorldCount": {
      const kind = String(payload.kind ?? "").trim().toLowerCase();
      if (kind !== "bunker" && kind !== "threat") {
        return { errorKey: "error.control.worldKindBunkerThreatRequired" };
      }
      const count = toNumber(payload.count);
      if (count === null || !Number.isInteger(count) || count < 0) {
        return { errorKey: "error.control.worldCountInvalid" };
      }
      return { type: "adminSetWorldCount", payload: { kind, count } };
    }
    case "adminApplySpecial": {
      const actorPlayerId = requireNonEmpty(payload.actorPlayerId, "error.control.actorPlayerRequired");
      if (typeof actorPlayerId !== "string") return actorPlayerId;
      const specialInstanceId = String(payload.specialInstanceId ?? "").trim();
      const specialId = String(payload.specialId ?? "").trim();
      if (!specialInstanceId && !specialId) {
        return { errorKey: "error.control.specialSelectionRequired" };
      }
      const nestedPayload =
        payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
          ? (payload.payload as Record<string, unknown>)
          : {};
      const fallbackPayload = { ...payload };
      delete fallbackPayload.actorPlayerId;
      delete fallbackPayload.specialInstanceId;
      delete fallbackPayload.specialId;
      delete fallbackPayload.payload;
      const effectivePayload =
        Object.keys(nestedPayload).length > 0 ? nestedPayload : fallbackPayload;
      return {
        type: "adminApplySpecial",
        payload: {
          actorPlayerId,
          specialInstanceId: specialInstanceId || undefined,
          specialId: specialId || undefined,
          payload: effectivePayload,
        },
      };
    }
    default:
      return { errorKey: "error.control.unsupportedScenarioAction", errorVars: { actionType: actionType || "unknown" } };
  }
}

export function runControlCommand(
  room: Room,
  command: ControlCommand,
  deps: ControlDeps,
  options?: {
    targetPlayerId?: string;
    actorPlayerId?: string;
    scenarioActionType?: string;
    scenarioPayload?: Record<string, unknown>;
  }
): ControlCommandResult {
  if (command === "START_GAME") {
    return startGameAsControl(room, deps);
  }

  if (command === "TRANSFER_HOST") {
    const requestedTargetId = String(options?.targetPlayerId ?? "").trim();
    if (requestedTargetId) {
      if (requestedTargetId === room.hostId) return controlError("error.alreadyHost");
      const requestedTarget = room.players.get(requestedTargetId);
      if (!requestedTarget) return controlError("error.targetPlayerNotFound");
      if (!requestedTarget.connected) return controlError("error.cannotTransferHostOffline");
    }
    const nextHostId = requestedTargetId || deps.pickNextHost(room, room.hostId);
    if (!nextHostId) return controlError("error.noOtherPlayerForHostTransfer");
    deps.transferHost(room, "manual", room.hostId, requestedTargetId || undefined);
    return { ok: true };
  }

  if (command === "KICK_PLAYER" && room.phase === "lobby") {
    const targetPlayerId = String(options?.targetPlayerId ?? "").trim();
    if (!targetPlayerId) return controlError("error.control.targetPlayerRequired");
    if (targetPlayerId === room.controlId) return controlError("error.control.cannotKickControl");
    const target = room.players.get(targetPlayerId);
    if (!target) return controlError("error.targetPlayerNotFound");
    if (target.ws) {
      try { target.ws.close(); } catch {}
    }
    deps.removeLobbyPlayer(room, targetPlayerId);
    if (deps.rooms.has(room.code)) {
      deps.broadcastRoomState(room);
    }
    return { ok: true };
  }

  if (command === "SCENARIO_ACTION") {
    const actionType = String(options?.scenarioActionType ?? "").trim();
    if (!actionType) return controlError("error.control.scenarioActionTypeRequired");
    const parsedScenarioAction = parseControlScenarioAction(actionType, options?.scenarioPayload ?? {});
    if ("errorKey" in parsedScenarioAction) {
      return controlError(parsedScenarioAction.errorKey, parsedScenarioAction.errorVars);
    }

    if (!room.session || room.phase !== "game") {
      if (parsedScenarioAction.type === "devAddPlayer") {
        const bot = deps.addLobbyBotPlayer(room, parsedScenarioAction.payload.name);
        if (!bot) return controlError("error.control.addBotFailed");
        deps.broadcastRoomState(room);
        return { ok: true };
      }

      if (parsedScenarioAction.type === "devKickPlayer" || parsedScenarioAction.type === "devRemovePlayer") {
        const targetPlayerId = String(parsedScenarioAction.payload.targetPlayerId ?? "").trim();
        if (!targetPlayerId) return controlError("error.control.targetPlayerRequired");
        if (targetPlayerId === room.controlId) return controlError("error.control.cannotKickControl");
        const target = room.players.get(targetPlayerId);
        if (!target) return controlError("error.targetPlayerNotFound");
        if (target.ws) {
          try { target.ws.close(); } catch {}
        }
        deps.removeLobbyPlayer(room, targetPlayerId);
        if (deps.rooms.has(room.code)) {
          deps.broadcastRoomState(room);
        }
        return { ok: true };
      }

      return controlError("error.control.availableAfterGameStart");
    }

    const explicitActorId = String(options?.actorPlayerId ?? "").trim();
    const preferredContinueActorId =
      parsedScenarioAction.type === "continueRound" && room.settings.continuePermission === "revealer_only"
        ? deps.getCurrentTurnPlayerId(room)
        : room.hostId;
    const actorPlayerId =
      parsedScenarioAction.type === "adminApplySpecial"
        ? parsedScenarioAction.payload.actorPlayerId
        : deps.resolveControlActorId(room, {
            preferredId: explicitActorId || preferredContinueActorId,
            allowAnyPresentPlayer: true,
          }) || room.hostId;
    if (!room.players.has(actorPlayerId)) {
      return controlError("error.control.actorNotFoundInRoom");
    }
    const result = room.session.handleAction(actorPlayerId, parsedScenarioAction);
    if (result.error) {
      return { ok: false, message: result.error };
    }
    if (result.stateChanged) {
      deps.broadcastGameViews(room);
    }
    return { ok: true };
  }

  if (!room.session || room.phase !== "game") {
    return controlError("error.gameNotFound");
  }

  const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
  if (!anchorId) return controlError("error.control.noActiveHost");

  let hostView: ReturnType<ScenarioSession["getGameView"]>;
  try {
    hostView = room.session.getGameView(anchorId);
  } catch {
    return controlError("error.control.phaseDetectFailed");
  }

  const continueActorId =
    room.settings.continuePermission === "revealer_only"
      ? hostView.public.currentTurnPlayerId ?? room.hostId
      : room.hostId;

  let scenarioAction: ScenarioAction | null = null;
  if (command === "NEXT_STEP" || command === "START_VOTE") {
    scenarioAction = { type: "continueRound", payload: {} };
  } else if (command === "END_VOTE") {
    scenarioAction = { type: "finalizeVoting", payload: {} };
  } else if (command === "SKIP_STEP") {
    if (hostView.phase === "reveal_discussion") {
      scenarioAction = { type: "continueRound", payload: {} };
    } else if (hostView.phase === "voting" && hostView.public.votePhase === "voteSpecialWindow") {
      scenarioAction = { type: "finalizeVoting", payload: {} };
    } else {
      return controlError("error.control.skipStepUnavailable");
    }
  } else if (command === "SKIP_ROUND") {
    scenarioAction = { type: "devSkipRound", payload: {} };
  } else if (command === "SET_OUTCOME_SURVIVED") {
    scenarioAction = { type: "setBunkerOutcome", payload: { outcome: "survived" } };
  } else if (command === "SET_OUTCOME_FAILED") {
    scenarioAction = { type: "setBunkerOutcome", payload: { outcome: "failed" } };
  } else if (command === "KICK_PLAYER") {
    const targetPlayerId = String(options?.targetPlayerId ?? "").trim();
    if (!targetPlayerId) return controlError("error.control.targetPlayerRequired");
    if (targetPlayerId === room.controlId) return controlError("error.control.cannotKickControl");
    scenarioAction = { type: "devKickPlayer", payload: { targetPlayerId } };
  }

  if (!scenarioAction) {
    return controlError("error.control.unknownCommand");
  }

  const actorId =
    deps.resolveControlActorId(room, {
      preferredId: scenarioAction.type === "continueRound" ? continueActorId : room.hostId,
      allowAnyPresentPlayer: true,
    }) || room.hostId;
  const result = room.session.handleAction(actorId, scenarioAction);
  if (result.error) {
    return { ok: false, message: result.error };
  }
  if (result.stateChanged) {
    deps.broadcastGameViews(room);
  }
  return { ok: true };
}
