import assert from "node:assert/strict";
import test from "node:test";

const { syncLobbyBotPlayers } = await import("../server/dist/rooms/lifecycle.js");
const { markPlayerLeftBunker } = await import("../server/dist/sessions/playerSession.js");

function createRoom(settingsPatch = {}) {
  const host = {
    playerId: "host",
    name: "Host",
    token: "host-token",
    connected: true,
    isBot: false,
  };
  return {
    code: "TEST",
    phase: "lobby",
    hostId: host.playerId,
    controlId: host.playerId,
    players: new Map([[host.playerId, host]]),
    playersByToken: new Map([[host.token, host.playerId]]),
    playersByTabId: new Map(),
    playersBySessionId: new Map(),
    joinOrder: [host.playerId],
    settings: {
      maxPlayers: 4,
      bots: {
        enabled: true,
        type: "rule_based",
        count: 0,
        aiLanguage: "ru",
      },
      ...settingsPatch,
    },
  };
}

function createDeps(room) {
  let tokenCounter = 0;
  return {
    getEffectiveMaxPlayers: () => room.settings.maxPlayers,
    logRoomLifecycle: () => {},
    tServerForRoom: (_room, key) => {
      const names = {
        "info.botNames.1": "Mira",
        "info.botNames.2": "Anton",
        "info.botNames.3": "Vera",
        "info.botDefaultName": "Bot",
      };
      return names[key] ?? key;
    },
    updateRulesetIfAuto: () => {},
    generatePlayerReconnectToken: () => {
      tokenCounter += 1;
      return `bot-token-${tokenCounter}`;
    },
    pickNextHost: () => "host",
  };
}

const getBots = (room) => Array.from(room.players.values()).filter((player) => player.isBot);

test("lobby bot sync adds bots up to requested count", () => {
  const room = createRoom({
    bots: { enabled: true, type: "rule_based", count: 3, aiLanguage: "ru" },
  });
  const result = syncLobbyBotPlayers(room, createDeps(room));

  assert.equal(result.added, 3);
  assert.equal(result.removed, 0);
  assert.equal(getBots(room).length, 3);
  assert.deepEqual(
    getBots(room).map((bot) => bot.name),
    ["Mira", "Anton", "Vera"]
  );
});

test("lobby bot sync removes excess bots when requested count decreases", () => {
  const room = createRoom({
    bots: { enabled: true, type: "rule_based", count: 3, aiLanguage: "ru" },
  });
  syncLobbyBotPlayers(room, createDeps(room));

  room.settings.bots = { ...room.settings.bots, count: 1 };
  const result = syncLobbyBotPlayers(room, createDeps(room));

  assert.equal(result.added, 0);
  assert.equal(result.removed, 2);
  assert.equal(getBots(room).length, 1);
});

test("lobby bot sync clamps additions by available player slots", () => {
  const room = createRoom({
    maxPlayers: 2,
    bots: { enabled: true, type: "rule_based", count: 3, aiLanguage: "ru" },
  });
  const result = syncLobbyBotPlayers(room, createDeps(room));

  assert.equal(result.added, 1);
  assert.equal(getBots(room).length, 1);
  assert.equal(room.players.size, 2);
});

test("lobby bot sync replaces bots when bot type changes", () => {
  const room = createRoom({
    bots: { enabled: true, type: "rule_based", count: 2, aiLanguage: "ru" },
  });
  syncLobbyBotPlayers(room, createDeps(room));

  room.settings.bots = { ...room.settings.bots, type: "ai" };
  const result = syncLobbyBotPlayers(room, createDeps(room));

  assert.equal(result.removed, 2);
  assert.equal(result.added, 2);
  assert.equal(getBots(room).length, 2);
  assert.ok(getBots(room).every((bot) => bot.botType === "ai"));
});

test("disconnected player takeover uses ai bot type when room bots are ai", () => {
  const player = {
    playerId: "player-1",
    name: "Player 1",
    token: "player-token",
    connected: false,
    isBot: false,
  };
  const room = {
    ...createRoom({
      bots: { enabled: true, type: "ai", count: 1, aiLanguage: "en" },
    }),
    phase: "game",
    session: {},
    players: new Map([[player.playerId, player]]),
    playersByToken: new Map([[player.token, player.playerId]]),
    joinOrder: [player.playerId],
  };
  const logs = [];

  markPlayerLeftBunker(room, player, {
    pickNextHost: () => player.playerId,
    broadcastRoomState: () => {},
    broadcastEvent: () => {},
    buildSystemEvent: () => ({}),
    tServerForRoom: (_room, key) => key,
    sendHostChanged: () => {},
    broadcastGameViews: () => {},
    scheduleRuleBasedBots: () => {},
    logRoomLifecycle: (event, roomCode, details) => logs.push({ event, roomCode, details }),
  });

  assert.equal(player.connected, true);
  assert.equal(player.isBot, true);
  assert.equal(player.botType, "ai");
  assert.ok(player.disconnectedBotTakeoverAt);
  assert.ok(logs.some((entry) => entry.event === "bot_takeover" && entry.details.botType === "ai"));
});
