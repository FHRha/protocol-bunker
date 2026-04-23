import type { GameEvent } from "@bunker/shared";
import type { Player, Room } from "../core/types.js";
import { rooms } from "../core/serverState.js";

interface TransferHostDeps {
  pickNextHost: (room: Room, excludeId?: string) => string | undefined;
  broadcastRoomState: (room: Room) => void;
  broadcastEvent: (room: Room, event: GameEvent) => void;
  buildSystemEvent: (room: Room, kind: GameEvent["kind"], message: string) => GameEvent;
  tServerForRoom: (room: Room | undefined, key: string, vars?: Record<string, unknown>) => string;
  sendHostChanged: (
    player: Player,
    nextHostId: string,
    reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual"
  ) => void;
}

interface ScheduleHostTransferDeps extends TransferHostDeps {
  hostGraceMs: number;
  unrefTimer: (timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | undefined) => void;
}

interface MarkPlayerLeftBunkerDeps extends TransferHostDeps {
  broadcastGameViews: (room: Room) => void;
}

export function computeKickRemainingMs(player: Player, disconnectGraceMs: number, now = Date.now()): number {
  const currentOfflineMs = player.disconnectedAt ? now - player.disconnectedAt : 0;
  return Math.max(0, disconnectGraceMs - currentOfflineMs);
}

export function findPlayerByToken(room: Room, token?: string): Player | undefined {
  if (!token) return undefined;
  const playerId = room.playersByToken.get(token);
  return playerId ? room.players.get(playerId) : undefined;
}

export function findPlayerByTabId(room: Room, tabId?: string): Player | undefined {
  if (!tabId) return undefined;
  const playerId = room.playersByTabId.get(tabId);
  return playerId ? room.players.get(playerId) : undefined;
}

export function findPlayerBySessionId(room: Room, sessionId?: string): Player | undefined {
  if (!sessionId) return undefined;
  const playerId = room.playersBySessionId.get(sessionId);
  return playerId ? room.players.get(playerId) : undefined;
}

export function transferHost(
  room: Room,
  reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual",
  deps: TransferHostDeps,
  excludeId?: string,
  preferredHostId?: string
): void {
  if (room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
  }
  const preferredId = String(preferredHostId ?? "").trim();
  const nextHostId =
    preferredId && preferredId !== excludeId && room.players.has(preferredId)
      ? preferredId
      : deps.pickNextHost(room, excludeId);
  if (!nextHostId) {
    if (room.players.size === 0) {
      rooms.delete(room.code);
    }
    return;
  }
  if (room.hostId === nextHostId) return;
  room.hostId = nextHostId;
  if (room.sessionContext) {
    room.sessionContext.hostId = nextHostId;
  }
  deps.broadcastRoomState(room);
  const hostName = room.players.get(nextHostId)?.name ?? deps.tServerForRoom(room, "info.playerFallbackName");
  deps.broadcastEvent(
    room,
    deps.buildSystemEvent(
      room,
      "info",
      deps.tServerForRoom(room, "info.hostTransferred", {
        hostName,
      })
    )
  );
  for (const player of room.players.values()) {
    if (player.ws) {
      deps.sendHostChanged(player, nextHostId, reason);
    }
  }
}

export function scheduleHostTransfer(
  room: Room,
  reason: "disconnect_timeout" | "left_bunker" | "eliminated",
  deps: ScheduleHostTransferDeps
): void {
  const candidate = deps.pickNextHost(room, room.hostId);
  if (!candidate) {
    return;
  }
  if (room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
  }
  const hostPlayer = room.players.get(room.hostId);
  if (hostPlayer) {
    deps.broadcastEvent(
      room,
      deps.buildSystemEvent(
        room,
        "info",
        deps.tServerForRoom(room, "info.hostDisconnectedTransferIn", {
          hostName: hostPlayer.name,
          seconds: String(Math.floor(deps.hostGraceMs / 1000)),
        })
      )
    );
  }
  room.hostTransferTimer = setTimeout(() => {
    room.hostTransferTimer = undefined;
    transferHost(room, reason, deps, room.hostId);
  }, deps.hostGraceMs);
  deps.unrefTimer(room.hostTransferTimer);
}

export function markPlayerLeftBunker(room: Room, player: Player, deps: MarkPlayerLeftBunkerDeps) {
  if (player.leftBunker) return;
  if (player.connected) return;
  player.leftBunker = true;
  if (!player.kickedAt) {
    player.kickedAt = Date.now();
  }
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }
  if (player.disconnectTicker) {
    clearInterval(player.disconnectTicker);
    player.disconnectTicker = undefined;
  }
  if (room.hostTransferTimer && room.hostId === player.playerId) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
  }
  const systemActorId =
    room.hostId && room.players.has(room.hostId)
      ? room.hostId
      : Array.from(room.players.keys())[0];
  let didBroadcastGameViews = false;
  if (room.session && systemActorId) {
    const result = room.session.handleAction(systemActorId, {
      type: "markLeftBunker",
      payload: { targetPlayerId: player.playerId },
    });
    if (result.stateChanged) {
      deps.broadcastGameViews(room);
      didBroadcastGameViews = true;
    }
  }
  deps.broadcastRoomState(room);
  if (!didBroadcastGameViews) {
    deps.broadcastGameViews(room);
  }
  deps.broadcastEvent(
    room,
    deps.buildSystemEvent(
      room,
      "playerLeftBunker",
      deps.tServerForRoom(room, "info.playerLeftBunker", {
        playerName: player.name,
      })
    )
  );
}
