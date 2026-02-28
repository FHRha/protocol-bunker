import { ServerMessageSchema, type ClientMessage, type ServerMessage } from "@bunker/shared";
import { IDENTITY_MODE } from "./config";

export type MessageHandler = (message: ServerMessage) => void;
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type StatusHandler = (status: ConnectionStatus, error?: string | null) => void;

const PING_INTERVAL_MS = 20000;
const PONG_TIMEOUT_MS = 20000;
const MAX_MISSED_PONGS = 4;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 10000;
const RECONNECT_STABLE_RESET_MS = 20000;

export class BunkerClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<MessageHandler>();
  private statusListeners = new Set<StatusHandler>();
  private connecting: Promise<void> | null = null;
  private status: ConnectionStatus = "disconnected";
  private lastError: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private manualClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private stableReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private missedPongs = 0;

  constructor(private url: string) {}

  private setStatus(status: ConnectionStatus, error?: string | null) {
    this.status = status;
    if (typeof error !== "undefined") {
      this.lastError = error;
    }
    this.statusListeners.forEach((listener) => listener(this.status, this.lastError));
  }

  private clearHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    this.missedPongs = 0;
  }

  private clearStableReconnectTimer() {
    if (this.stableReconnectTimer) {
      clearTimeout(this.stableReconnectTimer);
      this.stableReconnectTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.manualClose) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const base = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (this.reconnectAttempt - 1),
      RECONNECT_MAX_DELAY_MS
    );
    const jitter = base * (0.8 + Math.random() * 0.4);
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(true).catch(() => {
        // Reconnect loop is driven by socket close events.
      });
    }, jitter);
  }

  private startHeartbeat() {
    this.clearHeartbeat();
    const sendPing = () => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: "ping", payload: {} }));
      if (this.pongTimeout) {
        clearTimeout(this.pongTimeout);
      }
      this.pongTimeout = setTimeout(() => {
        this.pongTimeout = null;
        this.missedPongs += 1;
        const limit =
          typeof document !== "undefined" && document.hidden ? MAX_MISSED_PONGS + 1 : MAX_MISSED_PONGS;
        if (this.missedPongs < limit) return;
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
      }, PONG_TIMEOUT_MS);
    };
    sendPing();
    this.pingTimer = setInterval(sendPing, PING_INTERVAL_MS);
  }

  async connect(isReconnect = false): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.manualClose = false;
    this.setStatus(isReconnect ? "reconnecting" : "connecting");

    const socket = new WebSocket(this.url);
    this.ws = socket;
    this.connecting = new Promise((resolve, reject) => {
      let settled = false;
      const safeResolve = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const safeReject = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      socket.onopen = () => {
        if (this.ws !== socket) return;
        this.missedPongs = 0;
        this.setStatus("connected", null);
        this.startHeartbeat();
        this.clearStableReconnectTimer();
        this.stableReconnectTimer = setTimeout(() => {
          this.reconnectAttempt = 0;
        }, RECONNECT_STABLE_RESET_MS);
        this.connecting = null;
        safeResolve();
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        this.lastError = "WebSocket connection failed";
        this.connecting = null;
        try {
          socket.close();
        } catch {
          // ignore
        }
        safeReject(new Error("WebSocket connection failed"));
      };

      socket.onclose = () => {
        if (this.ws === socket) {
          this.ws = null;
        }
        this.clearHeartbeat();
        this.clearStableReconnectTimer();
        this.connecting = null;
        safeReject(new Error("WebSocket closed"));
        if (this.manualClose) {
          this.setStatus("disconnected");
          return;
        }
        this.scheduleReconnect();
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        const result = ServerMessageSchema.safeParse(parsed);
        if (!result.success) {
          if (IDENTITY_MODE !== "prod") {
            console.warn("[ws] unknown message", parsed);
          }
          return;
        }
        if (result.data.type === "pong") {
          if (this.pongTimeout) {
            clearTimeout(this.pongTimeout);
            this.pongTimeout = null;
          }
          this.missedPongs = 0;
          return;
        }
        this.listeners.forEach((listener) => listener(result.data));
      };
    });

    return this.connecting;
  }

  send(message: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }
    this.ws.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearStableReconnectTimer();
    this.clearHeartbeat();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      socket.close();
    }
    this.setStatus("disconnected");
  }

  onMessage(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusListeners.add(handler);
    handler(this.status, this.lastError);
    return () => this.statusListeners.delete(handler);
  }
}
