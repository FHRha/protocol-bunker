import type { RoomState } from "@bunker/shared";

export type RoomRouteTarget = {
  pathname: "/lobby" | "/game";
  search: string;
};

export function getRoomRouteTarget(roomState: RoomState | null): RoomRouteTarget | null {
  if (!roomState?.roomCode || !roomState.phase) return null;
  return {
    pathname: roomState.phase === "lobby" ? "/lobby" : "/game",
    search: `?room=${encodeURIComponent(roomState.roomCode)}`,
  };
}

export function getRoomCodeFromSearch(search: string): string {
  return new URLSearchParams(search).get("room")?.trim().toUpperCase() ?? "";
}

export function hasRouteReconnectContext(input: {
  roomState: RoomState | null;
  playerId: string | null;
  intentExists: boolean;
  locationSearch: string;
}): boolean {
  const roomCodeFromUrl = getRoomCodeFromSearch(input.locationSearch);
  const storedPlayerName =
    typeof window !== "undefined" ? (localStorage.getItem("bunker.playerName") ?? "").trim() : "";
  return (
    Boolean(input.roomState) ||
    Boolean(input.playerId) ||
    input.intentExists ||
    (Boolean(roomCodeFromUrl) && Boolean(storedPlayerName))
  );
}
