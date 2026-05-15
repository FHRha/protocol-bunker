import type { GameEvent, GameRuleset, ManualRulesConfig, PlayerStatus, ScenarioSession, ServerMessage } from "@bunker/shared";
import type { WebSocket } from "ws";
import type { Player, Room } from "../core/types.js";
import { getCachedGameView } from "../rooms/runtime.js";
import { syncScenarioStatuses } from "../presenters/gameState.js";

export function isClassicRoom(room: Room, classicScenarioId: string): boolean {
  return room.scenarioMeta.id === classicScenarioId;
}

export function getEffectiveMaxPlayers(
  room: Room,
  options: { classicScenarioId: string; maxClassicPlayers: number }
): number {
  if (!isClassicRoom(room, options.classicScenarioId)) return room.settings.maxPlayers;
  return Math.min(room.settings.maxPlayers, options.maxClassicPlayers);
}

export function updateRulesetIfAuto(
  room: Room,
  options: {
    classicScenarioId: string;
    buildAutoRuleset: (playerCount: number) => GameRuleset;
    buildManualRuleset: (manualConfig: ManualRulesConfig, playerCount: number) => GameRuleset;
  }
): void {
  if (room.phase !== "lobby") return;
  if (!isClassicRoom(room, options.classicScenarioId)) {
    room.ruleset = options.buildAutoRuleset(room.players.size);
    room.rulesOverriddenByHost = false;
    room.rulesPresetCount = undefined;
    return;
  }
  if (room.rulesOverriddenByHost) {
    const manualConfig = room.ruleset.manualConfig;
    if (room.ruleset.rulesetMode === "manual" && manualConfig) {
      room.ruleset = options.buildManualRuleset(manualConfig, room.players.size);
      room.rulesPresetCount = manualConfig.seedTemplatePlayers;
    }
    return;
  }
  room.ruleset = options.buildAutoRuleset(room.players.size);
  room.rulesPresetCount = undefined;
}

export function broadcastEvent(
  room: Room,
  event: GameEvent,
  send: (ws: WebSocket, message: ServerMessage) => void
): void {
  for (const player of room.players.values()) {
    if (!player.ws) continue;
    send(player.ws, { type: "gameEvent", payload: event });
  }
}

export function buildSystemEvent(
  room: Room,
  kind: GameEvent["kind"],
  message: string,
  messageKey?: string,
  messageVars?: Record<string, string | number>
): GameEvent {
  return {
    id: `${room.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
    messageKey,
    messageVars,
    createdAt: Date.now(),
  };
}

export function getScenarioStatus(room: Room, playerId: string): PlayerStatus | undefined {
  const cached = room.players.get(playerId)?.scenarioStatus;
  if (cached) return cached;
  const cachedView = getCachedGameView(room);
  const cachedStatus = cachedView?.public.players.find((entry) => entry.playerId === playerId)?.status;
  if (cachedStatus) {
    syncScenarioStatuses(room, cachedView.public.players);
    return room.players.get(playerId)?.scenarioStatus ?? cachedStatus;
  }
  if (!room.session) return undefined;
  try {
    const view = room.session.getGameView(playerId);
    syncScenarioStatuses(room, view.public.players);
    return room.players.get(playerId)?.scenarioStatus;
  } catch (error) {
    console.error("[server] getScenarioStatus failed", error);
    return undefined;
  }
}

export function isPlayerAlive(room: Room, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player) return false;
  if (player.leftBunker) return false;
  if (!room.session) return true;
  const status = getScenarioStatus(room, playerId);
  return status ? status === "alive" : true;
}

export function pickNextHost(room: Room, excludeId?: string): string | undefined {
  const order = room.joinOrder.filter((id) => room.players.has(id));
  if (order.length === 0) return undefined;
  for (const id of order) {
    if (excludeId && id === excludeId) continue;
    if (room.players.get(id)?.isBot) continue;
    if (isPlayerAlive(room, id)) return id;
  }
  for (const id of order) {
    if (excludeId && id === excludeId) continue;
    if (room.players.get(id)?.isBot) continue;
    return id;
  }
  return undefined;
}

export function getCurrentTurnPlayerId(room: Room): string | undefined {
  const cached = getCachedGameView(room);
  if (cached?.public.currentTurnPlayerId) {
    return cached.public.currentTurnPlayerId;
  }
  if (!room.session) return undefined;
  const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
  if (!anchorId) return undefined;
  try {
    const view = room.session.getGameView(anchorId);
    return view.public.currentTurnPlayerId ?? undefined;
  } catch {
    return undefined;
  }
}

export function resolveControlActorId(
  room: Room,
  options?: { preferredId?: string; allowAnyPresentPlayer?: boolean }
): string | undefined {
  const preferredId = String(options?.preferredId ?? "").trim();
  if (preferredId) {
    if (!room.players.has(preferredId)) return undefined;
    if (!room.session || isPlayerAlive(room, preferredId)) return preferredId;
  }

  if (room.players.has(room.hostId) && (!room.session || isPlayerAlive(room, room.hostId))) {
    return room.hostId;
  }

  const nextAlive = pickNextHost(room, room.hostId);
  if (nextAlive) return nextAlive;

  if (options?.allowAnyPresentPlayer) {
    const anyPresent = room.joinOrder.find((id) => room.players.has(id));
    if (anyPresent) return anyPresent;
  }

  if (room.players.has(room.hostId)) return room.hostId;
  return room.joinOrder.find((id) => room.players.has(id));
}

export function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
