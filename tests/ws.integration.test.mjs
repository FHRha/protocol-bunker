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
  };

  state.onMessage = (eventOrData) => {
    let parsed;
    try {
      parsed = parseServerMessage(eventOrData);
    } catch {
      return;
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

const matchRoomStatePlayersCount = (count) => (msg) =>
  (msg?.type === "roomState" && msg.payload?.players?.length === count) ||
  (msg?.type === "statePatch" && msg.payload?.roomState?.players?.length === count);

const matchHostTransferred = (targetPlayerId) => (msg) =>
  (msg?.type === "roomState" && msg.payload?.hostId === targetPlayerId) ||
  (msg?.type === "statePatch" && msg.payload?.roomState?.hostId === targetPlayerId);

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
    const players =
      controlRoomState?.type === "roomState"
        ? controlRoomState.payload.players
        : (controlRoomState.payload?.roomState?.players ?? []);
    const hostId =
      controlRoomState?.type === "roomState"
        ? controlRoomState.payload.hostId
        : controlRoomState.payload?.roomState?.hostId;
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
