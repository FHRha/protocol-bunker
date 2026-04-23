import type { GameEvent, GameView, RoomState } from "@bunker/shared";
import type { ConnectionStatus } from "../wsClient";

export type UiToast = { id: string; message: string; variant: "danger" | "success" | "info" };

export type MobileToastView = {
  id: string;
  title: string;
  message: string;
  variant: string;
  onClose: () => void;
};

type ConnectionDisplayLabels = {
  statusOnline: string;
  statusReconnecting: string;
  statusOffline: string;
  statusReconnectHint: string;
  statusOfflineHint: string;
};

export function buildConnectionDisplay(
  connectionStatus: ConnectionStatus,
  labels: ConnectionDisplayLabels
) {
  return {
    label:
      connectionStatus === "connected"
        ? labels.statusOnline
        : connectionStatus === "reconnecting"
          ? labels.statusReconnecting
          : labels.statusOffline,
    className:
      connectionStatus === "connected"
        ? "online"
        : connectionStatus === "reconnecting"
          ? "reconnecting"
          : "offline",
    hint:
      connectionStatus === "reconnecting"
        ? labels.statusReconnectHint
        : connectionStatus === "disconnected"
          ? labels.statusOfflineHint
          : null,
  };
}

export function getDevKickCandidates(gameView: GameView | null, playerId: string | null) {
  return (
    gameView?.public.players.filter(
      (player) => player.status === "alive" && player.playerId !== playerId
    ) ?? []
  );
}

export function getTransferHostCandidates(roomState: RoomState | null) {
  return roomState?.players.filter((player) => player.playerId !== roomState.hostId) ?? [];
}

export function buildRoleLabel(input: {
  isControl: boolean;
  isHost: boolean;
  roleControl: string;
  roleHost: string;
  rolePlayer: string;
}) {
  if (input.isControl) return input.roleControl;
  if (input.isHost) return input.roleHost;
  return input.rolePlayer;
}

export function buildRoomCodeDisplay(input: {
  roomState: RoomState | null;
  isLobbyRoute: boolean;
  streamerMode: boolean;
  showRoomCode: boolean;
  hiddenValue: string;
  roomPill: (value: string) => string;
}) {
  const hidden = Boolean(
    input.roomState && input.isLobbyRoute && input.streamerMode && !input.showRoomCode
  );
  return {
    hidden,
    label: input.roomState
      ? input.roomPill(hidden ? input.hiddenValue : input.roomState.roomCode)
      : "",
  };
}

type BuildMobileToastsInput = {
  isMobile: boolean;
  uiToasts: UiToast[];
  eventToasts: GameEvent[];
  notificationTitle: string;
  toastKind: (kind: GameEvent["kind"]) => string;
  removeUiToast: (id: string) => void;
  removeEventToast: (id: string) => void;
};

export function buildToastViews({
  isMobile,
  uiToasts,
  eventToasts,
  notificationTitle,
  toastKind,
  removeUiToast,
  removeEventToast,
}: BuildMobileToastsInput) {
  const visibleUiToasts = isMobile ? uiToasts.slice(-1) : uiToasts;
  const visibleEventToasts = isMobile ? eventToasts.slice(-2) : eventToasts;
  const mobileToasts: MobileToastView[] = isMobile
    ? [
        ...visibleUiToasts.map((toast) => ({
          id: `ui-${toast.id}`,
          title: notificationTitle,
          message: toast.message,
          variant: toast.variant ?? "",
          onClose: () => removeUiToast(toast.id),
        })),
        ...visibleEventToasts.map((toast) => {
          const variant =
            toast.kind === "playerDisconnected" || toast.kind === "playerLeftBunker"
              ? "danger"
              : toast.kind === "playerReconnected"
                ? "success"
                : "";
          return {
            id: `event-${toast.id}`,
            title: toastKind(toast.kind),
            message: toast.message,
            variant,
            onClose: () => removeEventToast(toast.id),
          };
        }),
      ]
    : [];

  return {
    visibleUiToasts,
    visibleEventToasts,
    mobileToasts,
  };
}
