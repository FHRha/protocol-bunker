import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";

const SPAWN_TIMEOUT_MS = 20_000;
const MESSAGE_TIMEOUT_MS = 10_000;
const require = createRequire(import.meta.url);
const socketMessageState = new WeakMap();

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

const matchRoomStatePlayersCount = (count) => (msg) =>
  getRoomStateFromMessage(msg)?.players?.length === count;

const matchHostTransferred = (targetPlayerId) => (msg) =>
  getRoomStateFromMessage(msg)?.hostId === targetPlayerId;

const matchGameView = (predicate) => (msg) => {
  const view = getGameViewFromMessage(msg);
  return Boolean(view) && predicate(view);
};

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
        payload: { name, roomCode },
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
    const currentTurnPlayerId = String(afterKickHostView.payload.public.currentTurnPlayerId ?? "");
    assert.ok(currentTurnPlayerId, "Current turn player must exist after host elimination");

    const socketByPlayerId = new Map([
      [p2.ack.payload.playerId, p2.ws],
      [p3.ack.payload.playerId, p3.ws],
      [p4.ack.payload.playerId, p4.ws],
    ]);
    const turnWs = socketByPlayerId.get(currentTurnPlayerId);
    assert.ok(turnWs, "Socket for current turn player must exist");

    const turnView = await nextMessage(
      turnWs,
      matchGameView((view) => view?.phase === "reveal" && view?.public?.currentTurnPlayerId === currentTurnPlayerId)
    );
    const revealCard = turnView.payload.you.hand.find((card) => !card.revealed);
    assert.ok(revealCard, "Current turn player must have a hidden card");
    sendJson(turnWs, {
      type: "revealCard",
      payload: { cardId: revealCard.instanceId },
    });

    await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal_discussion"));

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
      payload: { name: "Host", create: true, scenarioId: "classic" },
    });

    const hostAck = await nextMessage(hostWs, (msg) => msg?.type === "helloAck");
    const roomState = await nextMessage(hostWs, (msg) => msg?.type === "roomState");
    const roomCode = String(roomState.payload?.roomCode ?? "");
    assert.ok(roomCode, "roomCode must be set after create");

    const joinPlayer = async (name) => {
      const ws = await openSocket(url);
      playerSockets.push(ws);
      sendJson(ws, { type: "hello", payload: { name, roomCode } });
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
    await nextMessage(
      hostWs,
      matchGameView((view) => view?.public?.players?.some((p) => p.playerId === hostAck.payload.playerId && p.status === "eliminated"))
    );

    const socketsById = new Map([
      [p2.ack.payload.playerId, p2.ws],
      [p3.ack.payload.playerId, p3.ws],
      [p4.ack.payload.playerId, p4.ws],
    ]);

    // Advance game to voting phase.
    let hostView;
    for (let guard = 0; guard < 30; guard += 1) {
      const msg = await nextMessage(hostWs, (m) => m?.type === "gameView" || m?.type === "statePatch");
      hostView = getGameViewFromMessage(msg);
      if (!hostView) continue;
      if (hostView.phase === "voting" && hostView.public?.votePhase === "voting") break;

      if (hostView.phase === "reveal") {
        const turnId = String(hostView.public?.currentTurnPlayerId ?? "");
        const turnWs = socketsById.get(turnId);
        assert.ok(turnWs, `No socket for current turn player ${turnId}`);
        const turnViewMsg = await nextMessage(
          turnWs,
          matchGameView((view) => view?.phase === "reveal" && view?.public?.currentTurnPlayerId === turnId)
        );
        const card = turnViewMsg.payload.you.hand.find((entry) => !entry.revealed);
        assert.ok(card, `No hidden card to reveal for ${turnId}`);
        sendJson(turnWs, { type: "revealCard", payload: { cardId: card.instanceId } });
        continue;
      }

      if (hostView.phase === "reveal_discussion") {
        sendJson(hostWs, { type: "continueRound", payload: {} });
        continue;
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
    const revealCard = revealViewMsg.payload.you.hand.find((entry) => !entry.revealed);
    assert.ok(revealCard, "Host must have a hidden card in reveal");
    sendJson(hostWs, { type: "revealCard", payload: { cardId: revealCard.instanceId } });

    const discussionViewMsg = await nextMessage(hostWs, matchGameView((view) => view?.phase === "reveal_discussion"));
    const discussionView = discussionViewMsg.payload;
    const devSpecial = discussionView.you.specialConditions.find((item) =>
      String(item.title ?? "").toLowerCase().includes("dev")
    );
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
      const currentSpecial = view.you.specialConditions.find((item) => item.instanceId === devSpecial.instanceId);
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
    assert.match(String(beforePresenterJson.message ?? ""), /Presenter mode is disabled/i);

    sendJson(hostWs, {
      type: "updateSettings",
      payload: {
        ...currentSettings,
        enablePresenterMode: true,
      },
    });
    await nextMessage(
      hostWs,
      (msg) => msg?.type === "roomState" && msg.payload?.settings?.enablePresenterMode === true
    );

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

    sendJson(controlCompanionWs, {
      type: "requestHostTransfer",
      payload: { targetPlayerId: targetHostId },
    });

    const transferred = await nextMessage(
      controlCompanionWs,
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
