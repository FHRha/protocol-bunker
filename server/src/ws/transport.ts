import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { ClientMessageSchema, type ClientMessage, type GameEvent } from "@bunker/shared";
import type { Player, Room } from "../core/types.js";

interface ValidateWsOriginOptions {
  enforceOriginChecks: boolean;
  getUpgradeRequestOrigin: (req: IncomingMessage) => string | null;
  isOriginAllowed: (
    originHeader: string | undefined,
    requestOrigin: string | null,
    options: { allowMissingOrigin: boolean }
  ) => boolean;
  normalizeOrigin: (value: string | undefined) => string | null;
}

interface ParseIncomingClientMessageOptions {
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
  logProtocol: (event: string, details: Record<string, unknown>) => void;
}

export interface HandleSocketCloseOptions {
  overlaySubscriptions: Map<WebSocket, { roomCode: string; role: string }>;
  connectionInfo: WeakMap<WebSocket, { roomCode: string; playerId: string }>;
  rooms: Map<string, Room>;
  getScenarioStatus: (room: Room, playerId: string) => string | undefined;
  computeKickRemainingMs: (player: Player, now?: number) => number;
  broadcastEvent: (room: Room, event: GameEvent) => void;
  buildSystemEvent: (room: Room, kind: GameEvent["kind"], message: string) => GameEvent;
  tServerForRoom: (room: Room | undefined, key: string, vars?: Record<string, unknown>) => string;
  formatRemaining: (ms: number) => string;
  markPlayerLeftBunker: (room: Room, player: Player) => void;
  unrefTimer: (timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | undefined) => void;
  scheduleHostTransfer: (room: Room, reason: "disconnect_timeout" | "left_bunker" | "eliminated") => void;
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  broadcastRoomState: (room: Room) => void;
  broadcastGameViews: (room: Room) => void;
  removeLobbyPlayer: (room: Room, playerId: string) => boolean;
  devLog: (...args: unknown[]) => void;
}

export function validateWsOrigin(
  ws: WebSocket,
  request: IncomingMessage,
  options: ValidateWsOriginOptions
): boolean {
  if (!options.enforceOriginChecks) {
    return true;
  }

  const originHeaderRaw = request.headers.origin;
  const originHeader = Array.isArray(originHeaderRaw) ? originHeaderRaw[0] : originHeaderRaw;
  const requestOrigin = options.getUpgradeRequestOrigin(request);
  const allowed = options.isOriginAllowed(originHeader, requestOrigin, { allowMissingOrigin: false });
  if (allowed) {
    return true;
  }

  const normalizedOrigin = options.normalizeOrigin(originHeader);
  console.warn(
    `[security] websocket origin rejected origin=${normalizedOrigin ?? "<missing>"} expected=${requestOrigin ?? "<unknown>"}`
  );
  try {
    ws.close(1008, "Forbidden origin");
  } catch {
    ws.terminate();
  }
  return false;
}

export function parseIncomingClientMessage(
  ws: WebSocket,
  data: unknown,
  options: ParseIncomingClientMessageOptions
): ClientMessage | null {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(String(data));
  } catch {
    options.sendLocalizedError(ws, {
      key: "error.invalidJson",
    });
    return null;
  }

  const parsed = ClientMessageSchema.safeParse(parsedJson);
  if (!parsed.success) {
    options.sendLocalizedError(ws, {
      key: "error.invalidMessageFormat",
    });
    return null;
  }

  const message = parsed.data as ClientMessage;
  options.logProtocol("message", { type: message.type });
  return message;
}

export function handleSocketClose(ws: WebSocket, options: HandleSocketCloseOptions): void {
  options.overlaySubscriptions.delete(ws);
  const info = options.connectionInfo.get(ws);
  if (!info) return;
  const room = options.rooms.get(info.roomCode);
  if (!room) return;
  const player = room.players.get(info.playerId);
  if (!player) return;
  if (player.ws && player.ws !== ws) {
    return;
  }
  options.connectionInfo.delete(ws);

  if (room.phase === "lobby") {
    options.removeLobbyPlayer(room, player.playerId);
    options.devLog("lobby disconnect", {
      room: room.code,
      playerId: player.playerId,
      remaining: room.players.size,
    });
    if (options.rooms.has(room.code)) {
      options.broadcastRoomState(room);
    }
    return;
  }

  const status = room.phase === "game" ? options.getScenarioStatus(room, player.playerId) : undefined;
  const isEliminated = status === "eliminated";
  player.connected = false;
  player.ws = undefined;

  if (!player.leftBunker) {
    if (!player.disconnectedAt) {
      player.disconnectedAt = Date.now();
      if (!isEliminated) {
        const remainingMs = options.computeKickRemainingMs(player);
        options.broadcastEvent(
          room,
          options.buildSystemEvent(
            room,
            "playerDisconnected",
            options.tServerForRoom(room, "info.playerDisconnectedGrace", {
              playerName: player.name,
              remaining: options.formatRemaining(remainingMs),
            })
          )
        );
      }
    }
    if (!isEliminated) {
      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
      }
      const remainingMs = options.computeKickRemainingMs(player);
      if (remainingMs <= 0) {
        options.markPlayerLeftBunker(room, player);
      } else {
        player.disconnectTimer = setTimeout(() => {
          options.markPlayerLeftBunker(room, player);
        }, remainingMs);
        options.unrefTimer(player.disconnectTimer);
      }
      if (player.disconnectTicker) {
        clearInterval(player.disconnectTicker);
      }
      player.disconnectTicker = setInterval(() => {
        if (player.connected || player.leftBunker || !player.disconnectedAt) {
          if (player.disconnectTicker) {
            clearInterval(player.disconnectTicker);
            player.disconnectTicker = undefined;
          }
          return;
        }
        const remainingMsTick = options.computeKickRemainingMs(player);
        if (remainingMsTick <= 0) {
          options.markPlayerLeftBunker(room, player);
          return;
        }
        const remainingMinutes = Math.floor(remainingMsTick / 60000);
        if (player.disconnectNotifiedMinutes === remainingMinutes) return;
        player.disconnectNotifiedMinutes = remainingMinutes;
        options.broadcastEvent(
          room,
          options.buildSystemEvent(
            room,
            "playerDisconnected",
            options.tServerForRoom(room, "info.playerMissingGrace", {
              playerName: player.name,
              remaining: options.formatRemaining(remainingMsTick),
            })
          )
        );
      }, 60000);
      options.unrefTimer(player.disconnectTicker);
    }
  }

  if (room.phase === "game" && room.hostId === player.playerId) {
    options.scheduleHostTransfer(room, "disconnect_timeout");
  }
  options.logRoomLifecycle("disconnected", room.code, {
    player: player.name,
    phase: room.phase,
    connected: player.connected,
  });
  options.broadcastRoomState(room);
  if (room.phase === "game") {
    options.broadcastGameViews(room);
  }
}
