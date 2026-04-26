import { tServer, type ServerLocaleCode } from "../locales/serverLocale.js";
import type { Room } from "../core/types.js";
import type { ServerMessage } from "@bunker/shared";
import type { WebSocket } from "ws";

export interface MessagePresenterDeps {
  send: (ws: WebSocket, message: ServerMessage) => void;
  normalizeServerLocale: (value: unknown) => ServerLocaleCode;
  connectionInfo: WeakMap<WebSocket, { roomCode: string; playerId: string }>;
  rooms: Map<string, Room>;
}

export function getSocketLocale(ws: WebSocket, deps: MessagePresenterDeps, room?: Room): ServerLocaleCode {
  const info = deps.connectionInfo.get(ws);
  const resolvedRoom = room ?? (info ? deps.rooms.get(info.roomCode) : undefined);
  const player = info && resolvedRoom ? resolvedRoom.players.get(info.playerId) : undefined;
  return deps.normalizeServerLocale(player?.locale);
}

export function tServerForRoom(
  deps: Pick<MessagePresenterDeps, "normalizeServerLocale">,
  room: Room | undefined,
  key: string,
  vars?: Record<string, unknown>
): string {
  const host = room ? room.players.get(room.hostId) : undefined;
  const locale = deps.normalizeServerLocale(host?.locale);
  return tServer(locale, key, vars);
}

export function sendLocalizedError(
  ws: WebSocket,
  deps: MessagePresenterDeps,
  options: {
    key: string;
    room?: Room;
    code?: string;
    vars?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  }
): void {
  const locale = getSocketLocale(ws, deps, options.room);
  deps.send(ws, {
    type: "error",
    payload: {
      ...(options.extra ?? {}),
      ...(options.code ? { code: options.code } : {}),
      message: tServer(locale, options.key, options.vars),
    },
  });
}

export function sendReconnectForbidden(
  ws: WebSocket,
  deps: MessagePresenterDeps,
  room?: Room
): void {
  sendLocalizedError(ws, deps, {
    key: "error.reconnectForbidden",
    room,
    code: "RECONNECT_FORBIDDEN",
  });
}
