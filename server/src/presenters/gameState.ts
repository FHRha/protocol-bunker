import type { GameView, OverlayState, PlayerStatus, Role, RoomState, ServerMessage } from "@bunker/shared";
import type { WebSocket } from "ws";
import type { Player, Room } from "../core/types.js";

export interface GameStatePresenterDeps {
  disconnectGraceMs: number;
  overlaySubscriptions: Map<WebSocket, { roomCode: string; role: string }>;
  send: (ws: WebSocket, message: ServerMessage) => void;
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
  canControl: (role: Role) => boolean;
  getOverlayState: (room: Room) => Promise<OverlayState | null>;
  buildOverlayPresenterState: (room: Room) => unknown;
  buildRoomState: (room: Room, locale: import("@bunker/shared").CardLocale) => RoomState;
  diffTopLevel: <T extends object>(previous: T | undefined, next: T) => Partial<T> | null;
  localizeGameViewForLocale: (
    view: GameView,
    locale: import("@bunker/shared").CardLocale,
    scenarioId: string
  ) => GameView;
  getPlayerCardLocale: (player?: Player) => import("@bunker/shared").CardLocale;
  devLog: (...args: unknown[]) => void;
}

export function syncScenarioStatuses(room: Room, players: Array<{ playerId: string; status: PlayerStatus }>): void {
  players.forEach((entry) => {
    const roomPlayer = room.players.get(entry.playerId);
    if (!roomPlayer) return;
    roomPlayer.scenarioStatus = entry.status;
    if (entry.status === "eliminated" && !roomPlayer.eliminatedAt) {
      roomPlayer.eliminatedAt = Date.now();
    }
  });
}

export async function sendOverlayState(
  room: Room,
  ws: WebSocket,
  deps: GameStatePresenterDeps,
  role: Role = "VIEW"
): Promise<void> {
  const state = await deps.getOverlayState(room);
  const presenter = deps.canControl(role) ? deps.buildOverlayPresenterState(room) : undefined;
  deps.send(ws, {
    type: "overlayState",
    payload: {
      ok: true,
      roomCode: room.code,
      state: state ?? undefined,
      presenter,
      presenterModeEnabled: Boolean(room.settings.enablePresenterMode),
      role,
    },
  });
}

export function broadcastOverlayState(room: Room, deps: GameStatePresenterDeps): void {
  for (const [ws, sub] of deps.overlaySubscriptions.entries()) {
    if (sub.roomCode !== room.code) continue;
    void sendOverlayState(room, ws, deps, sub.role as Role);
  }
}

export function broadcastRoomState(room: Room, deps: GameStatePresenterDeps): void {
  room.roomStateRevision += 1;
  for (const player of room.players.values()) {
    if (!player.ws) continue;
    const roomState = {
      ...deps.buildRoomState(room, deps.getPlayerCardLocale(player)),
      revision: room.roomStateRevision,
    };
    deps.send(player.ws, { type: "roomState", payload: roomState });
  }
  room.lastRoomState = undefined;
  for (const player of room.players.values()) {
    player.needsFullState = false;
  }
  broadcastOverlayState(room, deps);
}

export function sendGameView(room: Room, player: Player, deps: GameStatePresenterDeps): void {
  if (!room.session || !player.ws) return;
  if (room.sessionPlayerIds && !room.sessionPlayerIds.has(player.playerId)) {
    deps.devLog("gameView skip: player not in session", { room: room.code, playerId: player.playerId });
    deps.sendLocalizedError(player.ws, {
      key: "error.playerRestoreFailedRejoin",
      room,
      code: "PLAYER_RESTORE_FAILED",
    });
    return;
  }
  try {
    const view = room.session.getGameView(player.playerId);
    syncScenarioStatuses(room, view.public.players);
    const enrichedPlayers = view.public.players.map((entry) => {
      const roomPlayer = room.players.get(entry.playerId);
      const currentOfflineMs =
        roomPlayer && !roomPlayer.connected && roomPlayer.disconnectedAt
          ? Date.now() - roomPlayer.disconnectedAt
          : 0;
      return {
        ...entry,
        connected: roomPlayer?.connected ?? false,
        disconnectedAt: roomPlayer?.disconnectedAt,
        totalAbsentMs: roomPlayer?.totalAbsentMs ?? 0,
        currentOfflineMs,
        kickRemainingMs: Math.max(0, deps.disconnectGraceMs - currentOfflineMs),
        leftBunker: roomPlayer?.leftBunker ?? entry.status === "left_bunker",
      };
    });
    const nextRevision = (room.gameViewRevisions.get(player.playerId) ?? 0) + 1;
    room.gameViewRevisions.set(player.playerId, nextRevision);
    const payload = {
      ...view,
      revision: nextRevision,
      public: {
        ...view.public,
        players: enrichedPlayers,
      },
    };
    room.world = payload.world;
    const localizedPayload = deps.localizeGameViewForLocale(payload, deps.getPlayerCardLocale(player), room.scenarioId);
    if (!room.lastGameViews) {
      room.lastGameViews = new Map();
    }
    const lastView = room.lastGameViews.get(player.playerId);
    if (player.needsFullGameView || !lastView) {
      deps.send(player.ws, { type: "gameView", payload: localizedPayload });
      player.needsFullGameView = false;
    } else {
      const patch = deps.diffTopLevel(lastView, localizedPayload);
      if (patch) {
        deps.send(player.ws, {
          type: "statePatch",
          payload: { gameView: patch, gameViewRevision: nextRevision },
        });
      }
      player.needsFullGameView = false;
    }
    room.lastGameViews.set(player.playerId, localizedPayload);
    deps.devLog("gameView sent", { room: room.code, playerId: player.playerId });
  } catch (error) {
    console.error("[server] Scenario getGameView failed", error);
    deps.sendLocalizedError(player.ws, {
      key: "error.scenarioStateFailed",
      room,
    });
  }
}

export function broadcastGameViews(room: Room, deps: GameStatePresenterDeps): void {
  if (!room.session) return;
  for (const player of room.players.values()) {
    if (!player.ws) continue;
    try {
      sendGameView(room, player, deps);
    } catch (error) {
      console.error("[server] broadcast gameView failed", error);
    }
  }
  broadcastOverlayState(room, deps);
}
