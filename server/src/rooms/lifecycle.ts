import crypto from "node:crypto";
import type { WebSocket } from "ws";
import type { ClientHelloPayload, GameEvent } from "@bunker/shared";
import type { IdentityMode, Player, Room } from "../core/types.js";
import { connectionInfo, rooms } from "../core/serverState.js";

interface CleanupInactiveRoomsDeps {
  getRoomGamePhase: (room: Room) => string | undefined;
  hasOverlaySubscribers: (roomCode: string) => boolean;
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  roomEndedTtlMs: number;
  roomInactiveTtlMs: number;
}

interface RemoveLobbyPlayerDeps {
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  pickNextHost: (room: Room, excludeId?: string) => string | undefined;
  updateRulesetIfAuto: (room: Room) => void;
}

interface AddLobbyBotPlayerDeps {
  getEffectiveMaxPlayers: (room: Room) => number;
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  tServerForRoom: (room: Room | undefined, key: string, vars?: Record<string, unknown>) => string;
  updateRulesetIfAuto: (room: Room) => void;
  generatePlayerReconnectToken: () => string;
}

interface AttachPlayerDeps {
  broadcastEvent: (room: Room, event: GameEvent) => void;
  buildSystemEvent: (room: Room, kind: GameEvent["kind"], message: string) => GameEvent;
  identityMode: IdentityMode;
  tServerForRoom: (room: Room | undefined, key: string, vars?: Record<string, unknown>) => string;
  send: (ws: WebSocket, message: unknown) => void;
  generatePlayerReconnectToken: () => string;
}

export function cleanupInactiveRooms(deps: CleanupInactiveRoomsDeps): void {
  const now = Date.now();
  for (const [roomCode, room] of rooms.entries()) {
    const players = Array.from(room.players.values());
    if (players.length === 0) {
      deps.logRoomLifecycle("closed", roomCode, { reason: "cleanup_empty" });
      rooms.delete(roomCode);
      continue;
    }
    if (players.some((player) => player.connected || Boolean(player.ws))) continue;
    if (deps.hasOverlaySubscribers(roomCode)) continue;

    let lastDisconnectAt = 0;
    for (const player of players) {
      if (player.disconnectedAt) {
        lastDisconnectAt = Math.max(lastDisconnectAt, player.disconnectedAt);
      }
    }
    if (!lastDisconnectAt) continue;

    const inactiveMs = now - lastDisconnectAt;
    const gamePhase = deps.getRoomGamePhase(room);
    const ttlMs = gamePhase === "ended" ? deps.roomEndedTtlMs : deps.roomInactiveTtlMs;
    if (inactiveMs < ttlMs) continue;

    if (room.hostTransferTimer) {
      clearTimeout(room.hostTransferTimer);
      room.hostTransferTimer = undefined;
    }
    for (const player of room.players.values()) {
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = undefined;
      }
      if (player.disconnectTicker) {
        clearInterval(player.disconnectTicker);
        player.disconnectTicker = undefined;
      }
    }

    deps.logRoomLifecycle("closed", roomCode, {
      reason: gamePhase === "ended" ? "cleanup_ended_ttl" : "cleanup_inactive_ttl",
      inactiveSec: Math.floor(inactiveMs / 1000),
      phase: room.phase,
      gamePhase,
      players: room.players.size,
    });
    rooms.delete(roomCode);
  }
}

export function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

export function removeLobbyPlayer(room: Room, playerId: string, deps: RemoveLobbyPlayerDeps): boolean {
  const player = room.players.get(playerId);
  if (!player) return false;

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }
  if (player.disconnectTicker) {
    clearInterval(player.disconnectTicker);
    player.disconnectTicker = undefined;
  }

  if (player.ws) {
    connectionInfo.delete(player.ws);
  }

  room.players.delete(playerId);
  room.playersByToken.delete(player.token);
  if (player.tabId) {
    room.playersByTabId.delete(player.tabId);
  }
  if (player.sessionId) {
    room.playersBySessionId.delete(player.sessionId);
  }
  room.joinOrder = room.joinOrder.filter((id) => id !== playerId);
  deps.logRoomLifecycle("left", room.code, {
    player: player.name,
    count: room.players.size,
    phase: room.phase,
  });

  if (room.players.size === 0) {
    if (room.hostTransferTimer) {
      clearTimeout(room.hostTransferTimer);
      room.hostTransferTimer = undefined;
    }
    deps.logRoomLifecycle("closed", room.code, { reason: "empty_lobby" });
    rooms.delete(room.code);
    return true;
  }

  if (room.hostId === playerId) {
    const nextHostId = deps.pickNextHost(room, playerId);
    if (nextHostId) {
      room.hostId = nextHostId;
      if (room.sessionContext) {
        room.sessionContext.hostId = nextHostId;
      }
    }
  }
  if (room.controlId === playerId) {
    const nextControlId = deps.pickNextHost(room, playerId);
    if (nextControlId) {
      room.controlId = nextControlId;
    }
  }

  deps.updateRulesetIfAuto(room);
  return true;
}

export function addLobbyBotPlayer(room: Room, deps: AddLobbyBotPlayerDeps, preferredName?: string): Player | null {
  if (room.phase !== "lobby") return null;
  const maxPlayers = deps.getEffectiveMaxPlayers(room);
  if (room.players.size >= maxPlayers) return null;

  const baseName = String(preferredName ?? "").trim() || deps.tServerForRoom(room, "info.botDefaultName");
  const existingNames = new Set(
    Array.from(room.players.values()).map((player) => String(player.name || "").trim().toLocaleLowerCase("ru-RU"))
  );
  let nextName = baseName;
  let suffix = 2;
  while (existingNames.has(nextName.toLocaleLowerCase("ru-RU"))) {
    nextName = `${baseName} ${suffix}`;
    suffix += 1;
  }

  const bot: Player = {
    playerId: crypto.randomUUID(),
    name: nextName,
    token: deps.generatePlayerReconnectToken(),
    connected: true,
    totalAbsentMs: 0,
    needsFullState: false,
    needsFullGameView: false,
  };

  room.players.set(bot.playerId, bot);
  room.playersByToken.set(bot.token, bot.playerId);
  room.joinOrder.push(bot.playerId);
  deps.updateRulesetIfAuto(room);
  deps.logRoomLifecycle("joined", room.code, { player: bot.name, count: room.players.size, phase: room.phase });
  return bot;
}

export function attachPlayer(
  room: Room,
  payload: ClientHelloPayload,
  ws: WebSocket,
  deps: AttachPlayerDeps,
  existing?: Player
): Player {
  const isNew = !existing;
  const player = existing ?? {
    playerId: crypto.randomUUID(),
    name: payload.name,
    token: deps.generatePlayerReconnectToken(),
    tabId: deps.identityMode === "dev_tab" ? payload.tabId : undefined,
    sessionId: payload.sessionId,
    connected: true,
    totalAbsentMs: 0,
  };

  if (isNew || !player.name) {
    player.name = payload.name;
  }
  if (payload.sessionId) {
    player.sessionId = payload.sessionId;
  }
  if (deps.identityMode === "dev_tab" && payload.tabId) {
    player.tabId = payload.tabId;
  }
  const wasDisconnected = Boolean(player.disconnectedAt);
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }
  if (player.disconnectTicker) {
    clearInterval(player.disconnectTicker);
    player.disconnectTicker = undefined;
  }
  player.disconnectNotifiedMinutes = undefined;
  if (wasDisconnected) {
    player.totalAbsentMs = 0;
    player.disconnectedAt = undefined;
  }
  if (room.hostId === player.playerId && room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
    deps.broadcastEvent(
      room,
      deps.buildSystemEvent(
        room,
        "info",
        deps.tServerForRoom(room, "info.hostReturnedTransferCanceled", {
          hostName: player.name,
        })
      )
    );
  }
  player.ws = ws;
  player.connected = true;
  player.needsFullState = true;
  player.needsFullGameView = true;

  room.players.set(player.playerId, player);
  room.playersByToken.set(player.token, player.playerId);
  if (player.tabId) {
    room.playersByTabId.set(player.tabId, player.playerId);
  }
  if (player.sessionId) {
    room.playersBySessionId.set(player.sessionId, player.playerId);
  }
  if (isNew && !room.joinOrder.includes(player.playerId)) {
    room.joinOrder.push(player.playerId);
  }
  if (!room.hostId) {
    room.hostId = player.playerId;
  }
  if (!room.controlId) {
    room.controlId = player.playerId;
  }

  connectionInfo.set(ws, { roomCode: room.code, playerId: player.playerId });
  deps.send(ws, { type: "helloAck", payload: { playerId: player.playerId, playerToken: player.token } });

  if (existing && wasDisconnected) {
    deps.broadcastEvent(
      room,
      deps.buildSystemEvent(
        room,
        "playerReconnected",
        deps.tServerForRoom(room, "info.playerReconnected", {
          playerName: player.name,
        })
      )
    );
  }

  return player;
}
