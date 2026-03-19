import { useEffect, useMemo, useState } from "react";
import type { OverlayState } from "@bunker/shared";
import { useUiLocaleNamespace } from "../localization";

type OverlayConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "error";

interface UseOverlayViewStateParams {
  sourceUrl?: string | null;
  roomCode?: string | null;
  token?: string | null;
}

interface OverlayConnectionInfo {
  roomCode: string;
  token: string;
  wsUrl: string;
  source: string;
}

function buildWsUrlFromOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    parsed.pathname = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:3000";
    return `${protocol}//${host}`;
  }
}

function resolveConnectionInfo(params: UseOverlayViewStateParams): OverlayConnectionInfo | null {
  const directRoom = String(params.roomCode ?? "").trim().toUpperCase();
  const directToken = String(params.token ?? "").trim();

  if (params.sourceUrl) {
    try {
      const source = new URL(params.sourceUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
      const roomFromSrc = String(source.searchParams.get("room") ?? source.searchParams.get("roomCode") ?? "")
        .trim()
        .toUpperCase();
      const tokenFromSrc = String(source.searchParams.get("token") ?? "").trim();
      const roomCode = roomFromSrc || directRoom;
      const token = tokenFromSrc || directToken;
      if (!roomCode || !token) return null;
      return {
        roomCode,
        token,
        wsUrl: buildWsUrlFromOrigin(source.origin),
        source: source.toString(),
      };
    } catch {
      return null;
    }
  }

  if (!directRoom || !directToken) return null;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return {
    roomCode: directRoom,
    token: directToken,
    wsUrl: buildWsUrlFromOrigin(origin),
    source: `${origin}/overlay?room=${encodeURIComponent(directRoom)}&token=***`,
  };
}

export function useOverlayViewState(params: UseOverlayViewStateParams) {
  const overlayText = useUiLocaleNamespace("reconnect", { fallbacks: ["common", "misc"] });
  const connectionInfo = useMemo(
    () => resolveConnectionInfo(params),
    [params.roomCode, params.sourceUrl, params.token]
  );
  const [state, setState] = useState<OverlayState | null>(null);
  const [status, setStatus] = useState<OverlayConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connectionInfo) {
      setState(null);
      setStatus("error");
      setError(overlayText.t("overlayErrorMissingRoomOrToken"));
      return;
    }

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const cleanup = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore close errors
        }
        socket = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      setStatus(reconnectAttempt > 0 ? "reconnecting" : "connecting");
      setError(null);

      socket = new WebSocket(connectionInfo.wsUrl);
      socket.addEventListener("open", () => {
        if (disposed || !socket) return;
        reconnectAttempt = 0;
        socket.send(
          JSON.stringify({
            type: "overlaySubscribe",
            payload: { roomCode: connectionInfo.roomCode, token: connectionInfo.token },
          })
        );
      });

      socket.addEventListener("message", (event) => {
        if (disposed) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data ?? ""));
        } catch {
          return;
        }
        if (!parsed || typeof parsed !== "object") return;
        const typed = parsed as { type?: string; payload?: unknown };
        if (typed.type !== "overlayState") return;
        const payload = (typed.payload ?? {}) as {
          ok?: boolean;
          state?: OverlayState;
          message?: string;
          unauthorized?: boolean;
        };
        if (!payload.ok) {
          setStatus("error");
          setError(
            payload.message ||
              (payload.unauthorized
                ? overlayText.t("overlayErrorUnauthorized")
                : overlayText.t("overlayErrorNoData"))
          );
          return;
        }
        if (!payload.state) {
          setStatus("connecting");
          setError(overlayText.t("overlayWaitingState"));
          return;
        }
        setState(payload.state);
        setStatus("connected");
        setError(null);
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        reconnectAttempt += 1;
        const delay = Math.min(500 * 2 ** (reconnectAttempt - 1), 8000);
        setStatus("reconnecting");
        setError(overlayText.t("overlayReconnectIn", { seconds: Math.round(delay / 1000) }));
        reconnectTimer = setTimeout(connect, delay);
      });

      socket.addEventListener("error", () => {
        if (disposed) return;
        setStatus("error");
        setError(overlayText.t("overlayErrorReadOnlyStream"));
        try {
          socket?.close();
        } catch {
          // ignore close errors
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [connectionInfo, overlayText]);

  return {
    state,
    status,
    error,
    roomCode: connectionInfo?.roomCode ?? "",
    tokenPresent: Boolean(connectionInfo?.token),
    source: connectionInfo?.source ?? "",
  };
}

export type { OverlayConnectionStatus };
