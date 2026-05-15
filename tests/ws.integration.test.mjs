import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const SPAWN_TIMEOUT_MS = 20_000;
const MESSAGE_TIMEOUT_MS = 10_000;
const require = createRequire(import.meta.url);
const socketMessageState = new WeakMap();
const makeTabId = (prefix = "tab") => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const resolveWebSocketCtor = () => {
  if (typeof globalThis.WebSocket === "function") {
    return globalThis.WebSocket;
  }
  const candidates = ["ws", "../server/node_modules/ws"];
  for (const candidate of candidates) {
    try {
      const mod = require(candidate);
      return mod.WebSocket ?? mod.default ?? mod;
    } catch {
      // try next candidate
    }
  }
  throw new Error("WebSocket is not available in this Node runtime.");
};

const WebSocketCtor = resolveWebSocketCtor();

const addListener = (ws, event, handler, once = false) => {
  if (typeof ws.addEventListener === "function") {
    ws.addEventListener(event, handler, once ? { once: true } : undefined);
    return;
  }
  if (once && typeof ws.once === "function") {
    ws.once(event, handler);
    return;
  }
  if (typeof ws.on === "function") {
    ws.on(event, handler);
  }
};

const removeListener = (ws, event, handler) => {
  if (typeof ws.removeEventListener === "function") {
    ws.removeEventListener(event, handler);
    return;
  }
  if (typeof ws.off === "function") {
    ws.off(event, handler);
    return;
  }
  if (typeof ws.removeListener === "function") {
    ws.removeListener(event, handler);
  }
};

const parseServerMessage = (eventOrData) => {
  const raw =
    eventOrData && typeof eventOrData === "object" && "data" in eventOrData ? eventOrData.data : eventOrData;
  const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  return JSON.parse(text);
};

const getQueryParam = (urlValue, key) => {
  try {
    return new URL(String(urlValue ?? "")).searchParams.get(key) ?? "";
  } catch {
    const text = String(urlValue ?? "");
    const re = new RegExp(`[?&]${String(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^&]+)`);
    const match = text.match(re);
    return match ? decodeURIComponent(match[1]) : "";
  }
};

const getSocketMessageState = (ws) => {
  const existing = socketMessageState.get(ws);
  if (existing) return existing;

  const state = {
    queue: [],
    waiters: [],
    closed: false,
    onMessage: null,
    onClose: null,
    cleanup: null,
    lastRoomState: null,
    lastGameView: null,
  };

  state.onMessage = (eventOrData) => {
    let parsed;
    try {
      parsed = parseServerMessage(eventOrData);
    } catch {
      return;
    }
    if (parsed?.type === "roomState" && parsed.payload) {
      state.lastRoomState = parsed.payload;
    } else if (parsed?.type === "gameView" && parsed.payload) {
      state.lastGameView = parsed.payload;
    } else if (parsed?.type === "statePatch" && parsed.payload && typeof parsed.payload === "object") {
      const payload = { ...parsed.payload };
      if (payload.roomState && typeof payload.roomState === "object") {
        state.lastRoomState = { ...(state.lastRoomState ?? {}), ...payload.roomState };
      }
      if (payload.gameView && typeof payload.gameView === "object") {
        state.lastGameView = { ...(state.lastGameView ?? {}), ...payload.gameView };
      }
      if (state.lastRoomState) {
        payload.roomStateResolved = state.lastRoomState;
      }
      if (state.lastGameView) {
        payload.gameViewResolved = state.lastGameView;
      }
      parsed = { ...parsed, payload };
    }

    const waiterIndex = state.waiters.findIndex((waiter) => {
      try {
        return waiter.predicate(parsed);
      } catch {
        return false;
      }
    });
    if (waiterIndex >= 0) {
      const [waiter] = state.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(parsed);
      return;
    }
    state.queue.push(parsed);
  };

  state.onClose = () => {
    state.closed = true;
    for (const waiter of state.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("WebSocket closed before expected message."));
    }
  };

  state.cleanup = () => {
    removeListener(ws, "message", state.onMessage);
    removeListener(ws, "close", state.onClose);
    state.queue.length = 0;
    state.lastRoomState = null;
    state.lastGameView = null;
    for (const waiter of state.waiters.splice(0)) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error("Socket message state disposed."));
    }
  };

  addListener(ws, "message", state.onMessage);
  addListener(ws, "close", state.onClose);
  socketMessageState.set(ws, state);
  return state;
};

const disposeSocketMessageState = (ws) => {
  const state = socketMessageState.get(ws);
  if (!state) return;
  state.cleanup?.();
  socketMessageState.delete(ws);
};

const clearQueuedMessages = (ws) => {
  const state = getSocketMessageState(ws);
  state.queue.length = 0;
};

const waitForPort = (child) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout waiting for server startup."));
    }, SPAWN_TIMEOUT_MS);
    let stderrBuffer = "";

    const onStdout = (chunk) => {
      const text = chunk.toString("utf8");
      const match = text.match(/Server listening on http:\/\/[^:]+:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        cleanup();
        resolve(Number(match[1]));
      }
    };

    const onStderr = (chunk) => {
      stderrBuffer += chunk.toString("utf8");
      if (stderrBuffer.length > 8000) {
        stderrBuffer = stderrBuffer.slice(-8000);
      }
    };

    const onExit = (code, signal) => {
      clearTimeout(timeout);
      cleanup();
      const suffix = stderrBuffer.trim() ? `\n--- server stderr ---\n${stderrBuffer.trim()}` : "";
      reject(new Error(`Server exited before startup (code=${code}, signal=${signal ?? "none"}).${suffix}`));
    };

    const cleanup = () => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
  });

const openSocket = async (url) => {
  const ws = new WebSocketCtor(url);
  await new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (eventOrError) => {
      cleanup();
      const message = eventOrError?.message ?? "unknown error";
      reject(new Error(`WebSocket open failed: ${message}`));
    };
    const cleanup = () => {
      removeListener(ws, "open", onOpen);
      removeListener(ws, "error", onError);
    };
    addListener(ws, "open", onOpen, true);
    addListener(ws, "error", onError, true);
  });
  return ws;
};

const sendJson = (ws, payload) => {
  ws.send(JSON.stringify(payload));
};

const nextMessage = (ws, predicate) =>
  new Promise((resolve, reject) => {
    const state = getSocketMessageState(ws);
    const queuedIndex = state.queue.findIndex((msg) => {
      try {
        return predicate(msg);
      } catch {
        return false;
      }
    });
    if (queuedIndex >= 0) {
      const [msg] = state.queue.splice(queuedIndex, 1);
      resolve(msg);
      return;
    }
    if (state.closed) {
      reject(new Error("WebSocket closed before expected message."));
      return;
    }
    const timeout = setTimeout(() => {
      const idx = state.waiters.findIndex((waiter) => waiter.predicate === predicate && waiter.resolve === resolve);
      if (idx >= 0) state.waiters.splice(idx, 1);
      reject(new Error("Timeout waiting for websocket message."));
    }, MESSAGE_TIMEOUT_MS);
    state.waiters.push({ predicate, resolve, reject, timeout });
  });

const getRoomStateFromMessage = (msg) => {
  if (msg?.type === "roomState") return msg.payload;
  if (msg?.type === "statePatch") return msg.payload?.roomStateResolved ?? msg.payload?.roomState;
  return undefined;
};

const getGameViewFromMessage = (msg) => {
  if (msg?.type === "gameView") return msg.payload;
  if (msg?.type === "statePatch") return msg.payload?.gameViewResolved ?? msg.payload?.gameView;
  return undefined;
};

const SENSITIVE_KEY_PATTERN = /(token|secret|sessionId|password|cookie|auth)/i;

const assertNoSensitiveKeys = (value, path = "$") => {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoSensitiveKeys(entry, `${path}[${index}]`);
    });
    return;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    assert.ok(!SENSITIVE_KEY_PATTERN.test(key), `Unexpected sensitive key "${key}" at ${nextPath}`);
    assertNoSensitiveKeys(entry, nextPath);
  }
};

const getCurrentGameViewFromSocket = (ws) => {
  const state = getSocketMessageState(ws);
  return state.lastGameView ?? null;
};

const waitForGameView = async (ws, predicate, options = {}) => {
  const allowCurrent = options.allowCurrent !== false;
  if (allowCurrent) {
    const current = getCurrentGameViewFromSocket(ws);
    if (current && predicate(current)) {
      return current;
    }
  }
  const msg = await nextMessage(ws, matchGameView(predicate));
  const view = getGameViewFromMessage(msg);
  if (!view) {
    throw new Error("Expected gameView payload.");
  }
  return view;
};

const matchRoomStatePlayersCount = (count) => (msg) =>
  getRoomStateFromMessage(msg)?.players?.length === count;

const matchHostTransferred = (targetPlayerId) => (msg) =>
  getRoomStateFromMessage(msg)?.hostId === targetPlayerId;

const matchGameView = (predicate) => (msg) => {
  const view = getGameViewFromMessage(msg);
  return Boolean(view) && predicate(view);
};

test("ws integration: rule-based lobby bots reveal and vote in classic flow", async (t) => {
  if (process.platform === "win32") {
    t.skip("WS integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
      BUNKER_RULE_BOT_MIN_DELAY_MS: "1",
      BUNKER_RULE_BOT_MAX_DELAY_MS: "1",
      BUNKER_RULE_BOT_DISCUSSION_MIN_DELAY_MS: "1",
      BUNKER_RULE_BOT_DISCUSSION_MAX_DELAY_MS: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;

  try {
    const port = await waitForPort(server);
    const url = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(url);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
        locale: "en",
        tabId: makeTabId("host"),
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const initialRoomStateMessage = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const initialRoomState = getRoomStateFromMessage(initialRoomStateMessage);
    assert.ok(initialRoomState?.settings, "room settings must be present");

    sendJson(hostWs, {
      type: "updateSettings",
      payload: {
        ...initialRoomState.settings,
        maxPlayers: 5,
        bots: {
          enabled: true,
          type: "rule_based",
          count: 4,
        },
      },
    });

    const botsRoomStateMessage = await nextMessage(hostWs, (msg) => {
      const state = getRoomStateFromMessage(msg);
      return state?.players?.filter((player) => player.isBot).length === 4;
    });
    const botsRoomState = getRoomStateFromMessage(botsRoomStateMessage);
    const botPlayers = botsRoomState.players.filter((player) => player.isBot);
    assert.deepEqual(
      botPlayers.slice(0, 3).map((player) => player.name),
      ["Mira", "Anton", "Vera"],
      "bots should receive localized automatic names"
    );
    assert.equal(botPlayers.length, 4, "room should include four rule-based bots");

    sendJson(hostWs, { type: "startGame", payload: {} });
    const hostStartView = await waitForGameView(hostWs, (view) => view.phase === "reveal");
    const hiddenHostCard = hostStartView.you.hand.find((card) => !card.revealed);
    assert.ok(hiddenHostCard?.instanceId, "host must have a hidden card to reveal");

    let hostView = hostStartView;
    for (let guard = 0; guard < 30; guard += 1) {
      if (hostView.phase === "voting" && hostView.public.votePhase === "voting") {
        break;
      }

      if (hostView.phase === "reveal") {
        const turnPlayerId = String(hostView.public.currentTurnPlayerId ?? "");
        if (turnPlayerId === hostAck.payload.playerId) {
          const hiddenCard = hostView.you.hand.find((card) => !card.revealed);
          assert.ok(hiddenCard?.instanceId, "host must always have a hidden card while reveal phase continues");
          sendJson(hostWs, {
            type: "revealCard",
            payload: { cardId: hiddenCard.instanceId },
          });
        }
      } else if (hostView.phase === "reveal_discussion") {
        sendJson(hostWs, { type: "continueRound", payload: {} });
      } else {
        throw new Error(`Unexpected phase while advancing to voting: ${hostView.phase}`);
      }

      const previousPhase = hostView.phase;
      const previousTurnPlayerId = String(hostView.public.currentTurnPlayerId ?? "");
      hostView = await waitForGameView(
        hostWs,
        (view) =>
          view.phase === "voting" && view.public.votePhase === "voting" ||
          view.phase !== previousPhase ||
          String(view.public.currentTurnPlayerId ?? "") !== previousTurnPlayerId,
        { allowCurrent: false }
      );
    }

    assert.equal(hostView.phase, "voting", "game must reach voting phase");
    assert.equal(hostView.public.votePhase, "voting", "voting must enter vote collection phase");
    const votingView = hostView;
    const publicVotes = votingView.public.votesPublic ?? [];

    for (const bot of botPlayers) {
      const vote = publicVotes.find((entry) => entry.voterId === bot.playerId);
      assert.equal(vote?.status, "voted", `bot ${bot.name} should vote automatically`);
      assert.ok(vote?.targetId, `bot ${bot.name} vote should have a target`);
    }
  } finally {
    await new Promise((resolve) => {
      if (!hostWs || hostWs.readyState === WebSocketCtor.CLOSED) {
        disposeSocketMessageState(hostWs);
        resolve();
        return;
      }
      addListener(
        hostWs,
        "close",
        () => {
          disposeSocketMessageState(hostWs);
          resolve();
        },
        true
      );
      try {
        hostWs.close();
      } catch {
        disposeSocketMessageState(hostWs);
        resolve();
      }
    });

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("ws integration: host transfer works and CONTROL companion socket does not create ghost player", async (t) => {
  if (process.platform === "win32") {
    t.skip("WS integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  let secondWs;
  let controlWs;

  try {
    const port = await waitForPort(server);
    const url = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(url);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
        tabId: makeTabId("host"),
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    assert.ok(roomCode, "roomCode must be set after create");
    assert.equal(hostRoomState.payload.players.length, 1);
    assert.equal(hostRoomState.payload.hostId, hostAck.payload.playerId);

    secondWs = await openSocket(url);
    sendJson(secondWs, {
      type: "hello",
      payload: {
        name: "Player2",
        roomCode,
      },
    });

    const secondAck = await nextMessage(secondWs, (msg) => msg?.type === "helloAck");
    await nextMessage(secondWs, matchRoomStatePlayersCount(2));
    await nextMessage(hostWs, matchRoomStatePlayersCount(2));

    sendJson(hostWs, {
      type: "requestHostTransfer",
      payload: { targetPlayerId: secondAck.payload.playerId },
    });

    const transferredHostState = await nextMessage(hostWs, matchHostTransferred(secondAck.payload.playerId));
    if (transferredHostState?.type === "roomState") {
      assert.equal(transferredHostState.payload.players.length, 2);
    }

    controlWs = await openSocket(url);
    sendJson(controlWs, {
      type: "hello",
      payload: {
        name: "CONTROL",
        roomCode,
        playerToken: secondAck.payload.playerToken,
      },
    });

    await nextMessage(controlWs, (msg) => msg?.type === "helloAck");
    const controlRoomState = await nextMessage(
      controlWs,
      (msg) => msg?.type === "roomState" || msg?.type === "statePatch"
    );
    const resolvedControlState = getRoomStateFromMessage(controlRoomState) ?? {};
    const players = resolvedControlState.players ?? [];
    const hostId = resolvedControlState.hostId;
    assert.equal(hostId, secondAck.payload.playerId, "hostId must be transferred to Player2");
    assert.equal(players.length, 2);
    assert.equal(
      players.some((player) => player.name === "CONTROL"),
      false,
      "CONTROL companion socket must not create an extra player"
    );
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(controlWs), closeSocket(secondWs), closeSocket(hostWs)]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("security: outbound room and overlay payloads do not leak secret keys", async (t) => {
  if (process.platform === "win32") {
    t.skip("Security integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  if (typeof fetch !== "function") {
    t.skip("Global fetch is not available in this Node runtime.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  const playerSockets = [];

  try {
    const port = await waitForPort(server);
    const wsUrl = `ws://127.0.0.1:${port}`;
    const base = `http://127.0.0.1:${port}`;

    hostWs = await openSocket(wsUrl);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
        tabId: makeTabId("host"),
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    const controlToken = String(hostAck.payload?.playerToken ?? "");
    assert.ok(roomCode, "roomCode must be set after create");
    assert.ok(controlToken, "control token must be set after create");

    assertNoSensitiveKeys(hostRoomState.payload);

    const joinPlayer = async (name) => {
      const ws = await openSocket(wsUrl);
      playerSockets.push(ws);
      sendJson(ws, {
        type: "hello",
        payload: {
          name,
          roomCode,
        },
      });
      await nextMessage(ws, (msg) => msg?.type === "helloAck");
      return ws;
    };

    await joinPlayer("Player2");
    await joinPlayer("Player3");
    const player4 = await joinPlayer("Player4");

    await nextMessage(hostWs, matchRoomStatePlayersCount(4));
    await nextMessage(player4, matchRoomStatePlayersCount(4));

    sendJson(hostWs, { type: "startGame", payload: {} });
    const hostGameView = await waitForGameView(hostWs, (view) => view?.phase === "reveal");
    assertNoSensitiveKeys(hostGameView);

    sendJson(hostWs, {
      type: "overlaySubscribe",
      payload: { roomCode, token: controlToken },
    });
    const overlayStateMessage = await nextMessage(hostWs, (msg) => msg?.type === "overlayState");
    assertNoSensitiveKeys(overlayStateMessage.payload);

    const controlStateResp = await fetch(`${base}/overlay-control/state?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(controlToken)}`);
    assert.equal(controlStateResp.status, 200, "overlay-control state should be authorized with the host token");
    const controlStateJson = await controlStateResp.json();
    assert.equal(controlStateJson.ok, true);
    assertNoSensitiveKeys(controlStateJson);

    const overlayLinksResp = await fetch(`${base}/api/overlay-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, token: controlToken }),
    });
    assert.equal(overlayLinksResp.status, 200, "overlay-links should be authorized with the host token");
    const overlayLinksJson = await overlayLinksResp.json();
    assert.equal(overlayLinksJson.ok, true);
    assertNoSensitiveKeys(overlayLinksJson);
    assert.ok(overlayLinksJson.links?.overlayViewUrl?.lan, "overlay links must include built overlay URLs");
    assert.ok(overlayLinksJson.links?.overlayControlUrl?.lan, "overlay links must include built control URLs");
    assert.ok(getQueryParam(overlayLinksJson.links?.overlayControlUrl?.lan, "invite"), "overlay control URL must contain invite token");
    assert.equal(
      getQueryParam(overlayLinksJson.links?.overlayControlUrl?.lan, "token"),
      "",
      "overlay control URL must not contain control session token"
    );
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(hostWs), ...playerSockets.map((ws) => closeSocket(ws))]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("security: overlay tokens expire and refresh via overlay-links", async (t) => {
  if (process.platform === "win32") {
    t.skip("Security integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  if (typeof fetch !== "function") {
    t.skip("Global fetch is not available in this Node runtime.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
      BUNKER_OVERLAY_TOKEN_TTL_MS: "120",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  let overlayWs;

  try {
    const port = await waitForPort(server);
    const base = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(wsUrl);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
        tabId: makeTabId("host"),
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    const controlPlayerToken = String(hostAck.payload?.playerToken ?? "");
    assert.ok(roomCode, "roomCode must be set after create");
    assert.ok(controlPlayerToken, "control player token must be set after create");

    const firstLinksResp = await fetch(`${base}/api/overlay-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, token: controlPlayerToken }),
    });
    assert.equal(firstLinksResp.status, 200);
    const firstLinks = await firstLinksResp.json();
    assert.equal(firstLinks.ok, true);

    const oldViewToken = getQueryParam(firstLinks?.links?.overlayViewUrl?.lan, "token");
    const oldControlToken = getQueryParam(firstLinks?.links?.overlayControlStateUrl?.lan, "token");
    const firstControlInviteToken = getQueryParam(firstLinks?.links?.overlayControlUrl?.lan, "invite");
    const firstControlSessionTokenInControlUrl = getQueryParam(firstLinks?.links?.overlayControlUrl?.lan, "token");
    assert.ok(oldViewToken, "first overlay view token must exist");
    assert.ok(oldControlToken, "first overlay control token must exist");
    assert.ok(firstControlInviteToken, "overlay control URL must use invite token");
    assert.equal(firstControlSessionTokenInControlUrl, "", "overlay control URL must not expose session token");

    await new Promise((resolve) => setTimeout(resolve, 170));

    const secondLinksResp = await fetch(`${base}/api/overlay-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, token: controlPlayerToken }),
    });
    assert.equal(secondLinksResp.status, 200);
    const secondLinks = await secondLinksResp.json();
    assert.equal(secondLinks.ok, true);

    const newViewToken = getQueryParam(secondLinks?.links?.overlayViewUrl?.lan, "token");
    const newControlToken = getQueryParam(secondLinks?.links?.overlayControlStateUrl?.lan, "token");
    const secondControlInviteToken = getQueryParam(secondLinks?.links?.overlayControlUrl?.lan, "invite");
    const secondControlSessionTokenInControlUrl = getQueryParam(secondLinks?.links?.overlayControlUrl?.lan, "token");
    assert.ok(newViewToken, "refreshed overlay view token must exist");
    assert.ok(newControlToken, "refreshed overlay control token must exist");
    assert.ok(secondControlInviteToken, "overlay control URL must keep invite token");
    assert.equal(secondControlSessionTokenInControlUrl, "", "overlay control URL must not expose session token");
    assert.notEqual(newViewToken, oldViewToken, "overlay view token should rotate after TTL");
    assert.notEqual(newControlToken, oldControlToken, "overlay control token should rotate after TTL");

    overlayWs = await openSocket(wsUrl);
    sendJson(overlayWs, {
      type: "overlaySubscribe",
      payload: {
        roomCode,
        token: oldViewToken,
      },
    });
    const oldTokenState = await nextMessage(overlayWs, (msg) => msg?.type === "overlayState");
    assert.equal(oldTokenState.payload?.ok, false, "expired token should be rejected");
    assert.equal(oldTokenState.payload?.unauthorized, true, "expired token should be unauthorized");

    sendJson(overlayWs, {
      type: "overlaySubscribe",
      payload: {
        roomCode,
        token: newViewToken,
      },
    });
    const newTokenState = await nextMessage(
      overlayWs,
      (msg) => msg?.type === "overlayState" && msg?.payload?.ok === true
    );
    assert.equal(newTokenState.payload?.ok, true, "refreshed token should be accepted");
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(overlayWs), closeSocket(hostWs)]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("security: overlay control invite exchange issues session token and invalidates invite", async (t) => {
  if (process.platform === "win32") {
    t.skip("Security integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  if (typeof fetch !== "function") {
    t.skip("Global fetch is not available in this Node runtime.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
      BUNKER_OVERLAY_CONTROL_INVITE_TTL_MS: "120000",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;

  try {
    const port = await waitForPort(server);
    const base = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(wsUrl);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    const controlPlayerToken = String(hostAck.payload?.playerToken ?? "");
    assert.ok(roomCode, "roomCode must be set after create");
    assert.ok(controlPlayerToken, "control player token must be set after create");

    const inviteResp = await fetch(`${base}/overlay-control/invite/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, token: controlPlayerToken }),
    });
    assert.equal(inviteResp.status, 200, "invite create should succeed for control role");
    const inviteJson = await inviteResp.json();
    assert.equal(inviteJson.ok, true);

    const inviteUrl = String(inviteJson.inviteUrlLan ?? "");
    const inviteToken = getQueryParam(inviteUrl, "invite");
    const inviteParsed = new URL(inviteUrl);
    assert.equal(
      inviteUrl.includes("://0.0.0.0:"),
      false,
      "invite URL must not use 0.0.0.0 bind address"
    );
    assert.equal(inviteParsed.hostname, "127.0.0.1", "invite URL should target current request host in tests");
    assert.ok(inviteToken, "invite token must be present in invite URL");

    const invitePageResp = await fetch(inviteUrl);
    assert.equal(invitePageResp.status, 200, "invite URL should open overlay-control page");

    const exchangeResp = await fetch(`${base}/overlay-control/invite/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, inviteToken }),
    });
    assert.equal(exchangeResp.status, 200, "invite exchange should succeed with fresh invite token");
    const exchangeJson = await exchangeResp.json();
    assert.equal(exchangeJson.ok, true);
    const controlSessionToken = String(exchangeJson.controlSessionToken ?? "");
    assert.ok(controlSessionToken, "invite exchange should issue control session token");

    const reusedInviteResp = await fetch(`${base}/overlay-control/invite/exchange`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roomCode, inviteToken }),
    });
    assert.equal(reusedInviteResp.status, 403, "invite token should be one-time after successful exchange");

    const controlStateResp = await fetch(
      `${base}/overlay-control/state?room=${encodeURIComponent(roomCode)}&token=${encodeURIComponent(controlSessionToken)}`
    );
    assert.equal(controlStateResp.status, 200, "issued control session token should authorize control state");
    const controlStateJson = await controlStateResp.json();
    assert.equal(controlStateJson.ok, true);
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(hostWs)]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("security: sensitive HTTP endpoints enforce rate-limit", async (t) => {
  if (process.platform === "win32") {
    t.skip("Security integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  if (typeof fetch !== "function") {
    t.skip("Global fetch is not available in this Node runtime.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
      BUNKER_SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS: "60000",
      BUNKER_SENSITIVE_HTTP_RATE_LIMIT_MAX: "2",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;

  try {
    const port = await waitForPort(server);
    const base = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(wsUrl);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    const controlPlayerToken = String(hostAck.payload?.playerToken ?? "");
    assert.ok(roomCode, "roomCode must be set after create");
    assert.ok(controlPlayerToken, "control player token must be set after create");

    const makeOverlayLinksRequest = async () =>
      fetch(`${base}/api/overlay-links`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomCode, token: controlPlayerToken }),
      });

    const firstResp = await makeOverlayLinksRequest();
    assert.equal(firstResp.status, 200, "first request should pass");

    const secondResp = await makeOverlayLinksRequest();
    assert.equal(secondResp.status, 200, "second request should pass");

    const thirdResp = await makeOverlayLinksRequest();
    assert.equal(thirdResp.status, 429, "third request should be rate-limited");
    const thirdJson = await thirdResp.json();
    assert.equal(thirdJson.ok, false);
    assert.ok(String(thirdJson.message ?? "").trim().length > 0, "rate-limit response should include message");
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(hostWs)]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("ws integration: eliminated CONTROL host can still continue round with host_only permission", async (t) => {
  if (process.platform === "win32") {
    t.skip("WS integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "dev_tab",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  const playerSockets = [];

  try {
    const port = await waitForPort(server);
    const url = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(url);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "classic",
        tabId: makeTabId("host"),
      },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    assert.ok(roomCode, "roomCode must be set after create");

    const joinPlayer = async (name) => {
      const ws = await openSocket(url);
      playerSockets.push(ws);
      sendJson(ws, {
        type: "hello",
        payload: { name, roomCode, tabId: makeTabId(name.toLowerCase()) },
      });
      const ack = await nextMessage(ws, (msg) => msg?.type === "helloAck");
      return { ws, ack };
    };

    const p2 = await joinPlayer("Player2");
    const p3 = await joinPlayer("Player3");
    const p4 = await joinPlayer("Player4");

    await nextMessage(hostWs, matchRoomStatePlayersCount(4));
    await nextMessage(p4.ws, matchRoomStatePlayersCount(4));

    sendJson(hostWs, { type: "startGame", payload: {} });
    await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal"));

    sendJson(hostWs, {
      type: "devKickPlayer",
      payload: { targetPlayerId: hostAck.payload.playerId },
    });

    const afterKickHostView = await nextMessage(
      hostWs,
      matchGameView((view) => view?.public?.players?.some((player) => player.playerId === hostAck.payload.playerId && player.status === "eliminated"))
    );
    const afterKickView = getGameViewFromMessage(afterKickHostView);
    assert.ok(afterKickView, "Host view after kick must be available");
    const currentTurnPlayerId = String(afterKickView.public?.currentTurnPlayerId ?? "");
    assert.ok(currentTurnPlayerId, "Current turn player must exist after host elimination");

    const socketByPlayerId = new Map([
      [p2.ack.payload.playerId, p2.ws],
      [p3.ack.payload.playerId, p3.ws],
      [p4.ack.payload.playerId, p4.ws],
    ]);
    const turnWs = socketByPlayerId.get(currentTurnPlayerId);
    assert.ok(turnWs, "Socket for current turn player must exist");

    const turnView = await waitForGameView(
      turnWs,
      (view) => view?.phase === "reveal" && view?.public?.currentTurnPlayerId === currentTurnPlayerId
    );
    const revealCard = turnView.you.hand.find((card) => !card.revealed);
    assert.ok(revealCard, "Current turn player must have a hidden card");
    sendJson(turnWs, {
      type: "revealCard",
      payload: { cardId: revealCard.instanceId },
    });

    await waitForGameView(hostWs, (view) => view?.phase === "reveal_discussion");

    clearQueuedMessages(hostWs);
    sendJson(hostWs, { type: "continueRound", payload: {} });

    const result = await Promise.race([
      nextMessage(hostWs, (msg) => msg?.type === "error").then((msg) => ({ kind: "error", msg })),
      nextMessage(
        hostWs,
        matchGameView((view) => view?.phase !== "reveal_discussion")
      ).then((msg) => ({ kind: "gameView", msg })),
    ]);

    assert.equal(
      result.kind,
      "gameView",
      result.kind === "error"
        ? `continueRound failed after host elimination: ${result.msg.payload?.message ?? "unknown"}`
        : "Expected gameView transition after continueRound"
    );
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(hostWs), ...playerSockets.map((ws) => closeSocket(ws))]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("ws integration: eliminated CONTROL host can still finalize voting", async (t) => {
  if (process.platform === "win32") {
    t.skip("WS integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "dev_tab",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  const playerSockets = [];

  try {
    const port = await waitForPort(server);
    const url = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(url);
    sendJson(hostWs, {
      type: "hello",
      payload: { name: "Host", create: true, scenarioId: "classic", tabId: makeTabId("host") },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const roomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(roomState.payload?.roomCode ?? "");
    assert.ok(roomCode, "roomCode must be set after create");

    const joinPlayer = async (name) => {
      const ws = await openSocket(url);
      playerSockets.push(ws);
      sendJson(ws, { type: "hello", payload: { name, roomCode, tabId: makeTabId(name.toLowerCase()) } });
      const ack = await nextMessage(ws, (msg) => msg?.type === "helloAck");
      return { ws, ack };
    };

    const p2 = await joinPlayer("Player2");
    const p3 = await joinPlayer("Player3");
    const p4 = await joinPlayer("Player4");

    await nextMessage(hostWs, matchRoomStatePlayersCount(4));

    sendJson(hostWs, { type: "startGame", payload: {} });
    await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal"));

    sendJson(hostWs, {
      type: "devKickPlayer",
      payload: { targetPlayerId: hostAck.payload.playerId },
    });
    const afterKickMsg = await nextMessage(
      hostWs,
      matchGameView((view) => view?.public?.players?.some((p) => p.playerId === hostAck.payload.playerId && p.status === "eliminated"))
    );

    const socketsById = new Map([
      [p2.ack.payload.playerId, p2.ws],
      [p3.ack.payload.playerId, p3.ws],
      [p4.ack.payload.playerId, p4.ws],
    ]);

    // Advance game to voting phase.
    let hostView = getGameViewFromMessage(afterKickMsg);
    assert.ok(hostView, "Host view after kick must be available");
    for (let guard = 0; guard < 30; guard += 1) {
      if (hostView.phase === "voting" && hostView.public?.votePhase === "voting") break;

      if (hostView.phase === "reveal") {
        const turnId = String(hostView.public?.currentTurnPlayerId ?? "");
        const turnWs = socketsById.get(turnId);
        assert.ok(turnWs, `No socket for current turn player ${turnId}`);
        const turnView = await waitForGameView(
          turnWs,
          (view) => view?.phase === "reveal" && view?.public?.currentTurnPlayerId === turnId
        );
        const card = turnView.you.hand.find((entry) => !entry.revealed);
        assert.ok(card, `No hidden card to reveal for ${turnId}`);
        sendJson(turnWs, { type: "revealCard", payload: { cardId: card.instanceId } });
      } else if (hostView.phase === "reveal_discussion") {
        sendJson(hostWs, { type: "continueRound", payload: {} });
      }

      const next = await nextMessage(
        hostWs,
        (m) => m?.type === "gameView" || m?.type === "statePatch" || m?.type === "error"
      );
      if (next?.type === "error") {
        throw new Error(`advance-to-voting failed: ${next.payload?.message ?? "unknown"}`);
      }
      const nextView = getGameViewFromMessage(next);
      if (nextView) {
        hostView = nextView;
      }
    }

    assert.equal(hostView?.phase, "voting", "Game must reach voting phase");
    assert.equal(hostView?.public?.votePhase, "voting", "Voting must be in collection phase");

    const aliveIds = hostView.public.players
      .filter((player) => player.status === "alive")
      .map((player) => player.playerId);
    assert.ok(aliveIds.length >= 2, "Need at least two alive players for voting");

    for (const voterId of aliveIds) {
      const voterWs = socketsById.get(voterId);
      assert.ok(voterWs, `No socket for voter ${voterId}`);
      const targetId = aliveIds.find((id) => id !== voterId) ?? voterId;
      sendJson(voterWs, { type: "vote", payload: { targetPlayerId: targetId } });
    }

    await nextMessage(
      hostWs,
      matchGameView((view) => view?.phase === "voting" && view?.public?.votePhase === "voteSpecialWindow")
    );

    clearQueuedMessages(hostWs);
    sendJson(hostWs, { type: "finalizeVoting", payload: {} });

    const result = await Promise.race([
      nextMessage(hostWs, (msg) => msg?.type === "error").then((msg) => ({ kind: "error", msg })),
      nextMessage(
        hostWs,
        matchGameView((view) => !(view?.phase === "voting" && view?.public?.votePhase === "voteSpecialWindow"))
      ).then((msg) => ({ kind: "gameView", msg })),
    ]);

    assert.equal(
      result.kind,
      "gameView",
      result.kind === "error"
        ? `finalizeVoting failed after host elimination: ${result.msg.payload?.message ?? "unknown"}`
        : "Expected game phase to advance after finalizeVoting"
    );
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(hostWs), ...playerSockets.map((ws) => closeSocket(ws))]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("ws integration: applySpecial + continueRound in immediate sequence keeps special apply and phase advance", async (t) => {
  if (process.platform === "win32") {
    t.skip("WS integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "1",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;

  try {
    const port = await waitForPort(server);
    const url = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(url);
    sendJson(hostWs, {
      type: "hello",
      payload: {
        name: "Host",
        create: true,
        scenarioId: "dev_test",
      },
    });

    await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    await nextMessage(hostWs, (msg) => msg?.type === "roomState");

    sendJson(hostWs, { type: "startGame", payload: {} });
    const revealViewMsg = await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal"));
    const revealView = getGameViewFromMessage(revealViewMsg);
    assert.ok(revealView, "Reveal gameView must be available");
    const revealCard = revealView.you.hand.find((entry) => !entry.revealed);
    assert.ok(revealCard, "Host must have a hidden card in reveal");
    sendJson(hostWs, { type: "revealCard", payload: { cardId: revealCard.instanceId } });

    const discussionViewMsg = await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal_discussion"));
    const discussionView = getGameViewFromMessage(discussionViewMsg);
    assert.ok(discussionView, "Discussion gameView must be available");
    const devSpecial = discussionView.you.specialConditions.find((item) => {
      const options = Array.isArray(item?.effect?.params?.specialOptions)
        ? item.effect.params.specialOptions
        : [];
      return options.length > 0;
    });
    assert.ok(devSpecial, "Dev scenario must provide dev special chooser");
    const specialOptions = Array.isArray(devSpecial?.effect?.params?.specialOptions)
      ? devSpecial.effect.params.specialOptions
      : [];
    assert.ok(specialOptions.length > 0, "Dev special must have selectable options");

    const pickedSpecialId = String(specialOptions[0]?.id ?? "");
    assert.ok(pickedSpecialId, "Special option id must be present");

    clearQueuedMessages(hostWs);
    sendJson(hostWs, {
      type: "applySpecial",
      payload: {
        specialInstanceId: devSpecial.instanceId,
        payload: { specialId: pickedSpecialId },
      },
    });
    sendJson(hostWs, { type: "continueRound", payload: {} });

    let sawSpecialApplied = false;
    let sawPhaseAdvance = false;
    for (let guard = 0; guard < 25; guard += 1) {
      const msg = await nextMessage(hostWs, (m) => m?.type === "gameView" || m?.type === "statePatch" || m?.type === "error");
      if (msg.type === "error") {
        throw new Error(`Immediate apply+continue failed: ${msg.payload?.message ?? "unknown"}`);
      }
      const view = getGameViewFromMessage(msg);
      if (!view) continue;
      const specialConditions = Array.isArray(view.you?.specialConditions) ? view.you.specialConditions : [];
      const currentSpecial = specialConditions.find((item) => item.instanceId === devSpecial.instanceId);
      if (currentSpecial && currentSpecial.title !== devSpecial.title) {
        sawSpecialApplied = true;
      }
      if (view.phase !== "reveal_discussion") {
        sawPhaseAdvance = true;
      }
      if (sawSpecialApplied && sawPhaseAdvance) break;
    }

    assert.equal(sawSpecialApplied, true, "Special apply must be reflected in game view");
    assert.equal(sawPhaseAdvance, true, "Round must continue after immediate continueRound");
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await closeSocket(hostWs);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("http integration: overlay-control/action end-to-end with presenter mode guard", async (t) => {
  if (process.platform === "win32") {
    t.skip("HTTP integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  if (typeof fetch !== "function") {
    t.skip("Global fetch is not available in this Node runtime.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  let p2Ws;
  let p3Ws;
  let p4Ws;

  try {
    const port = await waitForPort(server);
    const base = `http://127.0.0.1:${port}`;
    const wsUrl = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(wsUrl);
    sendJson(hostWs, {
      type: "hello",
      payload: { name: "Host", create: true, scenarioId: "classic" },
    });
    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    assert.ok(roomCode, "roomCode must be set");
    const controlToken = String(hostAck.payload?.playerToken ?? "");
    assert.ok(controlToken, "CONTROL player token must be set");

    const joinPlayer = async (name) => {
      const ws = await openSocket(wsUrl);
      sendJson(ws, { type: "hello", payload: { name, roomCode } });
      await nextMessage(ws, (msg) => msg?.type === "helloAck");
      return ws;
    };

    p2Ws = await joinPlayer("Player2");
    p3Ws = await joinPlayer("Player3");
    p4Ws = await joinPlayer("Player4");
    const fullRoom = await nextMessage(hostWs, matchRoomStatePlayersCount(4));
    const currentSettings = getRoomStateFromMessage(fullRoom)?.settings;
    assert.ok(currentSettings, "settings must be present in roomState");

    const actionPayload = {
      roomCode,
      token: controlToken,
      action: "START_GAME",
    };

    const beforePresenterResp = await fetch(`${base}/overlay-control/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actionPayload),
    });
    assert.equal(beforePresenterResp.status, 400, "START_GAME via control API must be blocked when presenter disabled");
    const beforePresenterJson = await beforePresenterResp.json();
    assert.equal(beforePresenterJson.ok, false);
    assert.match(
      String(beforePresenterJson.message ?? ""),
      /Presenter mode is disabled|Режим ведущего отключён(?: для этой комнаты)?/i,
    );

    sendJson(hostWs, {
      type: "updateSettings",
      payload: {
        ...currentSettings,
        enablePresenterMode: true,
      },
    });
    await nextMessage(hostWs, (msg) => getRoomStateFromMessage(msg)?.settings?.enablePresenterMode === true);

    const startResp = await fetch(`${base}/overlay-control/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(actionPayload),
    });
    assert.equal(startResp.status, 200, "START_GAME via control API should succeed");
    const startJson = await startResp.json();
    assert.equal(startJson.ok, true);
    assert.equal(startJson.presenterModeEnabled, true);
    assert.equal(startJson.presenter?.enabled, true);
    assert.equal(startJson.presenter?.roomPhase, "game");

    const skipResp = await fetch(`${base}/overlay-control/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        roomCode,
        token: controlToken,
        action: "SKIP_ROUND",
      }),
    });
    assert.equal(skipResp.status, 200, "SKIP_ROUND via control API should succeed in reveal flow");
    const skipJson = await skipResp.json();
    assert.equal(skipJson.ok, true);
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([closeSocket(p4Ws), closeSocket(p3Ws), closeSocket(p2Ws), closeSocket(hostWs)]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});

test("ws integration: reconnect + host transfer race keeps transferred host stable", async (t) => {
  if (process.platform === "win32") {
    t.skip("WS integration test is run in CI (linux); windows process tree teardown is flaky.");
    return;
  }

  const server = spawn("pnpm", ["-C", "server", "exec", "tsx", "src/index.ts"], {
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      BUNKER_ENABLE_DEV_SCENARIOS: "0",
      BUNKER_IDENTITY_MODE: "token",
      BUNKER_DEV_LOGS: "0",
      BUNKER_SERVE_CLIENT: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let hostWs;
  let p2Ws;
  let p3Ws;
  let p4Ws;
  let controlCompanionWs;
  let hostReconnectWs;

  try {
    const port = await waitForPort(server);
    const url = `ws://127.0.0.1:${port}`;

    hostWs = await openSocket(url);
    sendJson(hostWs, {
      type: "hello",
      payload: { name: "Host", create: true, scenarioId: "classic" },
    });
    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const hostRoomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(hostRoomState.payload?.roomCode ?? "");
    assert.ok(roomCode, "roomCode must be set");
    const hostToken = String(hostAck.payload?.playerToken ?? "");
    assert.ok(hostToken, "host token must be set");

    const joinPlayer = async (name) => {
      const ws = await openSocket(url);
      sendJson(ws, { type: "hello", payload: { name, roomCode } });
      const ack = await nextMessage(ws, (msg) => msg?.type === "helloAck");
      return { ws, ack };
    };

    const p2 = await joinPlayer("Player2");
    const p3 = await joinPlayer("Player3");
    const p4 = await joinPlayer("Player4");
    p2Ws = p2.ws;
    p3Ws = p3.ws;
    p4Ws = p4.ws;
    const targetHostId = p2.ack.payload.playerId;

    await nextMessage(hostWs, matchRoomStatePlayersCount(4));

    sendJson(hostWs, { type: "startGame", payload: {} });
    await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal"));

    // Simulate CONTROL-host disconnect (starts host transfer timeout window).
    hostWs.close();
    await new Promise((resolve) => setTimeout(resolve, 50));

    controlCompanionWs = await openSocket(url);
    sendJson(controlCompanionWs, {
      type: "hello",
      payload: {
        name: "CONTROL",
        roomCode,
        playerToken: hostToken,
      },
    });
    await nextMessage(controlCompanionWs, (msg) => msg?.type === "helloAck");
    await nextMessage(controlCompanionWs, (msg) => msg?.type === "roomState");

    clearQueuedMessages(p2Ws);
    sendJson(controlCompanionWs, {
      type: "requestHostTransfer",
      payload: { targetPlayerId: targetHostId },
    });
    const transferred = await nextMessage(
      p2Ws,
      matchHostTransferred(targetHostId)
    );
    assert.ok(transferred, "host transfer must be reflected for companion control socket");

    // Reconnect original host right after transfer; host must stay on transferred player.
    hostReconnectWs = await openSocket(url);
    sendJson(hostReconnectWs, {
      type: "hello",
      payload: {
        name: "Host",
        roomCode,
        playerToken: hostToken,
      },
    });
    const reconnectAck = await nextMessage(hostReconnectWs, (msg) => msg?.type === "helloAck");
    assert.equal(reconnectAck.payload.playerId, hostAck.payload.playerId, "same player must reconnect");

    const postReconnectState = await nextMessage(
      hostReconnectWs,
      (msg) => msg?.type === "roomState" || msg?.type === "statePatch"
    );
    const hostIdAfterReconnect = getRoomStateFromMessage(postReconnectState)?.hostId;
    assert.equal(hostIdAfterReconnect, targetHostId, "reconnected former host must not steal host role back");
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocketCtor.CLOSED) {
          disposeSocketMessageState(ws);
          resolve();
          return;
        }
        addListener(
          ws,
          "close",
          () => {
            disposeSocketMessageState(ws);
            resolve();
          },
          true
        );
        try {
          ws.close();
        } catch {
          disposeSocketMessageState(ws);
          resolve();
        }
      });

    await Promise.all([
      closeSocket(hostReconnectWs),
      closeSocket(controlCompanionWs),
      closeSocket(p4Ws),
      closeSocket(p3Ws),
      closeSocket(p2Ws),
      closeSocket(hostWs),
    ]);

    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        server.once("exit", () => resolve());
        setTimeout(resolve, 2_000);
      });
    }
  }
});
