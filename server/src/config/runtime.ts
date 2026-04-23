import fs from "node:fs";
import path from "node:path";
import type { IdentityMode } from "../core/types.js";

function resolveOptionalPath(envKey: string, primary: string, fallback: string) {
  const raw = process.env[envKey]?.trim();
  if (raw) {
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    return { path: resolved, source: `${envKey}=${raw}` };
  }
  const chosen = fs.existsSync(primary) ? primary : fallback;
  return { path: chosen, source: fs.existsSync(primary) ? "default(primary)" : "default(fallback)" };
}

export function envFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

const PORT_DEFAULT = Number(process.env.PORT ?? 3000);
const ASSETS_PRIMARY = path.resolve(process.cwd(), "assets");
const ASSETS_FALLBACK = path.resolve(process.cwd(), "..", "assets");
const LOCALES_PRIMARY = path.resolve(process.cwd(), "locales");
const LOCALES_FALLBACK = path.resolve(process.cwd(), "..", "locales");
const CLIENT_DIST_PRIMARY = path.resolve(process.cwd(), "client", "dist");
const CLIENT_DIST_FALLBACK = path.resolve(process.cwd(), "..", "client", "dist");
const OVERLAY_PUBLIC_PRIMARY = path.resolve(process.cwd(), "server", "public", "overlay");
const OVERLAY_PUBLIC_FALLBACK = path.resolve(process.cwd(), "public", "overlay");

const assetsResolved = resolveOptionalPath("BUNKER_ASSETS_ROOT", ASSETS_PRIMARY, ASSETS_FALLBACK);
const localesResolved = resolveOptionalPath("BUNKER_LOCALES_ROOT", LOCALES_PRIMARY, LOCALES_FALLBACK);
const clientResolved = resolveOptionalPath("BUNKER_CLIENT_DIST", CLIENT_DIST_PRIMARY, CLIENT_DIST_FALLBACK);
const overlayPublicResolved = fs.existsSync(OVERLAY_PUBLIC_PRIMARY)
  ? OVERLAY_PUBLIC_PRIMARY
  : OVERLAY_PUBLIC_FALLBACK;

export const PORT = PORT_DEFAULT;
export const HOST = process.env.HOST ?? "0.0.0.0";
export const ASSETS_ROOT = assetsResolved.path;
export const LOCALES_ROOT = localesResolved.path;
export const CLIENT_DIST = clientResolved.path;
export const OVERLAY_PUBLIC_ROOT = overlayPublicResolved;
export const ASSETS_ROOT_SOURCE = assetsResolved.source;
export const CLIENT_DIST_SOURCE = clientResolved.source;
export const IDENTITY_MODE: IdentityMode =
  process.env.BUNKER_IDENTITY_MODE?.trim().toLowerCase() === "dev_tab" ||
  envFlag(process.env.DEV_NEW_PLAYER_PER_TAB)
    ? "dev_tab"
    : "prod";
export const DEV_LOGS = IDENTITY_MODE === "dev_tab" || envFlag(process.env.BUNKER_DEV_LOGS);
export const DEV_SCENARIOS_ENABLED =
  IDENTITY_MODE === "dev_tab" || envFlag(process.env.BUNKER_ENABLE_DEV_SCENARIOS);
export const DISCONNECT_GRACE_MS = 300_000;
export const RECONNECT_GRACE_AFTER_KICK_MS = 300_000;
export const HOST_GRACE_MS = 60_000;
export const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.BUNKER_ROOM_CLEANUP_INTERVAL_MS ?? 60_000);
export const ROOM_INACTIVE_TTL_MS = Number(process.env.BUNKER_ROOM_INACTIVE_TTL_MS ?? 6 * 60 * 60 * 1000);
export const ROOM_ENDED_TTL_MS = Number(process.env.BUNKER_ROOM_ENDED_TTL_MS ?? 30 * 60 * 1000);
export const TRUST_PROXY = envFlag(process.env.TRUST_PROXY);
export const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN;
export const PUBLIC_HOST = process.env.PUBLIC_HOST ?? process.env.BUNKER_PUBLIC_HOST;
export const DOMAIN = process.env.DOMAIN ?? process.env.BUNKER_DOMAIN;
export const BUILD_PROFILE = (process.env.BUNKER_BUILD_PROFILE ?? "").trim().toLowerCase();
export const LINKS_VISIBILITY_MODE = (
  process.env.BUNKER_LINKS_VISIBILITY ?? (BUILD_PROFILE === "server" ? "public" : "all")
)
  .trim()
  .toLowerCase();
export const HIDE_LOCAL_LINKS_IN_LOGS =
  LINKS_VISIBILITY_MODE === "public" || LINKS_VISIBILITY_MODE === "external";
export const SERVE_CLIENT = process.env.BUNKER_SERVE_CLIENT !== "false";
export const DESKTOP_API_SECRET = String(process.env.BUNKER_DESKTOP_API_SECRET ?? "").trim();
export const ALLOWED_ORIGINS_RAW = process.env.BUNKER_ALLOWED_ORIGINS ?? "";
export const ENFORCE_ORIGIN_CHECKS = (() => {
  const explicit = process.env.BUNKER_ENFORCE_ORIGIN_CHECKS;
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return envFlag(explicit);
  }
  const hasNonWildcardAllowlist = ALLOWED_ORIGINS_RAW
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .some((entry) => entry.length > 0 && entry !== "*");
  return hasNonWildcardAllowlist;
})();
export const OUTBOUND_SENSITIVE_PAYLOAD_GUARD = process.env.BUNKER_OUTBOUND_SENSITIVE_GUARD !== "0";
export const OUTBOUND_SENSITIVE_PAYLOAD_GUARD_STRICT = envFlag(process.env.BUNKER_OUTBOUND_SENSITIVE_GUARD_STRICT);
export const SENSITIVE_HTTP_RATE_LIMIT_ENABLED = process.env.BUNKER_SENSITIVE_HTTP_RATE_LIMIT !== "0";
export const SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS = (() => {
  const raw = Number(process.env.BUNKER_SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS ?? 60_000);
  if (!Number.isFinite(raw)) return 60_000;
  return Math.max(1_000, Math.floor(raw));
})();
export const SENSITIVE_HTTP_RATE_LIMIT_MAX = (() => {
  const raw = Number(process.env.BUNKER_SENSITIVE_HTTP_RATE_LIMIT_MAX ?? 120);
  if (!Number.isFinite(raw)) return 120;
  return Math.max(1, Math.floor(raw));
})();
export const OVERLAY_TOKEN_TTL_MS = (() => {
  const raw = Number(process.env.BUNKER_OVERLAY_TOKEN_TTL_MS ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.floor(raw));
})();
export const OVERLAY_CONTROL_INVITE_TTL_MS = (() => {
  const raw = Number(process.env.BUNKER_OVERLAY_CONTROL_INVITE_TTL_MS ?? 10 * 60 * 1000);
  if (!Number.isFinite(raw)) return 10 * 60 * 1000;
  return Math.max(0, Math.floor(raw));
})();
export const SPECTATOR_INVITE_TTL_MS = (() => {
  const raw = Number(process.env.BUNKER_SPECTATOR_INVITE_TTL_MS ?? 10 * 60 * 1000);
  if (!Number.isFinite(raw)) return 10 * 60 * 1000;
  return Math.max(1_000, Math.floor(raw));
})();
export const WAN_LOOKUP_TIMEOUT_MS = 2800;
export const WAN_LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;
