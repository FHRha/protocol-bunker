import type { WebSocket } from "ws";
import type {
  GameSettings,
  GameRuleset,
  OverlayOverrides,
  PlayerStatus,
  Role,
  RoomState,
  ScenarioContext,
  ScenarioMeta,
  ScenarioModule,
  ScenarioSession,
  WorldState30,
} from "@bunker/shared";

export type PlayerReconnectToken = string;
export type OverlayViewToken = string;
export type OverlayControlToken = string;
export type OverlayControlInviteToken = string;
export type SpectatorToken = string;
export type IdentityMode = "prod" | "dev_tab";

export interface SpectatorInvite {
  maxUses: number;
  remainingUses: number;
  issuedAt: number;
  expiresAt: number;
}

export interface Player {
  playerId: string;
  name: string;
  token: PlayerReconnectToken;
  tabId?: string;
  sessionId?: string;
  ws?: WebSocket;
  connected: boolean;
  disconnectedAt?: number;
  totalAbsentMs?: number;
  scenarioStatus?: PlayerStatus;
  eliminatedAt?: number;
  leftBunker?: boolean;
  kickedAt?: number;
  disconnectTimer?: ReturnType<typeof setTimeout>;
  disconnectTicker?: ReturnType<typeof setInterval>;
  disconnectNotifiedMinutes?: number;
  needsFullState?: boolean;
  needsFullGameView?: boolean;
}

export interface Room {
  code: string;
  hostId: string;
  controlId: string;
  createdAt: number;
  phase: "lobby" | "game";
  scenarioId: string;
  scenarioMeta: ScenarioMeta;
  scenarioModule: ScenarioModule;
  settings: GameSettings;
  disasterOptions: Array<{ id: string; title: string }>;
  ruleset: GameRuleset;
  rulesOverriddenByHost: boolean;
  rulesPresetCount?: number;
  world?: WorldState30;
  isDev?: boolean;
  players: Map<string, Player>;
  playersByToken: Map<string, string>;
  playersByTabId: Map<string, string>;
  playersBySessionId: Map<string, string>;
  joinOrder: string[];
  hostTransferTimer?: ReturnType<typeof setTimeout>;
  session?: ScenarioSession;
  sessionContext?: ScenarioContext;
  sessionPlayerIds?: Set<string>;
  lastRoomState?: RoomState;
  lastGameViews?: Map<string, ReturnType<ScenarioSession["getGameView"]>>;
  overlayToken: OverlayViewToken;
  spectatorToken: SpectatorToken;
  overlayEditToken: OverlayControlToken;
  overlayTokenIssuedAt: number;
  overlayEditTokenIssuedAt: number;
  overlayControlInviteToken: OverlayControlInviteToken;
  overlayControlInviteIssuedAt: number;
  spectatorInvites: Map<string, SpectatorInvite>;
  overlayOverrides?: OverlayOverrides;
}

export interface ConnectionInfo {
  roomCode: string;
  playerId: string;
}

export interface OverlaySubscription {
  roomCode: string;
  role: Role;
}
