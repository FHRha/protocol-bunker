import type { AssetCatalog, GameSettings, GameView, RoomState, ScenarioModule } from "@bunker/shared";
import type { WebSocket } from "ws";
import type { GameActionDeps } from "../actions/game.js";
import type { LobbyActionDeps } from "../actions/lobby.js";
import type { IdentityMode, Player, Room } from "../core/types.js";
import type { SessionHandlerDeps } from "./handlers/session.js";
import type { ClientMessageRouterDeps } from "./router.js";
import type { HandleSocketCloseOptions } from "./transport.js";

interface CreateWsContextsOptions {
  identityMode: IdentityMode;
  devLogs: boolean;
  devScenariosEnabled: boolean;
  reconnectGraceAfterKickMs: number;
  disconnectGraceMs: number;
  minClassicPlayers: number;
  maxClassicPlayers: number;
  classicScenarioId: string;
  defaultSettings: GameSettings;
  assets: AssetCatalog;
  scenarioMap: Map<string, ScenarioModule>;
  rooms: Map<string, Room>;
  connectionInfo: WeakMap<WebSocket, { roomCode: string; playerId: string }>;
  overlaySubscriptions: Map<WebSocket, { roomCode: string; role: string }>;
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
  sendReconnectForbidden: (ws: WebSocket, room?: Room) => void;
  send: (ws: WebSocket, message: import("@bunker/shared").ServerMessage) => void;
  devLog: (...args: unknown[]) => void;
  logProtocol: (event: string, details: Record<string, unknown>) => void;
  logRoomLifecycle: (event: string, roomCode: string, details: Record<string, unknown>) => void;
  createLobbyRoom: SessionHandlerDeps["createLobbyRoom"];
  buildAutoRuleset: LobbyActionDeps["buildAutoRuleset"];
  generateRoomCode: () => string;
  buildDisasterOptions: SessionHandlerDeps["buildDisasterOptions"];
  normalizeCardLocale: SessionHandlerDeps["normalizeCardLocale"];
  generateOverlayViewToken: () => string;
  generateSpectatorToken: () => string;
  generateOverlayControlToken: () => string;
  generateOverlayControlInviteToken: () => string;
  attachPlayer: SessionHandlerDeps["attachPlayer"];
  printOverlayInfo: SessionHandlerDeps["printOverlayInfo"];
  updateRulesetIfAuto: (room: Room) => void;
  broadcastRoomState: (room: Room) => void;
  broadcastGameViews: (room: Room) => void;
  sendGameView: (room: Room, player: Player) => void;
  buildRoomState: (room: Room, locale: import("@bunker/shared").CardLocale) => RoomState;
  localizeGameViewForLocale: (
    view: GameView,
    locale: import("@bunker/shared").CardLocale,
    scenarioId: string
  ) => GameView;
  getPlayerCardLocale: (player?: Player) => import("@bunker/shared").CardLocale;
  findPlayerByTabId: (room: Room, tabId?: string) => Player | undefined;
  findPlayerByToken: (room: Room, token?: string) => Player | undefined;
  findPlayerBySessionId: (room: Room, sessionId?: string) => Player | undefined;
  getScenarioStatus: (room: Room, playerId: string) => string | undefined;
  computeKickRemainingMs: (player: Player, now?: number) => number;
  markPlayerLeftBunker: (room: Room, player: Player) => void;
  getEffectiveMaxPlayers: (room: Room) => number;
  getRoleForToken: (room: Room, token: string) => import("@bunker/shared").Role | null;
  getRoleForPlayer: LobbyActionDeps["getRoleForPlayer"];
  canControl: LobbyActionDeps["canControl"];
  canPlayerAction: LobbyActionDeps["canPlayerAction"];
  sendOverlayState: SessionHandlerDeps["sendOverlayState"];
  tServerForRoom: (room: Room | undefined, key: string, vars?: Record<string, unknown>) => string;
  startGameAsControl: LobbyActionDeps["startGameAsControl"];
  isClassicRoom: LobbyActionDeps["isClassicRoom"];
  clampInt: LobbyActionDeps["clampInt"];
  normalizeForcedDisasterId: LobbyActionDeps["normalizeForcedDisasterId"];
  normalizeManualConfig: LobbyActionDeps["normalizeManualConfig"];
  seedManualConfigFromPreset: LobbyActionDeps["seedManualConfigFromPreset"];
  buildManualRuleset: LobbyActionDeps["buildManualRuleset"];
  pickNextHost: LobbyActionDeps["pickNextHost"];
  transferHost: LobbyActionDeps["transferHost"];
  removeLobbyPlayer: (room: Room, playerId: string) => boolean;
  syncLobbyBotPlayers: LobbyActionDeps["syncLobbyBotPlayers"];
  validateAiAccessKey: LobbyActionDeps["validateAiAccessKey"];
  isAiGatewayConfigured: LobbyActionDeps["isAiGatewayConfigured"];
  resolveControlActorId: GameActionDeps["resolveControlActorId"];
  getCurrentTurnPlayerId: GameActionDeps["getCurrentTurnPlayerId"];
  localizeScenarioMessageForPlayer: GameActionDeps["localizeScenarioMessageForPlayer"];
  scheduleRuleBasedBots: GameActionDeps["scheduleRuleBasedBots"];
  broadcastEvent: HandleSocketCloseOptions["broadcastEvent"];
  buildSystemEvent: HandleSocketCloseOptions["buildSystemEvent"];
  formatRemaining: HandleSocketCloseOptions["formatRemaining"];
  unrefTimer: HandleSocketCloseOptions["unrefTimer"];
  scheduleHostTransfer: HandleSocketCloseOptions["scheduleHostTransfer"];
}

export function createWsContexts(options: CreateWsContextsOptions): {
  sessionHandlerDeps: SessionHandlerDeps;
  lobbyActionDeps: LobbyActionDeps;
  gameActionDeps: GameActionDeps;
  socketCloseDeps: HandleSocketCloseOptions;
  routerDeps: ClientMessageRouterDeps;
} {
  const sessionHandlerDeps: SessionHandlerDeps = {
    identityMode: options.identityMode,
    devLogs: options.devLogs,
    devScenariosEnabled: options.devScenariosEnabled,
    reconnectGraceAfterKickMs: options.reconnectGraceAfterKickMs,
    disconnectGraceMs: options.disconnectGraceMs,
    minClassicPlayers: options.minClassicPlayers,
    defaultSettings: options.defaultSettings,
    assets: options.assets,
    scenarioMap: options.scenarioMap,
    rooms: options.rooms,
    connectionInfo: options.connectionInfo,
    overlaySubscriptions: options.overlaySubscriptions,
    sendLocalizedError: options.sendLocalizedError,
    sendReconnectForbidden: options.sendReconnectForbidden,
    send: options.send,
    devLog: options.devLog,
    logProtocol: options.logProtocol,
    logRoomLifecycle: options.logRoomLifecycle,
    createLobbyRoom: options.createLobbyRoom,
    buildAutoRuleset: options.buildAutoRuleset,
    generateRoomCode: options.generateRoomCode,
    buildDisasterOptions: options.buildDisasterOptions,
    normalizeCardLocale: options.normalizeCardLocale,
    generateOverlayViewToken: options.generateOverlayViewToken,
    generateSpectatorToken: options.generateSpectatorToken,
    generateOverlayControlToken: options.generateOverlayControlToken,
    generateOverlayControlInviteToken: options.generateOverlayControlInviteToken,
    attachPlayer: options.attachPlayer,
    printOverlayInfo: options.printOverlayInfo,
    updateRulesetIfAuto: options.updateRulesetIfAuto,
    broadcastRoomState: options.broadcastRoomState,
    broadcastGameViews: options.broadcastGameViews,
    sendGameView: options.sendGameView,
    buildRoomState: options.buildRoomState,
    localizeGameViewForLocale: options.localizeGameViewForLocale,
    getPlayerCardLocale: options.getPlayerCardLocale,
    findPlayerByTabId: options.findPlayerByTabId,
    findPlayerByToken: options.findPlayerByToken,
    findPlayerBySessionId: options.findPlayerBySessionId,
    getScenarioStatus: options.getScenarioStatus,
    computeKickRemainingMs: options.computeKickRemainingMs,
    markPlayerLeftBunker: options.markPlayerLeftBunker,
    removeLobbyPlayer: options.removeLobbyPlayer,
    getEffectiveMaxPlayers: options.getEffectiveMaxPlayers,
    getRoleForToken: options.getRoleForToken,
    canControl: options.canControl,
    sendOverlayState: options.sendOverlayState,
    tServerForRoom: options.tServerForRoom,
  };

  const lobbyActionDeps: LobbyActionDeps = {
    connectionInfo: options.connectionInfo,
    rooms: options.rooms,
    send: options.send,
    sendLocalizedError: options.sendLocalizedError,
    getRoleForPlayer: options.getRoleForPlayer,
    canControl: options.canControl,
    canPlayerAction: options.canPlayerAction,
    startGameAsControl: options.startGameAsControl,
    normalizeCardLocale: options.normalizeCardLocale,
    broadcastRoomState: options.broadcastRoomState,
    broadcastGameViews: options.broadcastGameViews,
    isClassicRoom: options.isClassicRoom,
    clampInt: options.clampInt,
    minClassicPlayers: options.minClassicPlayers,
    maxClassicPlayers: options.maxClassicPlayers,
    normalizeForcedDisasterId: options.normalizeForcedDisasterId,
    normalizeManualConfig: options.normalizeManualConfig,
    seedManualConfigFromPreset: options.seedManualConfigFromPreset,
    buildManualRuleset: options.buildManualRuleset,
    buildAutoRuleset: options.buildAutoRuleset,
    pickNextHost: options.pickNextHost,
    transferHost: options.transferHost,
    removeLobbyPlayer: options.removeLobbyPlayer,
    syncLobbyBotPlayers: options.syncLobbyBotPlayers,
    validateAiAccessKey: options.validateAiAccessKey,
    isAiGatewayConfigured: options.isAiGatewayConfigured,
    devLog: options.devLog,
  };

  const gameActionDeps: GameActionDeps = {
    connectionInfo: options.connectionInfo,
    rooms: options.rooms,
    send: options.send,
    sendLocalizedError: options.sendLocalizedError,
    getRoleForPlayer: options.getRoleForPlayer,
    canControl: options.canControl,
    canPlayerAction: options.canPlayerAction,
    resolveControlActorId: options.resolveControlActorId,
    getCurrentTurnPlayerId: options.getCurrentTurnPlayerId,
    localizeScenarioMessageForPlayer: options.localizeScenarioMessageForPlayer,
    scheduleRuleBasedBots: options.scheduleRuleBasedBots,
    broadcastGameViews: options.broadcastGameViews,
    devScenariosEnabled: options.devScenariosEnabled,
    identityMode: options.identityMode,
    classicScenarioId: options.classicScenarioId,
  };

  const socketCloseDeps: HandleSocketCloseOptions = {
    overlaySubscriptions: options.overlaySubscriptions,
    connectionInfo: options.connectionInfo,
    rooms: options.rooms,
    getScenarioStatus: options.getScenarioStatus,
    computeKickRemainingMs: options.computeKickRemainingMs,
    broadcastEvent: options.broadcastEvent,
    buildSystemEvent: options.buildSystemEvent,
    tServerForRoom: options.tServerForRoom,
    formatRemaining: options.formatRemaining,
    markPlayerLeftBunker: options.markPlayerLeftBunker,
    unrefTimer: options.unrefTimer,
    scheduleHostTransfer: options.scheduleHostTransfer,
    logRoomLifecycle: options.logRoomLifecycle,
    broadcastRoomState: options.broadcastRoomState,
    broadcastGameViews: options.broadcastGameViews,
    removeLobbyPlayer: options.removeLobbyPlayer,
    devLog: options.devLog,
  };

  return {
    sessionHandlerDeps,
    lobbyActionDeps,
    gameActionDeps,
    socketCloseDeps,
    routerDeps: {
      session: sessionHandlerDeps,
      lobby: lobbyActionDeps,
      game: gameActionDeps,
      send: options.send,
      sendLocalizedError: options.sendLocalizedError,
    },
  };
}
