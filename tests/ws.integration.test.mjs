import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const SPAWN_TIMEOUT_MS = 20_000;
const MESSAGE_TIMEOUT_MS = 10_000;

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
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (event) => {
      cleanup();
      reject(new Error(`WebSocket open failed: ${event?.message ?? "unknown error"}`));
    };
    const cleanup = () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("error", onError);
    };
    ws.addEventListener("open", onOpen, { once: true });
    ws.addEventListener("error", onError, { once: true });
  });
  return ws;
};

const sendJson = (ws, payload) => {
  ws.send(JSON.stringify(payload));
};

const nextMessage = (ws, predicate) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timeout waiting for websocket message."));
    }, MESSAGE_TIMEOUT_MS);

    const onMessage = (event) => {
      try {
        const data = typeof event.data === "string" ? event.data : String(event.data);
        const parsed = JSON.parse(data);
        if (predicate(parsed)) {
          clearTimeout(timeout);
          cleanup();
          resolve(parsed);
        }
      } catch {
        // ignore malformed frames in test flow
      }
    };

    const onClose = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error("WebSocket closed before expected message."));
    };

    const cleanup = () => {
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
    };

    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
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
    await nextMessage(secondWs, (msg) => msg?.type === "roomState" && msg.payload?.players?.length === 2);
    await nextMessage(hostWs, (msg) => msg?.type === "roomState" && msg.payload?.players?.length === 2);

    sendJson(hostWs, {
      type: "requestHostTransfer",
      payload: { targetPlayerId: secondAck.payload.playerId },
    });

    const transferredHostState = await nextMessage(
      hostWs,
      (msg) =>
        msg?.type === "roomState" &&
        msg.payload?.hostId === secondAck.payload.playerId &&
        msg.payload?.controlId === secondAck.payload.playerId
    );
    assert.equal(transferredHostState.payload.players.length, 2);

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
    const controlRoomState = await nextMessage(controlWs, (msg) => msg?.type === "roomState");
    assert.equal(controlRoomState.payload.players.length, 2);
    assert.equal(
      controlRoomState.payload.players.some((player) => player.name === "CONTROL"),
      false,
      "CONTROL companion socket must not create an extra player"
    );
  } finally {
    const closeSocket = (ws) =>
      new Promise((resolve) => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          resolve();
          return;
        }
        ws.addEventListener("close", () => resolve(), { once: true });
        try {
          ws.close();
        } catch {
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
