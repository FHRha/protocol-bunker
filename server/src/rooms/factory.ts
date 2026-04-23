import type { AssetCatalog, GameRuleset, GameSettings, ScenarioModule } from "@bunker/shared";
import type { IdentityMode, Room } from "../core/types.js";

interface CreateLobbyRoomOptions {
  scenarioModule: ScenarioModule;
  assets: AssetCatalog;
  defaultSettings: GameSettings;
  locale: unknown;
  identityMode: IdentityMode;
  buildAutoRuleset: (playerCount: number) => GameRuleset;
  minClassicPlayers: number;
  generateRoomCode: () => string;
  buildDisasterOptions: (assets: AssetCatalog) => Array<{ id: string; title: string }>;
  normalizeCardLocale: (value: unknown) => GameSettings["cardLocale"];
  generateOverlayViewToken: () => string;
  generateSpectatorToken: () => string;
  generateOverlayControlToken: () => string;
  generateOverlayControlInviteToken: () => string;
}

export function createLobbyRoom(options: CreateLobbyRoomOptions): Room {
  const roomCreatedAt = Date.now();
  const initialRuleset = options.buildAutoRuleset(options.minClassicPlayers);

  return {
    code: options.generateRoomCode(),
    hostId: "",
    controlId: "",
    createdAt: roomCreatedAt,
    phase: "lobby",
    scenarioId: options.scenarioModule.meta.id,
    scenarioMeta: options.scenarioModule.meta,
    scenarioModule: options.scenarioModule,
    settings: {
      ...options.defaultSettings,
      cardLocale: options.normalizeCardLocale(options.locale),
    },
    disasterOptions: options.buildDisasterOptions(options.assets),
    ruleset: initialRuleset,
    rulesOverriddenByHost: false,
    rulesPresetCount: undefined,
    isDev: options.identityMode === "dev_tab",
    players: new Map(),
    playersByToken: new Map(),
    playersByTabId: new Map(),
    playersBySessionId: new Map(),
    joinOrder: [],
    lastGameViews: new Map(),
    roomStateRevision: 0,
    gameViewRevisions: new Map(),
    overlayToken: options.generateOverlayViewToken(),
    spectatorToken: options.generateSpectatorToken(),
    overlayEditToken: options.generateOverlayControlToken(),
    overlayTokenIssuedAt: roomCreatedAt,
    overlayEditTokenIssuedAt: roomCreatedAt,
    overlayControlInviteToken: options.generateOverlayControlInviteToken(),
    overlayControlInviteIssuedAt: roomCreatedAt,
    spectatorInvites: new Map(),
    overlayOverrides: {},
  };
}
