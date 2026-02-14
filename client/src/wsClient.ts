import { ServerMessageSchema, type ClientMessage, type ServerMessage } from "@bunker/shared";
import { IDENTITY_MODE } from "./config";

export type MessageHandler = (message: ServerMessage) => void;
export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type StatusHandler = (status: ConnectionStatus, error?: string | null) => void;

const PING_INTERVAL_MS = 15000;
const PONG_TIMEOUT_MS = 8000;

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
  }

  private scheduleReconnect() {
    if (this.manualClose) return;
    if (this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    const base = Math.min(250 * 2 ** (this.reconnectAttempt - 1), 5000);
    const jitter = base * (0.8 + Math.random() * 0.4);
    this.setStatus("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(true);
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

    this.ws = new WebSocket(this.url);
    this.connecting = new Promise((resolve, reject) => {
      if (!this.ws) return;
      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.setStatus("connected", null);
        this.startHeartbeat();
        this.connecting = null;
        resolve();
      };
      this.ws.onerror = () => {
        this.lastError = "WebSocket connection failed";
        this.connecting = null;
        try {
          this.ws?.close();
        } catch {
          // ignore
        }
        reject(new Error("WebSocket connection failed"));
      };
      this.ws.onclose = () => {
        this.clearHeartbeat();
        this.connecting = null;
        if (this.manualClose) {
          this.setStatus("disconnected");
          return;
        }
        this.scheduleReconnect();
      };
      this.ws.onmessage = (event) => {
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
    this.clearHeartbeat();
    if (!this.ws) return;
    this.ws.close();
    this.ws = null;
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
