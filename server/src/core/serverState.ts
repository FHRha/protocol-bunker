import { WebSocket } from "ws";
import type { Role } from "@bunker/shared";
import type { ConnectionInfo, OverlaySubscription, Room } from "./types.js";

export const rooms = new Map<string, Room>();
export const connectionInfo = new WeakMap<WebSocket, ConnectionInfo>();
export const overlaySubscriptions = new Map<WebSocket, OverlaySubscription>();
