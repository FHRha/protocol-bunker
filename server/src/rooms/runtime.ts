import type { ScenarioSession } from "@bunker/shared";
import type { Room } from "../core/types.js";
import { cleanupInactiveRooms as cleanupInactiveRoomsState } from "./lifecycle.js";

export function getCachedGameView(room: Room): ReturnType<ScenarioSession["getGameView"]> | undefined {
  if (!room.lastGameViews || room.lastGameViews.size === 0) return undefined;
  return room.lastGameViews.values().next().value as ReturnType<ScenarioSession["getGameView"]> | undefined;
}

export function getRoomGamePhase(room: Room): string | undefined {
  const cached = getCachedGameView(room);
  if (cached?.phase) return cached.phase;
  if (!room.session) return undefined;
  const anchorId = room.players.has(room.hostId)
    ? room.hostId
    : room.joinOrder.find((id) => room.players.has(id));
  if (!anchorId) return undefined;
  try {
    return room.session.getGameView(anchorId).phase;
  } catch {
    return undefined;
  }
}

export function hasOverlaySubscribers(
  overlaySubscriptions: Map<unknown, { roomCode: string; role: string }>,
  roomCode: string
): boolean {
  for (const sub of overlaySubscriptions.values()) {
    if (sub.roomCode === roomCode) return true;
  }
  return false;
}

export function createCleanupInactiveRooms(options: {
  overlaySubscriptions: Map<unknown, { roomCode: string; role: string }>;
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  roomEndedTtlMs: number;
  roomInactiveTtlMs: number;
}): () => void {
  return () =>
    cleanupInactiveRoomsState({
      getRoomGamePhase,
      hasOverlaySubscribers: (roomCode) => hasOverlaySubscribers(options.overlaySubscriptions, roomCode),
      logRoomLifecycle: options.logRoomLifecycle,
      roomEndedTtlMs: options.roomEndedTtlMs,
      roomInactiveTtlMs: options.roomInactiveTtlMs,
    });
}
