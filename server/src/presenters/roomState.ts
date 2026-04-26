import type { RoomState } from "@bunker/shared";
import type { Room } from "../core/types.js";

export interface RoomStateProjectionDeps {
  disconnectGraceMs: number;
  localizeWorldStateForLocale: (
    world: import("@bunker/shared").WorldState30 | undefined,
    locale: import("@bunker/shared").CardLocale
  ) => import("@bunker/shared").WorldState30 | undefined;
  localizeDisasterOptionsForLocale: (
    options: Array<{ id: string; title: string }>,
    locale: import("@bunker/shared").CardLocale
  ) => Array<{ id: string; title: string }>;
}

export function buildRoomState(
  room: Room,
  locale: import("@bunker/shared").CardLocale,
  deps: RoomStateProjectionDeps
): RoomState {
  return {
    roomCode: room.code,
    players: Array.from(room.players.values()).map((player) => ({
      playerId: player.playerId,
      name: player.name,
      connected: player.connected,
      disconnectedAt: player.disconnectedAt,
      totalAbsentMs: player.totalAbsentMs ?? 0,
      currentOfflineMs: !player.connected && player.disconnectedAt ? Date.now() - player.disconnectedAt : 0,
      kickRemainingMs: Math.max(
        0,
        deps.disconnectGraceMs - (!player.connected && player.disconnectedAt ? Date.now() - player.disconnectedAt : 0)
      ),
      leftBunker: player.leftBunker,
    })),
    hostId: room.hostId,
    controlId: room.controlId,
    phase: room.phase,
    scenarioMeta: room.scenarioMeta,
    settings: room.settings,
    ruleset: room.ruleset,
    rulesOverriddenByHost: room.rulesOverriddenByHost,
    rulesPresetCount: room.rulesPresetCount,
    world: deps.localizeWorldStateForLocale(room.world, locale),
    isDev: room.isDev,
    disasterOptions: deps.localizeDisasterOptionsForLocale(room.disasterOptions, locale),
  };
}
