import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import {
  ClientMessageSchema,
  type ClientHelloPayload,
  type ClientMessage,
  type GameEvent,
  type RoomState,
  type ScenarioAction,
  type ServerMessage,
  type ScenarioMeta,
  type ScenarioSession,
  type ScenarioModule,
  type GameSettings,
  type GameRuleset,
  type ManualRulesConfig,
  type PlayerStatus,
  type OverlayState,
  type OverlayOverrides,
  type Role,
  type PublicPlayerView,
  type WorldState30,
  type AssetCatalog,
  LINK_PATHS,
  OverlayOverridesSchema,
  buildLinkSet,
  getRulesetForPlayerCount,
} from "@bunker/shared";
import {
  getSubtitleMap,
  getThreatOverlayShortMap,
  resolveCardKeyFromAssetId as resolveSubtitleCardKeyFromAssetId,
  type SubtitleMap,
} from "./assets/card_subtitles.js";
import { getDisasterTextByAssetId } from "./assets/world_texts.js";
import { normalizeServerLocale, tServer, type ServerLocaleCode } from "./locales/serverLocale.js";
import { tOverlay } from "./locales/overlayLocale.js";
import { localizeScenarioMessage, resolveScenarioLocaleKey } from "./locales/scenarioLocale.js";
import { localizeSpecialConditionField } from "./locales/specialConditionLocale.js";
import { buildDefaultOverlayBioTags, buildOverlayBiology } from "./locales/biologyLocale.js";
import { createRuntimeContext } from "./bootstrap/runtimeContext.js";
import {
  broadcastOverlayState as broadcastOverlayStatePresenter,
  broadcastGameViews as broadcastGameViewsPresenter,
  broadcastRoomState as broadcastRoomStatePresenter,
  sendGameView as sendGameViewPresenter,
  sendOverlayState as sendOverlayStatePresenter,
  syncScenarioStatuses,
} from "./presenters/gameState.js";
import {
  sendLocalizedError as sendLocalizedErrorPresenter,
  sendReconnectForbidden as sendReconnectForbiddenPresenter,
  tServerForRoom as tServerForRoomPresenter,
} from "./presenters/messages.js";
import { buildRoomState as buildRoomStateProjection } from "./presenters/roomState.js";
import { createLobbyRoom } from "./rooms/factory.js";
import {
  buildSystemEvent,
  formatRemaining,
  getCurrentTurnPlayerId,
  getEffectiveMaxPlayers,
  getScenarioStatus,
  isClassicRoom,
  pickNextHost,
  resolveControlActorId,
  updateRulesetIfAuto,
} from "./game/runtime.js";
import { runControlCommand, startGameAsControl, type ControlCommand } from "./game/control.js";
import { createWsContexts } from "./ws/context.js";
import { routeClientMessage } from "./ws/router.js";
import { handleSocketClose, parseIncomingClientMessage, validateWsOrigin } from "./ws/transport.js";
import type {
  IdentityMode,
  OverlayControlInviteToken,
  OverlayControlToken,
  OverlayViewToken,
  Player,
  PlayerReconnectToken,
  Room,
  SpectatorInvite,
  SpectatorToken,
} from "./core/types.js";
import {
  ALLOWED_ORIGINS_RAW,
  ASSETS_ROOT,
  ASSETS_ROOT_SOURCE,
  BUILD_PROFILE,
  CLIENT_DIST,
  CLIENT_DIST_SOURCE,
  DESKTOP_API_SECRET,
  DEV_LOGS,
  DEV_SCENARIOS_ENABLED,
  DISCONNECT_GRACE_MS,
  DOMAIN,
  ENFORCE_ORIGIN_CHECKS,
  HIDE_LOCAL_LINKS_IN_LOGS,
  HOST,
  HOST_GRACE_MS,
  IDENTITY_MODE,
  LINKS_VISIBILITY_MODE,
  LOCALES_ROOT,
  OUTBOUND_SENSITIVE_PAYLOAD_GUARD,
  OUTBOUND_SENSITIVE_PAYLOAD_GUARD_STRICT,
  OVERLAY_CONTROL_INVITE_TTL_MS,
  OVERLAY_PUBLIC_ROOT,
  OVERLAY_TOKEN_TTL_MS,
  PORT,
  PUBLIC_HOST,
  PUBLIC_ORIGIN,
  RECONNECT_GRACE_AFTER_KICK_MS,
  ROOM_CLEANUP_INTERVAL_MS,
  ROOM_ENDED_TTL_MS,
  ROOM_INACTIVE_TTL_MS,
  SENSITIVE_HTTP_RATE_LIMIT_ENABLED,
  SENSITIVE_HTTP_RATE_LIMIT_MAX,
  SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS,
  SERVE_CLIENT,
  SPECTATOR_INVITE_TTL_MS,
  TRUST_PROXY,
  WAN_LOOKUP_CACHE_TTL_MS,
  WAN_LOOKUP_TIMEOUT_MS,
  envFlag,
} from "./config/runtime.js";
import { connectionInfo, overlaySubscriptions, rooms } from "./core/serverState.js";
import {
  addLobbyBotPlayer as addLobbyBotPlayerState,
  attachPlayer as attachPlayerState,
  generateRoomCode as generateRoomCodeState,
  removeLobbyPlayer as removeLobbyPlayerState,
} from "./rooms/lifecycle.js";
import { createCleanupInactiveRooms } from "./rooms/runtime.js";
import {
  computeKickRemainingMs as computeKickRemainingMsState,
  findPlayerBySessionId as findPlayerBySessionIdState,
  findPlayerByTabId as findPlayerByTabIdState,
  findPlayerByToken as findPlayerByTokenState,
  markPlayerLeftBunker as markPlayerLeftBunkerState,
  scheduleHostTransfer as scheduleHostTransferState,
  transferHost as transferHostState,
} from "./sessions/playerSession.js";

let LISTEN_PORT = PORT;
const CLASSIC_SCENARIO_ID = "classic";
const MIN_CLASSIC_PLAYERS = 4;
const MAX_CLASSIC_PLAYERS = 16;
const OVERLAY_MAX_LINE_LEN = 120;
const OVERLAY_MAX_CATA_LEN = 600;
const OVERLAY_MAX_NAME_LEN = 24;
const OVERLAY_MAX_TOP_BUNKER_LINES = 5;
const OVERLAY_MAX_TOP_THREAT_LINES = 6;
const OVERLAY_MAX_EXTRA_TEXTS = 64;
const OVERLAY_MAX_BACKGROUND_PRESET_LEN = 64;
const OVERLAY_MAX_URL_PARAMS = 24;
const OVERLAY_MAX_URL_PARAM_KEY_LEN = 64;
const OVERLAY_MAX_URL_PARAM_VALUE_LEN = 256;
const OVERLAY_RESERVED_URL_PARAMS = new Set(["room", "roomCode", "token"]);
const MANUAL_MAX_ROUNDS = 64;
const MANUAL_MAX_VOTES_PER_ROUND = 9;
const MANUAL_MIN_TARGET_REVEALS = 5;
const MANUAL_MAX_TARGET_REVEALS = 7;
const MANUAL_DEFAULT_TARGET_REVEALS = 7;

const OVERLAY_BACKGROUNDS_ROOT = path.join(OVERLAY_PUBLIC_ROOT, "backgrounds");
const OVERLAY_PRESETS_FILE_PRIMARY = path.resolve(process.cwd(), "docs", "overlay_presets.txt");
const OVERLAY_PRESETS_FILE_FALLBACK = path.resolve(process.cwd(), "..", "docs", "overlay_presets.txt");
const OVERLAY_BACKGROUND_ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif"]);
const OVERLAY_LAYOUT_FILE_ALIASES: Record<"l4" | "l8" | "l12", string[]> = {
  l4: ["4p", "l4", "4"],
  l8: ["8p", "l8", "8"],
  l12: ["12p", "l12", "12"],
};

interface OverlayBackgroundPresetLayouts {
  l4?: string;
  l8?: string;
  l12?: string;
}

interface OverlayBackgroundPreset {
  id: string;
  label: string;
  layouts: OverlayBackgroundPresetLayouts;
}

interface OverlayBackgroundCatalog {
  defaultPreset: string;
  presets: OverlayBackgroundPreset[];
}

interface OverlayUrlPreset {
  id: string;
  label: string;
  urlTemplate: string;
  comment?: string;
}

let wanLookupCacheKey = "";
let wanLookupCacheIp: string | null = null;
let wanLookupCacheExpiresAt = 0;
let wanLookupInFlight: Promise<string | null> | null = null;
let publicBaseLogSignature = "";
const outboundSensitiveGuardSignatures = new Set<string>();
const sensitiveHttpRateLimitSignatures = new Set<string>();
let clientIndexCacheStamp = "";
let clientIndexCacheHtml = "";
let controlDeckCatalog: Record<string, Array<{ id: string; labelShort: string }>> = {};
const sensitiveHttpRateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function renderClientIndexHtml(identityMode: IdentityMode): string {
  const indexPath = path.join(CLIENT_DIST, "index.html");
  const stats = fs.statSync(indexPath);
  const stamp = `${stats.mtimeMs}:${identityMode}`;
  if (stamp === clientIndexCacheStamp && clientIndexCacheHtml.length > 0) {
    return clientIndexCacheHtml;
  }

  const raw = fs.readFileSync(indexPath, "utf8");
  const runtimeScript =
    `<script>` +
    `window.__BUNKER_IDENTITY_MODE__=${JSON.stringify(identityMode)};` +
    `window.__BUNKER_DEV_TAB_IDENTITY__=${identityMode === "dev_tab" ? "true" : "false"};` +
    `</script>`;
  const injected = raw.includes("</head>")
    ? raw.replace("</head>", `${runtimeScript}\n</head>`)
    : `${runtimeScript}\n${raw}`;

  clientIndexCacheStamp = stamp;
  clientIndexCacheHtml = injected;
  return injected;
}

function shouldUseColor(): boolean {
  const force = envFlag(process.env.FORCE_COLOR);
  const noColor = envFlag(process.env.NO_COLOR);
  if (force) return true;
  if (noColor) return false;
  // Default: keep colors enabled, even if stdout.isTTY=false (e.g. pnpm/concurrently pipes on Windows).
  return true;
}

const COLOR_ENABLED = shouldUseColor();

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  underline: "\x1b[4m",
} as const;

function paint(text: string, ...styles: Array<keyof typeof ANSI>) {
  if (!COLOR_ENABLED || styles.length === 0) return text;
  const prefix = styles.map((style) => ANSI[style]).join("");
  return `${prefix}${text}${ANSI.reset}`;
}

function isPrivateLanIp(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
}

function selectLanIp(): string {
  const blockedTokens = [
    "nekobox",
    "vpn",
    "wintun",
    "wireguard",
    "tun",
    "tap",
    "openvpn",
    "clash",
    "warp",
    "vethernet",
    "hyper-v",
    "vmware",
    "virtual",
    "loopback",
    "docker",
    "podman",
    "wsl",
    "tailscale",
    "zerotier",
    "hamachi",
    "isatap",
    "teredo",
  ];

  let bestIp = "127.0.0.1";
  let bestScore = -1;
  const interfaces = os.networkInterfaces();

  for (const [name, addresses] of Object.entries(interfaces)) {
    const ifaceAddresses = (addresses ?? []) as Array<{
      family: string | number;
      internal: boolean;
      address: string;
    }>;
    const loweredName = name.toLowerCase();
    const blocked = blockedTokens.some((token) => loweredName.includes(token));

    for (const address of ifaceAddresses) {
      const family = typeof address.family === "string" ? address.family : String(address.family);
      if (family !== "IPv4" && family !== "4") continue;
      if (address.internal) continue;

      const ip = address.address;
      if (!ip || ip.startsWith("127.") || ip.startsWith("169.254.")) continue;

      let score = 0;
      if (isPrivateLanIp(ip)) score += 100;
      if (!blocked) score += 20;
      score += 5;

      if (score > bestScore) {
        bestScore = score;
        bestIp = ip;
      }
    }
  }

  return bestIp;
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    try {
      return new URL(`http://${trimmed}`).origin;
    } catch {
      return null;
    }
  }
}

function isLocalHostValue(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  );
}

function isLoopbackIpValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "::1" ||
    normalized === "127.0.0.1" ||
    normalized === "::ffff:127.0.0.1" ||
    normalized === "::ffff:localhost"
  );
}

function isDesktopLocalRequest(req: Request): boolean {
  const host = String(req.get("host") ?? "").trim().split(":")[0] ?? "";
  const ip = String(req.ip ?? "").trim();
  return isLocalHostValue(host) || isLoopbackIpValue(ip);
}

function isDesktopApiAuthorized(req: Request): boolean {
  if (!isDesktopLocalRequest(req)) return false;
  if (req.get("origin")) return false;
  if (!DESKTOP_API_SECRET) return false;
  const provided = String(req.get("x-bunker-desktop-secret") ?? "").trim();
  if (!provided) return false;
  const expectedBuffer = Buffer.from(DESKTOP_API_SECRET, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function hostFromOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(raw: string): Set<string> {
  const out = new Set<string>();
  const parts = raw
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of parts) {
    if (entry === "*") {
      out.add("*");
      continue;
    }
    const normalized = normalizeOrigin(entry);
    if (normalized) {
      out.add(normalized);
    }
  }

  return out;
}

const ALLOWED_ORIGINS = parseAllowedOrigins(ALLOWED_ORIGINS_RAW);
const ALLOW_ALL_ORIGINS = ALLOWED_ORIGINS.has("*");

function buildRequestOrigin(protocol: string | undefined, hostHeader: string | undefined): string | null {
  const host = String(hostHeader ?? "").trim();
  if (!host) return null;
  const scheme = String(protocol ?? "http").trim().toLowerCase();
  const normalizedScheme = scheme === "https" ? "https" : "http";
  return normalizeOrigin(`${normalizedScheme}://${host}`);
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasCyrillic(value: string): boolean {
  return /[\u0400-\u04FF]/.test(String(value ?? ""));
}

function renderAccessDeniedHtml(options: { title: string; message: string; homeHref: string; buttonLabel: string }): string {
  const title = escapeHtml(options.title);
  const message = escapeHtml(options.message);
  const shouldShowMessage = message.length > 0 && message !== title;
  const homeHref = escapeHtml(options.homeHref || "/");
  const buttonLabel = escapeHtml(options.buttonLabel);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f1210;
        --panel: #161b19;
        --border: #2b332e;
        --text: #f4f1ea;
        --muted: #b8b2a6;
        --accent: #8fd3b6;
        --accent-strong: #6cb79b;
        --on-accent: #0c1110;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        display: grid;
        place-items: center;
        font-family: "IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif;
        background:
          radial-gradient(120% 90% at 20% 0%, rgba(143, 211, 182, 0.14), transparent 58%),
          linear-gradient(180deg, #111612, var(--bg));
        color: var(--text);
        padding: 20px;
      }
      .card {
        width: min(560px, 100%);
        border: 1px solid color-mix(in oklab, var(--border) 84%, var(--accent) 16%);
        border-radius: 18px;
        background:
          radial-gradient(140% 90% at 50% 0%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 62%),
          linear-gradient(180deg, color-mix(in oklab, var(--panel) 88%, #0e1412 12%), var(--panel));
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
        padding: clamp(20px, 4vw, 32px);
        text-align: center;
      }
      .title {
        margin: 0 0 10px;
        font-size: clamp(24px, 3.3vw, 32px);
        line-height: 1.12;
      }
      .message {
        margin: 0;
        color: var(--muted);
      }
      .actions {
        margin-top: 18px;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 10px 16px;
        border-radius: 10px;
        border: 1px solid color-mix(in oklab, var(--accent-strong) 54%, var(--border) 46%);
        text-decoration: none;
        color: var(--on-accent);
        background: linear-gradient(180deg, var(--accent), var(--accent-strong));
        font-weight: 600;
      }
      .button:hover {
        border-color: color-mix(in oklab, var(--accent) 72%, var(--border) 28%);
        filter: brightness(1.05);
      }
    </style>
  </head>
  <body>
    <main class="card" role="main" aria-live="polite">
      <h1 class="title">${title}</h1>
      ${shouldShowMessage ? `<p class="message">${message}</p>` : ""}
      <div class="actions">
        <a class="button" href="${homeHref}">${buttonLabel}</a>
      </div>
    </main>
  </body>
</html>`;
}

function sendAccessDeniedPage(
  res: Response,
  options: { roomCode?: string; title: string; message: string; status?: number }
): void {
  const roomCode = String(options.roomCode ?? "")
    .trim()
    .toUpperCase();
  const homeHref = roomCode ? `/?room=${encodeURIComponent(roomCode)}` : "/";
  const buttonLabel = hasCyrillic(options.title) || hasCyrillic(options.message)
    ? "В главное меню игры"
    : "Back to main menu";
  res
    .status(options.status ?? 403)
    .type("text/html; charset=utf-8")
    .send(
      renderAccessDeniedHtml({
        title: options.title,
        message: options.message,
        homeHref,
        buttonLabel,
      })
    );
}

function getUpgradeRequestProtocol(req: IncomingMessage): "http" | "https" {
  if (TRUST_PROXY) {
    const forwarded = req.headers["x-forwarded-proto"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = String(raw ?? "")
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .find(Boolean);
    if (first === "https" || first === "http") {
      return first;
    }
  }
  const socketLike = req.socket as { encrypted?: boolean };
  return socketLike.encrypted ? "https" : "http";
}

function getUpgradeRequestOrigin(req: IncomingMessage): string | null {
  const hostHeader = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  return buildRequestOrigin(getUpgradeRequestProtocol(req), hostHeader);
}

function isOriginAllowed(
  originHeader: string | undefined,
  requestOrigin: string | null,
  options?: { allowMissingOrigin?: boolean }
): boolean {
  const allowMissingOrigin = options?.allowMissingOrigin ?? true;
  const normalizedOrigin = normalizeOrigin(originHeader);
  if (!normalizedOrigin) {
    return allowMissingOrigin;
  }

  if (ALLOW_ALL_ORIGINS) return true;
  if (!ENFORCE_ORIGIN_CHECKS && ALLOWED_ORIGINS.size === 0) return true;
  if (ALLOWED_ORIGINS.has(normalizedOrigin)) return true;
  if (requestOrigin && normalizedOrigin === requestOrigin) return true;

  const originHost = hostFromOrigin(normalizedOrigin);
  if (IDENTITY_MODE === "dev_tab" && originHost && isLocalHostValue(originHost)) {
    return true;
  }

  return false;
}

function applyCorsHeaders(req: Request, res: Response): boolean {
  const originHeader = req.get("origin");
  const requestOrigin = buildRequestOrigin(req.protocol, req.get("host"));
  const allowed = isOriginAllowed(originHeader, requestOrigin, { allowMissingOrigin: true });
  const permissiveMode = ALLOW_ALL_ORIGINS || (!ENFORCE_ORIGIN_CHECKS && ALLOWED_ORIGINS.size === 0);

  if (permissiveMode) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (originHeader && allowed) {
    const normalizedOrigin = normalizeOrigin(originHeader);
    if (normalizedOrigin) {
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Origin", normalizedOrigin);
    }
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return allowed;
}

function normalizeIpForRateLimit(req: Request): string {
  const raw = String(req.ip || "").trim();
  if (!raw) return "unknown";
  return raw;
}

function touchSensitiveHttpRateLimitBucket(key: string, now: number): { count: number; resetAt: number } {
  const existing = sensitiveHttpRateLimitBuckets.get(key);
  if (!existing || now >= existing.resetAt) {
    const next = { count: 1, resetAt: now + SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS };
    sensitiveHttpRateLimitBuckets.set(key, next);
    return next;
  }

  const next = { count: existing.count + 1, resetAt: existing.resetAt };
  sensitiveHttpRateLimitBuckets.set(key, next);
  return next;
}

function maybeCleanupSensitiveHttpRateBuckets(now: number): void {
  if (sensitiveHttpRateLimitBuckets.size < 2048) return;
  for (const [key, bucket] of sensitiveHttpRateLimitBuckets.entries()) {
    if (now >= bucket.resetAt) {
      sensitiveHttpRateLimitBuckets.delete(key);
    }
  }
}

function isValidIpv4(value: string): boolean {
  const match = value.trim().match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!match) return false;
  const parts = value.trim().split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255);
}

function isValidPublicIpv4(value: string): boolean {
  if (!isValidIpv4(value)) return false;
  const [a, b] = value.split(".").map((part) => Number(part));
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

function normalizeDomainBase(value: string, allowLocalhost: boolean): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!allowLocalhost && isLocalHostValue(parsed.hostname)) return null;
    const host = parsed.hostname;
    if (!host) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

function normalizePublicHostBase(value: string, port: number, allowLocalhost: boolean): string | null {
  const raw = value.trim();
  if (!raw) return null;

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withScheme);
    if (!allowLocalhost && isLocalHostValue(parsed.hostname)) return null;
    if (!parsed.hostname) return null;
    const scheme = parsed.protocol === "https:" ? "https" : "http";
    if (parsed.port && parsed.port.length > 0) {
      return `${scheme}://${parsed.hostname}:${parsed.port}`;
    }
    return `${scheme}://${parsed.hostname}:${port}`;
  } catch {
    return null;
  }
}

async function fetchPublicIp(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAN_LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const value = (await response.text()).trim();
    if (!isValidPublicIpv4(value)) return null;
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupWanIp(): Promise<string | null> {
  const primary = await fetchPublicIp("https://api.ipify.org");
  if (primary) return primary;
  return fetchPublicIp("https://ifconfig.me/ip");
}

async function resolveWanIpCached(cacheKey: string): Promise<string | null> {
  const now = Date.now();
  if (wanLookupCacheKey !== cacheKey) {
    wanLookupCacheKey = cacheKey;
    wanLookupCacheIp = null;
    wanLookupCacheExpiresAt = 0;
    wanLookupInFlight = null;
  }

  if (wanLookupCacheExpiresAt > now) {
    return wanLookupCacheIp;
  }

  if (wanLookupInFlight) {
    return wanLookupInFlight;
  }

  wanLookupInFlight = (async () => {
    const ip = await lookupWanIp();
    wanLookupCacheIp = ip;
    wanLookupCacheExpiresAt = Date.now() + WAN_LOOKUP_CACHE_TTL_MS;
    return ip;
  })();

  try {
    return await wanLookupInFlight;
  } finally {
    wanLookupInFlight = null;
  }
}

type PublicBaseSource = "DOMAIN" | "PUBLIC_ORIGIN" | "PUBLIC_HOST" | "WAN_LOOKUP" | "EMPTY";

interface PublicBaseResolution {
  base?: string;
  source: PublicBaseSource;
}

function logPublicBaseResolution(resolution: PublicBaseResolution) {
  const signature = `${resolution.source}|${resolution.base ?? ""}`;
  if (signature === publicBaseLogSignature) return;
  publicBaseLogSignature = signature;
  console.log(`[links] publicBase source=${resolution.source} value=${resolution.base ?? "<empty>"}`);
}

async function resolvePublicBase(port: number): Promise<PublicBaseResolution> {
  const allowLocalhost = IDENTITY_MODE === "dev_tab";

  const domainBase = normalizeDomainBase(DOMAIN ?? "", allowLocalhost);
  if (domainBase) {
    return { source: "DOMAIN", base: domainBase };
  }

  const originBase = normalizeOrigin(PUBLIC_ORIGIN ?? "");
  if (originBase) {
    const host = hostFromOrigin(originBase);
    if (allowLocalhost || (host && !isLocalHostValue(host))) {
      return { source: "PUBLIC_ORIGIN", base: originBase };
    }
  }

  const publicHostBase = normalizePublicHostBase(PUBLIC_HOST ?? "", port, allowLocalhost);
  if (publicHostBase) {
    return { source: "PUBLIC_HOST", base: publicHostBase };
  }

  const wanCacheKey = [
    String(port),
    IDENTITY_MODE,
    DOMAIN ?? "",
    PUBLIC_ORIGIN ?? "",
    PUBLIC_HOST ?? "",
  ].join("|");
  const wanIp = await resolveWanIpCached(wanCacheKey);
  if (wanIp) {
    return { source: "WAN_LOOKUP", base: `http://${wanIp}:${port}` };
  }

  return { source: "EMPTY" };
}

function buildLinkOrigins(requestOrigin?: string): {
  lanOrigin: string;
  lanIp: string;
} {
  const allowLocalhost = IDENTITY_MODE === "dev_tab";
  const requestHost = hostFromOrigin(normalizeOrigin(requestOrigin) ?? undefined);
  let lanIp = requestHost || selectLanIp();
  if (!allowLocalhost && isLocalHostValue(lanIp)) {
    if (HOST && HOST !== "0.0.0.0") {
      lanIp = HOST;
    } else {
      // 0.0.0.0 is a bind address and is not fetchable as a client URL.
      lanIp = "127.0.0.1";
    }
  }

  const lanOrigin = `http://${lanIp}:${LISTEN_PORT}`;
  return { lanOrigin, lanIp };
}

function printOverlayInfo(
  roomCode: string,
  token: string,
  controlToken?: string,
  controlInviteToken?: string,
  overlayQueryParams?: Record<string, string>,
  spectatorToken?: string
) {
  const { lanOrigin } = buildLinkOrigins();
  const inviteTokenForLinks = controlInviteToken ?? "<CONTROL_INVITE_TOKEN>";
  const links = buildLinkSet({
    lanBase: lanOrigin,
    publicBase: undefined,
    roomCode,
    overlayViewToken: token,
    spectatorViewToken: spectatorToken ?? token,
    overlayControlToken: controlToken ?? "<CONTROL_OR_EDIT_TOKEN>",
    overlayControlInviteToken: inviteTokenForLinks,
    overlayQueryParams,
  });

  const line = "-".repeat(72);

  console.log(paint(line, "dim"));
  console.log(paint("OBS OVERLAY", "bold", "cyan"));
  console.log(`${paint("Room:", "yellow")}        ${paint(roomCode, "bold", "yellow")}`);
  console.log(`${paint("Token:", "magenta")}       ${paint(fingerprintForLog(token), "magenta")}`);
  if (!HIDE_LOCAL_LINKS_IN_LOGS) {
    console.log(`${paint("App LAN:", "blue")}     ${paint(redactUrlForLog(links.appUrl.lan), "underline", "blue")}`);
    console.log(`${paint("Spec LAN:", "green")}    ${paint(redactUrlForLog(links.viewerUrl.lan), "underline", "green")}`);
    console.log(`${paint("View LAN:", "cyan")}    ${paint(redactUrlForLog(links.overlayViewUrl.lan), "underline", "cyan")}`);
    console.log(`${paint("Dbg LAN:", "yellow")}     ${paint(redactUrlForLog(links.overlayDebugUrl.lan), "underline", "yellow")}`);
    console.log(`${paint("Ctrl LAN:", "magenta")}   ${paint(redactUrlForLog(links.overlayControlUrl.lan), "underline", "magenta")}`);
    console.log(`${paint("API LAN:", "blue")}     ${paint(redactUrlForLog(links.overlayControlStateUrl.lan), "underline", "blue")}`);
  } else {
    console.log(paint("LAN links are hidden for this server profile.", "dim"));
  }
  console.log(`${paint("Presets:", "blue")}     see docs -> overlay_presets.txt`);
  console.log(paint("Tip: Add as OBS Browser Source (transparent background).", "dim"));
  console.log(paint(line, "dim"));

  void resolvePublicBase(LISTEN_PORT)
    .then((resolution) => {
      logPublicBaseResolution(resolution);
      if (!resolution.base) return;
      const publicLinks = buildLinkSet({
        lanBase: lanOrigin,
        publicBase: resolution.base,
        roomCode,
        overlayViewToken: token,
        spectatorViewToken: spectatorToken ?? token,
        overlayControlToken: controlToken ?? "<CONTROL_OR_EDIT_TOKEN>",
        overlayControlInviteToken: inviteTokenForLinks,
        overlayQueryParams,
      });
      console.log(
        `${paint("App Ext:", "blue")}     ${paint(redactUrlForLog(publicLinks.appUrl.public ?? ""), "underline", "blue")}`
      );
      console.log(
        `${paint("Spec Ext:", "green")}    ${paint(redactUrlForLog(publicLinks.viewerUrl.public ?? ""), "underline", "green")}`
      );
      console.log(
        `${paint("View Ext:", "cyan")}    ${paint(redactUrlForLog(publicLinks.overlayViewUrl.public ?? ""), "underline", "cyan")}`
      );
      if (publicLinks.overlayDebugUrl.public) {
        console.log(
          `${paint("Dbg Ext:", "yellow")}     ${paint(redactUrlForLog(publicLinks.overlayDebugUrl.public), "underline", "yellow")}`
        );
      }
      console.log(
        `${paint("Ctrl Ext:", "magenta")}   ${paint(
          redactUrlForLog(publicLinks.overlayControlUrl.public ?? ""),
          "underline",
          "magenta"
        )}`
      );
      console.log(
        `${paint("API Ext:", "blue")}     ${paint(
          redactUrlForLog(publicLinks.overlayControlStateUrl.public ?? ""),
          "underline",
          "blue"
        )}`
      );
      console.log(paint(line, "dim"));
    })
    .catch(() => {
      // ignore public lookup errors in console helper
    });
}

function unrefTimer(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | undefined) {
  if (timer && typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
}

function fingerprintForLog(value: string): string {
  if (!value) return "<empty>";
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function redactUrlForLog(rawUrl: string): string {
  if (!rawUrl) return "<empty>";
  try {
    const url = new URL(rawUrl);
    for (const key of Array.from(url.searchParams.keys())) {
      url.searchParams.set(key, "<redacted>");
    }
    if (url.hash) {
      url.hash = "<redacted>";
    }
    return url.toString();
  } catch {
    return rawUrl.replace(/([?&][^=]+=)([^&]+)/g, "$1<redacted>");
  }
}

function formatLogValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "<empty>";
  if (typeof value === "string") {
    if (/(token|secret|password|session|cookie|auth|bearer|key)$/i.test(key)) {
      return fingerprintForLog(value);
    }
    if (/^https?:\/\//i.test(value)) {
      return redactUrlForLog(value);
    }
    return value;
  }
  if (value instanceof URL) {
    return redactUrlForLog(value.toString());
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "object") {
    return Array.isArray(value) ? `[array:${value.length}]` : "[object]";
  }
  return String(value);
}

function logRoomLifecycle(event: string, roomCode: string, details: Record<string, unknown>) {
  const payload =
    Object.entries(details)
      .map(([key, value]) => `${key}=${formatLogValue(key, value)}`)
      .join(" ") || "-";
  console.log(`[room] ${event} room:${roomCode} ${payload}`);
}

function logProtocol(event: string, details: Record<string, unknown>) {
  void event;
  void details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return clampNumber(Math.round(value), min, max);
}

const DECK_LABEL_TO_ID: Record<string, string> = {
  profession: "profession",
  health: "health",
  hobby: "hobby",
  baggage: "baggage",
  fact: "fact",
  facts: "fact",
  biology: "biology",
  special: "special",
  bunker: "bunker",
  disaster: "disaster",
  threat: "threat",
  back: "back",
  "профессия": "profession",
  "здоровье": "health",
  "хобби": "hobby",
  "багаж": "baggage",
  "факты": "fact",
  "биология": "biology",
  "особые условия": "special",
  "бункер": "bunker",
  "катастрофа": "disaster",
  "угроза": "threat",
  "рубашки": "back",
};

function normalizeDeckLookup(value: string): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function resolveDeckIdFromAssetCard(card: AssetCatalog["decks"][string][number], deckName: string): string | undefined {
  const fromCard = normalizeDeckLookup(String(card.deckId ?? ""));
  if (fromCard && DECK_LABEL_TO_ID[fromCard]) return DECK_LABEL_TO_ID[fromCard];

  const fromDeckName = normalizeDeckLookup(deckName);
  if (fromDeckName && DECK_LABEL_TO_ID[fromDeckName]) return DECK_LABEL_TO_ID[fromDeckName];

  const assetId = String(card.id ?? "").trim();
  if (!assetId) return undefined;
  const parts = assetId.split("/").filter(Boolean);
  if (parts.length < 2) return undefined;
  const fromPath = normalizeDeckLookup(parts[parts.length - 2] ?? "");
  if (!fromPath) return undefined;
  return DECK_LABEL_TO_ID[fromPath];
}

function findDeckById(assets: AssetCatalog, deckId: string): AssetCatalog["decks"][string] {
  const target = normalizeDeckLookup(deckId);
  for (const [deckName, cards] of Object.entries(assets.decks)) {
    if (!cards.length) continue;
    if (normalizeDeckLookup(deckName) === target) return cards;
    const resolved = resolveDeckIdFromAssetCard(cards[0], deckName);
    if (resolved === target) return cards;
  }
  return [];
}

function buildDisasterOptions(assets: AssetCatalog): Array<{ id: string; title: string }> {
  const deck = findDeckById(assets, "disaster");
  const unique = new Map<string, string>();
  for (const card of deck) {
    const id = card.id?.trim();
    if (!id || unique.has(id)) continue;
    const title = card.labelShort?.trim() || id;
    unique.set(id, title);
  }
  return Array.from(unique.entries())
    .map(([id, title]) => ({ id, title }))
    .sort((left, right) => left.title.localeCompare(right.title, "ru-RU"));
}

function normalizeForcedDisasterId(
  value: string | undefined,
  options: Array<{ id: string; title: string }>
): string {
  const next = (value ?? "").trim();
  if (!next || next === "random") return "random";
  return options.some((item) => item.id === next) ? next : "random";
}

function getRequiredVotes(playerCount: number, bunkerSlots: number): number {
  return Math.max(0, clampInt(playerCount, 0, 64) - clampInt(bunkerSlots, 1, 16));
}

function normalizeVotesByRound(votes: number[]): number[] {
  const normalized = votes
    .slice(0, MANUAL_MAX_ROUNDS)
    .map((vote) => clampInt(vote, 0, MANUAL_MAX_VOTES_PER_ROUND));
  if (normalized.length === 0) {
    normalized.push(0);
  }
  return normalized;
}

function seedManualConfigFromPreset(presetCount: number): ManualRulesConfig {
  const preset = getRulesetForPlayerCount(presetCount);
  return {
    bunkerSlots: clampInt(preset.bunkerSeats, 1, 16),
    votesByRound: normalizeVotesByRound([...preset.votesPerRound]),
    targetReveals: MANUAL_DEFAULT_TARGET_REVEALS,
    seedTemplatePlayers: clampInt(presetCount, 4, 16),
  };
}

function normalizeManualConfig(
  input: ManualRulesConfig,
  fallbackPresetCount: number
): ManualRulesConfig {
  const seedTemplatePlayers = clampInt(
    input.seedTemplatePlayers ?? fallbackPresetCount,
    4,
    16
  );
  const bunkerSlots = clampInt(input.bunkerSlots, 1, 16);
  const votesByRound = normalizeVotesByRound(input.votesByRound);
  const targetReveals = clampInt(
    input.targetReveals ?? MANUAL_DEFAULT_TARGET_REVEALS,
    MANUAL_MIN_TARGET_REVEALS,
    MANUAL_MAX_TARGET_REVEALS
  );
  return {
    bunkerSlots,
    votesByRound,
    targetReveals,
    seedTemplatePlayers,
  };
}

function buildAutoRuleset(playerCount: number): GameRuleset {
  const preset = getRulesetForPlayerCount(playerCount);
  return {
    ...preset,
    rulesetMode: "auto",
    manualConfig: undefined,
  };
}

function buildPresetRuleset(playerCount: number): GameRuleset {
  const preset = getRulesetForPlayerCount(playerCount);
  return {
    ...preset,
    rulesetMode: "preset",
    manualConfig: undefined,
  };
}

function buildManualRuleset(manualConfig: ManualRulesConfig, playerCount: number): GameRuleset {
  const normalized = normalizeManualConfig(
    manualConfig,
    manualConfig.seedTemplatePlayers ?? playerCount
  );
  const effectivePlayerCount = clampInt(playerCount, 4, 16);
  const requiredVotes = getRequiredVotes(effectivePlayerCount, normalized.bunkerSlots);
  return {
    playerCount: effectivePlayerCount,
    votesPerRound: [...normalized.votesByRound],
    totalExiles: requiredVotes,
    bunkerSeats: normalized.bunkerSlots,
    rulesetMode: "manual",
    manualConfig: normalized,
  };
}

function sanitizeSingleLine(value: unknown, maxLength: number): string {
  const text = String(value ?? "");
  const normalized = text
    .replace(/\r\n?/g, " ")
    .replace(/[—–]/g, "-")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);
  return normalized;
}

function sanitizeMultiLine(value: unknown, maxLength: number): string {
  const text = String(value ?? "");
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .replace(/[—–]/g, "-")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, maxLength);
  return normalized;
}

function sanitizeOverlayBackgroundPreset(value: unknown): string | undefined {
  const sanitized = sanitizeSingleLine(value, OVERLAY_MAX_BACKGROUND_PRESET_LEN)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return sanitized || undefined;
}

function sanitizeOverlayUrlParamKey(value: unknown): string {
  return sanitizeSingleLine(value, OVERLAY_MAX_URL_PARAM_KEY_LEN)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}

function sanitizeOverlayUrlParams(source: unknown): Record<string, string> | undefined {
  if (!isRecord(source)) return undefined;
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (Object.keys(out).length >= OVERLAY_MAX_URL_PARAMS) break;
    const key = sanitizeOverlayUrlParamKey(rawKey);
    if (!key || OVERLAY_RESERVED_URL_PARAMS.has(key)) continue;
    const value = sanitizeSingleLine(rawValue, OVERLAY_MAX_URL_PARAM_VALUE_LEN).trim();
    if (!value) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function encodeAssetPathSegments(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function buildOverlayBackgroundUrl(relativeSegments: string[]): string {
  return `${LINK_PATHS.overlayAssets}/backgrounds/${encodeAssetPathSegments(relativeSegments)}`;
}

function pickOverlayLayoutFileName(dirPath: string, aliases: string[]): string | undefined {
  if (!fs.existsSync(dirPath)) return undefined;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  for (const alias of aliases) {
    const found = files.find((entry) => {
      const parsed = path.parse(entry.name);
      return (
        parsed.name.toLowerCase() === alias &&
        OVERLAY_BACKGROUND_ALLOWED_EXTS.has(parsed.ext.toLowerCase())
      );
    });
    if (found) return found.name;
  }
  return undefined;
}

function collectOverlayBackgroundLayouts(
  dirPath: string,
  relativeSegments: string[]
): OverlayBackgroundPresetLayouts {
  const layouts: OverlayBackgroundPresetLayouts = {};
  const fileL4 = pickOverlayLayoutFileName(dirPath, OVERLAY_LAYOUT_FILE_ALIASES.l4);
  const fileL8 = pickOverlayLayoutFileName(dirPath, OVERLAY_LAYOUT_FILE_ALIASES.l8);
  const fileL12 = pickOverlayLayoutFileName(dirPath, OVERLAY_LAYOUT_FILE_ALIASES.l12);

  if (fileL4) layouts.l4 = buildOverlayBackgroundUrl([...relativeSegments, fileL4]);
  if (fileL8) layouts.l8 = buildOverlayBackgroundUrl([...relativeSegments, fileL8]);
  if (fileL12) layouts.l12 = buildOverlayBackgroundUrl([...relativeSegments, fileL12]);
  return layouts;
}

function hasOverlayBackgroundLayouts(layouts: OverlayBackgroundPresetLayouts): boolean {
  return Boolean(layouts.l4 || layouts.l8 || layouts.l12);
}

function makeUniquePresetId(baseId: string, used: Set<string>): string {
  let id = baseId;
  let suffix = 2;
  while (used.has(id)) {
    const maxBaseLength = Math.max(1, OVERLAY_MAX_BACKGROUND_PRESET_LEN - 4);
    id = `${baseId.slice(0, maxBaseLength)}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function getOverlayBackgroundCatalog(): OverlayBackgroundCatalog {
  if (!fs.existsSync(OVERLAY_BACKGROUNDS_ROOT)) {
    return { defaultPreset: "default", presets: [] };
  }

  const presets: OverlayBackgroundPreset[] = [];
  const usedIds = new Set<string>();

  const rootLayouts = collectOverlayBackgroundLayouts(OVERLAY_BACKGROUNDS_ROOT, []);
  if (hasOverlayBackgroundLayouts(rootLayouts)) {
    presets.push({
      id: makeUniquePresetId("default", usedIds),
      label: "default",
      layouts: rootLayouts,
    });
  }

  const entries = fs.readdirSync(OVERLAY_BACKGROUNDS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const folderName = entry.name;
    const folderPath = path.join(OVERLAY_BACKGROUNDS_ROOT, folderName);
    const layouts = collectOverlayBackgroundLayouts(folderPath, [folderName]);
    if (!hasOverlayBackgroundLayouts(layouts)) continue;

    const presetIdBase = sanitizeOverlayBackgroundPreset(folderName) ?? "preset";
    const presetId = makeUniquePresetId(presetIdBase, usedIds);
    presets.push({
      id: presetId,
      label: folderName,
      layouts,
    });
  }

  const defaultPreset = presets[0]?.id ?? "default";
  return { defaultPreset, presets };
}

function resolveOverlayPresetsFilePath(): string | null {
  if (fs.existsSync(OVERLAY_PRESETS_FILE_PRIMARY)) return OVERLAY_PRESETS_FILE_PRIMARY;
  if (fs.existsSync(OVERLAY_PRESETS_FILE_FALLBACK)) return OVERLAY_PRESETS_FILE_FALLBACK;
  return null;
}

function parseOverlayUrlPresets(text: string): OverlayUrlPreset[] {
  const presets: OverlayUrlPreset[] = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let current: Partial<OverlayUrlPreset> | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const label = sanitizeSingleLine(current.label ?? "", 120);
    const urlTemplate = sanitizeSingleLine(current.urlTemplate ?? "", 2048);
    if (!label || !urlTemplate) {
      current = null;
      return;
    }
    const normalizedId =
      sanitizeOverlayBackgroundPreset(label)?.slice(0, OVERLAY_MAX_BACKGROUND_PRESET_LEN) ??
      `preset-${presets.length + 1}`;
    const id = makeUniquePresetId(normalizedId, new Set(presets.map((item) => item.id)));
    presets.push({
      id,
      label,
      urlTemplate,
      comment: sanitizeSingleLine(current.comment ?? "", 240) || undefined,
    });
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      pushCurrent();
      current = { label: sectionMatch[1] };
      continue;
    }
    if (!current) continue;
    if (/^url\s*:/i.test(trimmed)) {
      current.urlTemplate = trimmed.replace(/^url\s*:/i, "").trim();
      continue;
    }
    if (/^comment\s*:/i.test(trimmed)) {
      current.comment = trimmed.replace(/^comment\s*:/i, "").trim();
      continue;
    }
  }
  pushCurrent();
  return presets;
}

function getOverlayUrlPresets(): OverlayUrlPreset[] {
  const filePath = resolveOverlayPresetsFilePath();
  if (!filePath) return [];
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return parseOverlayUrlPresets(content);
  } catch (error) {
    console.warn("[overlay-presets] failed to parse presets file:", error);
    return [];
  }
}

function normalizeOverlayOverrides(input: unknown, room: Room): OverlayOverrides {
  const source = isRecord(input) ? input : {};
  const result: OverlayOverrides = {};

  if (isRecord(source.enabled)) {
    const enabled: NonNullable<OverlayOverrides["enabled"]> = {};
    const fields: Array<keyof NonNullable<OverlayOverrides["enabled"]>> = [
      "topBunker",
      "topCatastrophe",
      "topThreats",
      "playerNames",
      "playerTraits",
      "playerCategories",
    ];
    for (const field of fields) {
      const value = source.enabled[field];
      if (typeof value === "boolean") {
        enabled[field] = value;
      }
    }
    if (Object.keys(enabled).length > 0) {
      result.enabled = enabled;
    }
  }

  if (isRecord(source.top)) {
    const top: NonNullable<OverlayOverrides["top"]> = {};

    if (Array.isArray(source.top.bunkerLines)) {
      top.bunkerLines = source.top.bunkerLines
        .slice(0, OVERLAY_MAX_TOP_BUNKER_LINES)
        .map((line) => sanitizeSingleLine(line, OVERLAY_MAX_LINE_LEN));
    }
    if (typeof source.top.catastropheText === "string") {
      top.catastropheText = sanitizeMultiLine(source.top.catastropheText, OVERLAY_MAX_CATA_LEN);
    }
    if (Array.isArray(source.top.threatsLines)) {
      top.threatsLines = source.top.threatsLines
        .slice(0, OVERLAY_MAX_TOP_THREAT_LINES)
        .map((line) => sanitizeSingleLine(line, OVERLAY_MAX_LINE_LEN));
    }
    if (Object.keys(top).length > 0) {
      result.top = top;
    }
  }

  if (isRecord(source.players)) {
    const players: NonNullable<OverlayOverrides["players"]> = {};
    for (const [playerId, rawPlayer] of Object.entries(source.players)) {
      if (!room.players.has(playerId)) continue;
      if (!isRecord(rawPlayer)) continue;

      const playerOverride: NonNullable<OverlayOverrides["players"]>[string] = {};
      if (typeof rawPlayer.name === "string") {
        playerOverride.name = sanitizeSingleLine(rawPlayer.name, OVERLAY_MAX_NAME_LEN);
      }

      if (isRecord(rawPlayer.traits)) {
        const traits: NonNullable<
          NonNullable<OverlayOverrides["players"]>[string]["traits"]
        > = {};
        if (typeof rawPlayer.traits.sex === "string") {
          traits.sex = sanitizeSingleLine(rawPlayer.traits.sex, OVERLAY_MAX_LINE_LEN);
        }
        if (typeof rawPlayer.traits.age === "string") {
          traits.age = sanitizeSingleLine(rawPlayer.traits.age, OVERLAY_MAX_LINE_LEN);
        }
        if (typeof rawPlayer.traits.orient === "string") {
          traits.orient = sanitizeSingleLine(rawPlayer.traits.orient, OVERLAY_MAX_LINE_LEN);
        }
        if (Object.keys(traits).length > 0) {
          playerOverride.traits = traits;
        }
      }

      if (isRecord(rawPlayer.categories)) {
        const categories: Record<string, string> = {};
        for (const [categoryKey, categoryValue] of Object.entries(rawPlayer.categories)) {
          if (typeof categoryValue !== "string") continue;
          const safeKey = sanitizeSingleLine(categoryKey, 40);
          if (!safeKey) continue;
          categories[safeKey] = sanitizeSingleLine(categoryValue, OVERLAY_MAX_LINE_LEN);
        }
        if (Object.keys(categories).length > 0) {
          playerOverride.categories = categories;
        }
      }

      if (isRecord(rawPlayer.enabled)) {
        const playerEnabled: NonNullable<
          NonNullable<OverlayOverrides["players"]>[string]["enabled"]
        > = {};

        if (typeof rawPlayer.enabled.name === "boolean") {
          playerEnabled.name = rawPlayer.enabled.name;
        }
        if (typeof rawPlayer.enabled.traits === "boolean") {
          playerEnabled.traits = rawPlayer.enabled.traits;
        }
        if (isRecord(rawPlayer.enabled.categories)) {
          const categoriesEnabled: Record<string, boolean> = {};
          for (const [categoryKey, rawEnabled] of Object.entries(rawPlayer.enabled.categories)) {
            if (typeof rawEnabled !== "boolean") continue;
            const safeKey = sanitizeSingleLine(categoryKey, 40);
            if (!safeKey) continue;
            categoriesEnabled[safeKey] = rawEnabled;
          }
          if (Object.keys(categoriesEnabled).length > 0) {
            playerEnabled.categories = categoriesEnabled;
          }
        }
        if (Object.keys(playerEnabled).length > 0) {
          playerOverride.enabled = playerEnabled;
        }
      }

      if (Object.keys(playerOverride).length > 0) {
        players[playerId] = playerOverride;
      }
    }

    if (Object.keys(players).length > 0) {
      result.players = players;
    }
  }

  if (Array.isArray(source.extraTexts)) {
    const extraTexts: NonNullable<OverlayOverrides["extraTexts"]> = [];
    for (const [index, rawItem] of source.extraTexts.slice(0, OVERLAY_MAX_EXTRA_TEXTS).entries()) {
      if (!isRecord(rawItem)) continue;
      const rawId = sanitizeSingleLine(rawItem.id, 64);
      const id = rawId.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9_-]/g, "") || `text-${index + 1}`;
      const text = sanitizeSingleLine(rawItem.text, OVERLAY_MAX_LINE_LEN);
      const x = clampNumber(Number(rawItem.x), 0, 1);
      const y = clampNumber(Number(rawItem.y), 0, 1);
      const align =
        rawItem.align === "left" || rawItem.align === "center" || rawItem.align === "right"
          ? rawItem.align
          : undefined;
      const size =
        Number.isFinite(Number(rawItem.size)) && Number(rawItem.size) > 0
          ? clampNumber(Number(rawItem.size), 8, 96)
          : undefined;
      const color = typeof rawItem.color === "string" ? sanitizeSingleLine(rawItem.color, 32) : undefined;
      const shadow = typeof rawItem.shadow === "boolean" ? rawItem.shadow : undefined;
      const visible = typeof rawItem.visible === "boolean" ? rawItem.visible : undefined;
      extraTexts.push({ id, text, x, y, align, size, color, shadow, visible });
    }
    result.extraTexts = extraTexts;
  }

  if (typeof source.backgroundPreset === "string") {
    const preset = sanitizeOverlayBackgroundPreset(source.backgroundPreset);
    if (preset) {
      result.backgroundPreset = preset;
    }
  }

  const overlayUrlParams = sanitizeOverlayUrlParams(source.overlayUrlParams);
  if (overlayUrlParams) {
    result.overlayUrlParams = overlayUrlParams;
  }

  return result;
}

if (!fs.existsSync(ASSETS_ROOT)) {
  console.error(`[server] Assets root not found: ${ASSETS_ROOT}`);
  process.exit(1);
}
if (SERVE_CLIENT && !fs.existsSync(CLIENT_DIST)) {
  console.error(`[server] Client dist not found: ${CLIENT_DIST}`);
  process.exit(1);
}
if (!fs.existsSync(OVERLAY_PUBLIC_ROOT)) {
  console.error(`[server] Overlay assets not found: ${OVERLAY_PUBLIC_ROOT}`);
  process.exit(1);
}

const BACK_DECK_DIR_NAME = "Back";
const KNOWN_ASSET_VARIANTS = ["1x", "2x"] as const;
const DEFAULT_ASSET_LOCALE = "ru";
const KNOWN_CARD_LOCALES = ["ru", "en"] as const;
type CardLocaleCode = (typeof KNOWN_CARD_LOCALES)[number];
type CardLocaleDictionary = {
  decks: Record<string, string>;
  cards: Record<string, string>;
};

const normalizeCardLocale = (value: unknown): CardLocaleCode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "en" ? "en" : "ru";
};

const normalizeCardKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");

const transliterateCyrillic = (value: string): string => {
  const mapping: Record<string, string> = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
  };

  return value
    .toLowerCase()
    .split("")
    .map((char) => mapping[char] ?? char)
    .join("");
};

const toCardIdFromFileName = (fileName: string, deckId: string): string => {
  const withoutExt = fileName.replace(/\.[a-z0-9]{2,4}$/i, "");
  const prefix = `${deckId}.`;
  if (withoutExt.toLowerCase().startsWith(prefix)) {
    return withoutExt.slice(prefix.length);
  }
  return transliterateCyrillic(withoutExt);
};

function readCardLocaleDictionary(assetsRoot: string, locale: CardLocaleCode): CardLocaleDictionary {
  const candidatePaths = [
    path.resolve(assetsRoot, "..", "locales", "cards", `${locale}.json`),
    path.resolve(assetsRoot, "..", "..", "locales", "cards", `${locale}.json`),
    path.resolve(assetsRoot, "..", "locales", `${locale}.json`),
    path.resolve(assetsRoot, "..", "..", "locales", `${locale}.json`),
    path.join(assetsRoot, "locales", "cards", `${locale}.json`),
    path.join(assetsRoot, "decks", "locales", `${locale}.json`),
  ];

  const filePath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!filePath) {
    console.warn(`[assets] locale dictionary not found for ${locale}. Checked: ${candidatePaths.join(" | ")}`);
    return { decks: {}, cards: {} };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { decks?: unknown; cards?: unknown };
    const decks =
      parsed.decks && typeof parsed.decks === "object" ? (parsed.decks as Record<string, string>) : {};
    const cards =
      parsed.cards && typeof parsed.cards === "object" ? (parsed.cards as Record<string, string>) : {};
    return { decks, cards };
  } catch (error) {
    console.warn(`[assets] failed to read locale dictionary ${filePath}:`, error);
    return { decks: {}, cards: {} };
  }
}

const CARD_LOCALE_DICTIONARIES: Record<CardLocaleCode, CardLocaleDictionary> = {
  ru: readCardLocaleDictionary(ASSETS_ROOT, "ru"),
  en: readCardLocaleDictionary(ASSETS_ROOT, "en"),
};

function resolveCardKeyFromAssetId(assetId: string): { deckId: string; cardId: string } | null {
  const normalized = String(assetId ?? "").trim();
  if (!normalized) return null;
  const parts = normalized.split("/").filter(Boolean);
  const decksIndex = parts.findIndex((part) => part.toLowerCase() === "decks");
  if (decksIndex < 0) return null;
  const tail = parts.slice(decksIndex + 1);
  if (tail.length < 2) return null;

  let cursor = 0;
  const maybeVariant = tail[cursor]?.toLowerCase();
  if (
    maybeVariant &&
    KNOWN_ASSET_VARIANTS.includes(maybeVariant as (typeof KNOWN_ASSET_VARIANTS)[number])
  ) {
    cursor += 1;
  }

  const maybeLocale = tail[cursor]?.toLowerCase();
  if (maybeLocale && KNOWN_CARD_LOCALES.includes(maybeLocale as CardLocaleCode)) {
    cursor += 1;
  }

  const deckSegment = tail[cursor];
  const fileSegment = tail[tail.length - 1];
  if (!deckSegment || !fileSegment) return null;

  const deckId = normalizeCardKey(deckSegment);
  const cardId = normalizeCardKey(toCardIdFromFileName(fileSegment, deckId));
  if (!deckId || !cardId) return null;
  return { deckId, cardId };
}

function resolveAssetIdFromImageUrl(imageUrl?: string): string | undefined {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return undefined;
  const directPrefix = "/assets/";
  if (raw.startsWith(directPrefix)) {
    return raw.slice(directPrefix.length);
  }
  try {
    const parsed = new URL(raw, "http://localhost");
    if (parsed.pathname.startsWith(directPrefix)) {
      return decodeURIComponent(parsed.pathname.slice(directPrefix.length));
    }
  } catch {
    // ignore invalid URL
  }
  return undefined;
}

function resolveLocalizedAssetId(assetId: string | undefined, locale: CardLocaleCode): string | undefined {
  const raw = String(assetId ?? "").trim().replace(/^\/+/, "");
  if (!raw) return undefined;
  const parts = raw.split("/").filter(Boolean);
  const decksIndex = parts.findIndex((part) => part.toLowerCase() === "decks");
  if (decksIndex < 0) return raw;

  let cursor = decksIndex + 1;
  const maybeVariant = parts[cursor]?.toLowerCase();
  const hasVariant = Boolean(
    maybeVariant &&
      KNOWN_ASSET_VARIANTS.includes(maybeVariant as (typeof KNOWN_ASSET_VARIANTS)[number])
  );
  if (hasVariant) cursor += 1;

  const maybeLocale = parts[cursor]?.toLowerCase();
  const hasLocale = Boolean(
    maybeLocale &&
      KNOWN_CARD_LOCALES.includes(maybeLocale as CardLocaleCode)
  );

  if (!hasVariant && !hasLocale) {
    return raw;
  }

  const candidateParts = [...parts];
  if (hasLocale) {
    candidateParts[cursor] = locale;
  } else if (hasVariant) {
    candidateParts.splice(cursor, 0, locale);
  }
  const candidate = candidateParts.join("/");
  const candidatePath = path.join(ASSETS_ROOT, ...candidateParts);
  if (fs.existsSync(candidatePath)) {
    return candidate;
  }
  return raw;
}

function localizeAssetUrl(imageUrl: string | undefined, locale: CardLocaleCode): string | undefined {
  const raw = String(imageUrl ?? "").trim();
  if (!raw) return undefined;
  const directPrefix = "/assets/";
  if (raw.startsWith(directPrefix)) {
    const localized = resolveLocalizedAssetId(raw.slice(directPrefix.length), locale);
    return localized ? `${directPrefix}${localized}` : raw;
  }
  try {
    const parsed = new URL(raw, "http://localhost");
    if (!parsed.pathname.startsWith(directPrefix)) {
      return raw;
    }
    const localized = resolveLocalizedAssetId(
      decodeURIComponent(parsed.pathname.slice(directPrefix.length)),
      locale
    );
    if (!localized) return raw;
    parsed.pathname = `${directPrefix}${localized}`;
    return parsed.toString();
  } catch {
    return raw;
  }
}

function localizeCardLabel(assetId: string | undefined, fallbackLabel: string, locale: CardLocaleCode): string {
  const dict = CARD_LOCALE_DICTIONARIES[locale];
  const enDict = CARD_LOCALE_DICTIONARIES.en;
  if (!dict) return fallbackLabel;
  const key = assetId ? resolveCardKeyFromAssetId(assetId) : null;
  if (!key) return fallbackLabel;
  const cardKey = `${key.deckId}.${key.cardId}`;
  return dict.cards[cardKey] ?? enDict.cards[cardKey] ?? fallbackLabel;
}

function localizeDeckLabel(assetId: string | undefined, fallbackLabel: string, locale: CardLocaleCode): string {
  const dict = CARD_LOCALE_DICTIONARIES[locale];
  const enDict = CARD_LOCALE_DICTIONARIES.en;
  if (!dict) return fallbackLabel;
  const key = assetId ? resolveCardKeyFromAssetId(assetId) : null;
  if (!key) return fallbackLabel;
  return dict.decks[key.deckId] ?? enDict.decks[key.deckId] ?? fallbackLabel;
}

function localizeWorldCardForLocale<T extends { id: string; title: string; description: string; imageId?: string; text?: string }>(
  card: T,
  locale: CardLocaleCode
): T {
  const lookupAssetId = card.imageId ?? card.id;
  const localizedImageId = lookupAssetId.split("/").some((part) => part.toLowerCase() === "decks")
    ? resolveLocalizedAssetId(lookupAssetId, locale)
    : undefined;
  const localizedText = getDisasterTextByAssetId(lookupAssetId, locale) ?? card.text;
  return {
    ...card,
    id: localizedImageId ?? card.id,
    title: localizeCardLabel(lookupAssetId, card.title, locale),
    description: localizeCardLabel(lookupAssetId, card.description, locale),
    imageId: localizedImageId,
    ...(localizedText ? { text: localizedText } : {}),
  };
}

function localizeWorldStateForLocale(world: WorldState30 | undefined, locale: CardLocaleCode): WorldState30 | undefined {
  if (!world) return undefined;
  return {
    ...world,
    disaster: localizeWorldCardForLocale(world.disaster, locale),
    bunker: world.bunker.map((card) => localizeWorldCardForLocale(card, locale)),
    threats: world.threats.map((card) => localizeWorldCardForLocale(card, locale)),
  };
}

function localizeDisasterOptionsForLocale(
  options: Array<{ id: string; title: string }>,
  locale: CardLocaleCode
): Array<{ id: string; title: string }> {
  return options.map((option) => ({
    ...option,
    title: localizeCardLabel(option.id, option.title, locale),
  }));
}

function localizeControlDeckCatalogForLocale(
  catalog: Record<string, Array<{ id: string; labelShort: string }>>,
  locale: CardLocaleCode
): Record<string, Array<{ id: string; labelShort: string }>> {
  return Object.fromEntries(
    Object.entries(catalog).map(([deckName, cards]) => [
      localizeDeckLabel(cards[0]?.id, deckName, locale),
      cards.map((card) => ({
        id: card.id,
        labelShort: localizeCardLabel(card.id, card.labelShort, locale),
      })),
    ])
  );
}


function localizeSpecialConditionForLocale(
  scenarioId: string | undefined,
  special: ReturnType<ScenarioSession["getGameView"]>["you"]["specialConditions"][number],
  locale: CardLocaleCode
) {
  const localizeSpecialField = (specialId: string | undefined, field: "title" | "text", fallback: string): string => {
    const fromSpecials = localizeSpecialConditionField(scenarioId, specialId, field, fallback, locale);
    if (fromSpecials && fromSpecials !== fallback) return fromSpecials;
    return localizeScenarioMessage(fallback, locale, scenarioId);
  };

  const params = special.effect?.params;
  let nextParams = params;
  const rawOptions = params && typeof params === "object" ? (params as { specialOptions?: unknown }).specialOptions : undefined;
  if (Array.isArray(rawOptions)) {
    nextParams = {
      ...params,
      specialOptions: rawOptions.map((option) => {
        const source = option as { id?: unknown; title?: unknown };
        const optionId = String(source.id ?? "").trim();
        const fallbackTitle = String(source.title ?? optionId);
        return {
          ...source,
          id: optionId,
          title: localizeSpecialField(optionId, "title", fallbackTitle),
        };
      }),
    };
  }

  return {
    ...special,
    title: localizeSpecialField(special.id, "title", special.title),
    text: localizeSpecialField(special.id, "text", special.text),
    imgUrl: localizeAssetUrl(special.imgUrl, locale),
    effect: special.effect ? { ...special.effect, params: nextParams } : special.effect,
  };
}

function resolveSpecialConditionIdFromAssetId(assetId: string | undefined): string | undefined {
  const raw = String(assetId ?? "").trim().replace(/^\/+/, "");
  if (!raw) return undefined;
  const parts = raw.split("/").filter(Boolean);
  const specialIndex = parts.findIndex((part) => part.toLowerCase() === "special");
  if (specialIndex < 0 || specialIndex >= parts.length - 1) return undefined;
  return parts.slice(specialIndex).join("/");
}

function localizeSpecialConditionTitleFromAsset(
  scenarioId: string | undefined,
  assetId: string | undefined,
  fallback: string,
  locale: CardLocaleCode
): string {
  const specialId = resolveSpecialConditionIdFromAssetId(assetId);
  if (!specialId) return fallback;
  const localized = localizeSpecialConditionField(scenarioId, specialId, "title", fallback, locale);
  return localized || fallback;
}

function localizeGameViewForLocale(
  view: ReturnType<ScenarioSession["getGameView"]>,
  locale: CardLocaleCode,
  scenarioId?: string
): ReturnType<ScenarioSession["getGameView"]> {
  const normalizeViewCategoryKey = (category: string): string => {
    const raw = String(category ?? "").trim();
    if (!raw) return "";
    const lowered = raw.toLowerCase();
    const directAliases: Record<string, string> = {
      fact1: "facts1",
      fact2: "facts2",
      facts: "facts1",
      special_conditions: "special",
      specialconditions: "special",
      bio: "biology",
    };
    if (directAliases[lowered]) return directAliases[lowered];
    const stableKeys = new Set(["profession", "health", "hobby", "baggage", "facts1", "facts2", "biology", "special"]);
    if (stableKeys.has(lowered)) return lowered;
    const scenarioKey = resolveScenarioLocaleKey(raw, scenarioId);
    const scenarioCategoryMap: Record<string, string> = {
      "deck.profession": "profession",
      "deck.health": "health",
      "deck.hobby": "hobby",
      "deck.baggage": "baggage",
      "deck.biology": "biology",
      "deck.special": "special",
      "category.fact1": "facts1",
      "category.fact2": "facts2",
      "deck.fact": "facts1",
    };
    return (scenarioKey && scenarioCategoryMap[scenarioKey]) || lowered;
  };

  const localizedHand = view.you.hand.map((card) => ({
    ...card,
    labelShort: localizeCardLabel(card.id, card.labelShort ?? "", locale),
    imgUrl: localizeAssetUrl(card.imgUrl, locale),
  }));
  const handLabelByInstanceId = new Map(localizedHand.map((card) => [card.instanceId, card.labelShort] as const));
  const localizedThreatModifier = view.public.threatModifier
    ? {
        ...view.public.threatModifier,
        reasons: view.public.threatModifier.reasons.map((reason, index) => {
          const cardId = view.public.threatModifier?.reasonCardIds?.[index];
          return cardId
            ? localizeCardLabel(cardId, reason, locale)
            : localizeScenarioMessage(reason, locale, scenarioId);
        }),
      }
    : view.public.threatModifier;

  return {
    ...view,
    categoryOrder: view.categoryOrder.map((category) => normalizeViewCategoryKey(category)),
    lastStageText: view.lastStageTextKey
      ? localizeScenarioMessage(view.lastStageTextKey, locale, scenarioId, view.lastStageTextVars)
      : view.lastStageText
        ? localizeScenarioMessage(view.lastStageText, locale, scenarioId, view.lastStageTextVars)
      : view.lastStageText,
    world: localizeWorldStateForLocale(view.world, locale),
    you: {
      ...view.you,
      hand: localizedHand,
      categories: view.you.categories.map((slot) => ({
        ...slot,
        category: normalizeViewCategoryKey(slot.category),
        cards: slot.cards.map((card) => ({
          ...card,
          labelShort: handLabelByInstanceId.get(card.instanceId) ?? card.labelShort,
        })),
      })),
      specialConditions: view.you.specialConditions.map((special) => localizeSpecialConditionForLocale(scenarioId, special, locale)),
    },
    public: {
      ...view.public,
      roundRules: view.public.roundRules
        ? {
            ...view.public.roundRules,
            forcedRevealCategory: view.public.roundRules.forcedRevealCategory
              ? normalizeViewCategoryKey(view.public.roundRules.forcedRevealCategory)
              : view.public.roundRules.forcedRevealCategory,
          }
        : view.public.roundRules,
      votesPublic: view.public.votesPublic?.map((vote) => ({
        ...vote,
        reason: vote.reasonKey
          ? localizeScenarioMessage(vote.reasonKey, locale, scenarioId, vote.reasonVars)
          : vote.reason
          ? localizeScenarioMessage(vote.reason, locale, scenarioId, vote.reasonVars)
          : vote.reason,
      })),
      resolutionNote: view.public.resolutionNoteKey
        ? localizeScenarioMessage(view.public.resolutionNoteKey, locale, scenarioId)
        : view.public.resolutionNote
        ? localizeScenarioMessage(view.public.resolutionNote, locale, scenarioId)
        : view.public.resolutionNote,
      threatModifier: localizedThreatModifier,
      players: view.public.players.map((player) => ({
        ...player,
        revealedCards: player.revealedCards.map((card) => ({
          ...card,
          labelShort: localizeCardLabel(card.id, card.labelShort ?? "", locale),
        })),
        categories: player.categories.map((slot) => {
          const category = normalizeViewCategoryKey(slot.category);
          return {
            ...slot,
            category,
            cards: slot.cards.map((card) => {
              const assetId = resolveAssetIdFromImageUrl(card.imgUrl);
              return {
                ...card,
                labelShort:
                  category === "special"
                    ? localizeSpecialConditionTitleFromAsset(scenarioId, assetId, card.labelShort, locale)
                    : localizeCardLabel(assetId, card.labelShort, locale),
                imgUrl: localizeAssetUrl(card.imgUrl, locale),
              };
            }),
          };
        }),
      })),
    },
  };
}

function localizeGameEventForLocale(event: GameEvent, locale: CardLocaleCode, scenarioId?: string): GameEvent {
  const vars = event.messageVars as Record<string, string | number> | undefined;
  if (event.messageKey) {
    const message =
      event.messageKey.startsWith("info.") || event.messageKey.startsWith("error.")
        ? tServer(normalizeServerLocale(locale), event.messageKey, vars)
        : (() => {
            const localized = localizeScenarioMessage(event.messageKey, locale, scenarioId, vars);
            return localized === event.messageKey
              ? localizeScenarioMessage(event.message, locale, scenarioId, vars)
              : localized;
          })();
    return { ...event, message };
  }
  return {
    ...event,
    message: localizeScenarioMessage(event.message, locale, scenarioId, vars),
  };
}

const getPlayerCardLocale = (player?: Player): CardLocaleCode => normalizeCardLocale(player?.locale);
const getOverlayLocale = (room: Room): CardLocaleCode =>
  normalizeCardLocale(room.overlayOverrides?.overlayUrlParams?.lang ?? DEFAULT_ASSET_LOCALE);

function resolveBackDeckAssetPath(fileName: string, requestedLocaleRaw?: string): string | null {
  const safeFileName = path.basename(fileName);
  if (!safeFileName || safeFileName !== fileName) return null;

  const decksRoot = path.join(ASSETS_ROOT, "decks");
  const requestedVariant = process.env.BUNKER_ASSET_VARIANT?.trim().toLowerCase();
  const candidateVariants = new Set<string>();
  if (requestedVariant) candidateVariants.add(requestedVariant);
  for (const variant of KNOWN_ASSET_VARIANTS) candidateVariants.add(variant);

  const requestedLocale = normalizeCardLocale(
    requestedLocaleRaw || process.env.BUNKER_ASSET_LOCALE?.trim().toLowerCase() || DEFAULT_ASSET_LOCALE
  );
  const localeCandidates = [requestedLocale, ...KNOWN_CARD_LOCALES.filter((locale) => locale !== requestedLocale)];

  for (const variant of candidateVariants) {
    for (const locale of localeCandidates) {
      const candidatePath = path.join(decksRoot, variant, locale, BACK_DECK_DIR_NAME, safeFileName);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

const DEFAULT_SETTINGS: GameSettings = {
  enableRevealDiscussionTimer: false,
  revealDiscussionSeconds: 60,
  enablePreVoteDiscussionTimer: false,
  preVoteDiscussionSeconds: 60,
  enablePostVoteDiscussionTimer: false,
  postVoteDiscussionSeconds: 45,
  automationMode: "semi",
  enablePresenterMode: false,
  continuePermission: "revealer_only",
  revealTimeoutAction: "random_card",
  revealsBeforeVoting: 2,
  specialUsage: "anytime",
  maxPlayers: 12,
  finalThreatReveal: "host",
  forcedDisasterId: "random",
};

let roomCleanupTimer: ReturnType<typeof setInterval> | undefined;

const cleanupInactiveRooms = createCleanupInactiveRooms({
  overlaySubscriptions: overlaySubscriptions as Map<unknown, { roomCode: string; role: string }>,
  logRoomLifecycle,
  roomEndedTtlMs: ROOM_ENDED_TTL_MS,
  roomInactiveTtlMs: ROOM_INACTIVE_TTL_MS,
});

const generateRoomCode = () => generateRoomCodeState();

function buildRoomState(room: Room, locale: CardLocaleCode): RoomState {
  return buildRoomStateProjection(room, locale, {
    disconnectGraceMs: DISCONNECT_GRACE_MS,
    localizeWorldStateForLocale,
    localizeDisasterOptionsForLocale,
  });
}

// Overlay category configuration with localization keys
const OVERLAY_CATEGORY_KEYS = [
  { key: "profession" },
  { key: "health" },
  { key: "hobby" },
  { key: "phobia" },
  { key: "baggage" },
  { key: "facts1" },
  { key: "facts2" },
  { key: "biology" },
] as const;

// Runtime overlay categories with localized labels (built per-request)
interface OverlayCategoryConfig {
  key: string;
  label: string;
}

function buildOverlayCategories(locale: "ru" | "en"): OverlayCategoryConfig[] {
  return OVERLAY_CATEGORY_KEYS.map((entry) => ({
    key: entry.key,
    label: tOverlay(
      locale,
      entry.key === "facts1"
        ? "overlay.category.fact1"
        : entry.key === "facts2"
          ? "overlay.category.fact2"
          : `overlay.category.${entry.key}`
    ),
  }));
}

function clampLine(value: string, locale: "ru" | "en", max = 56): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return tOverlay(locale, "overlay.unknownShort");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function getOverlayHiddenText(locale: "ru" | "en"): string {
  return tOverlay(locale, "overlay.hidden");
}

function normalizeOverlayCatastropheText(value: string | undefined, locale: "ru" | "en"): string {
  const normalized = sanitizeMultiLine(value ?? "", OVERLAY_MAX_CATA_LEN).trim();
  return normalized || getOverlayHiddenText(locale);
}

function normalizeDisasterCompareValue(value: string | undefined): string {
  return sanitizeSingleLine(value ?? "", OVERLAY_MAX_LINE_LEN)
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function buildOverlayCatastropheBody(worldDisaster: {
  text?: string;
  description?: string;
  title?: string;
} | null | undefined, locale: "ru" | "en"): string {
  const longText = sanitizeMultiLine(worldDisaster?.text ?? "", OVERLAY_MAX_CATA_LEN).trim();
  const description = sanitizeMultiLine(worldDisaster?.description ?? "", OVERLAY_MAX_CATA_LEN).trim();
  const titleNorm = normalizeDisasterCompareValue(worldDisaster?.title);
  if (longText) {
    const longTextNorm = normalizeDisasterCompareValue(longText);
    if (!titleNorm || longTextNorm !== titleNorm) {
      return longText;
    }
  }
  if (description) {
    const descriptionNorm = normalizeDisasterCompareValue(description);
    if (!titleNorm || descriptionNorm !== titleNorm) {
      return description;
    }
  }
  return getOverlayHiddenText(locale);
}

function normalizeOverlayCatastropheTitle(
  title?: string,
  description?: string,
  labelShort?: string
): string | undefined {
  const candidate = sanitizeSingleLine(title || description || labelShort || "", OVERLAY_MAX_LINE_LEN).trim();
  return candidate || undefined;
}

function normalizeOverlayCompareValue(value: string | undefined): string {
  return sanitizeSingleLine(value ?? "", OVERLAY_MAX_LINE_LEN)
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function readMappedSubtitle(
  subtitleMap: SubtitleMap | undefined,
  assetId: string | undefined,
  titleRendered: string
): string | undefined {
  if (!subtitleMap || subtitleMap.size === 0) return undefined;
  if (!assetId) return "";
  const cardKey = resolveSubtitleCardKeyFromAssetId(assetId);
  if (!cardKey) return undefined;
  const mapped = sanitizeSingleLine(subtitleMap.get(cardKey) ?? "", OVERLAY_MAX_LINE_LEN)
    .trim()
    .replace(/\s+/g, " ");
  if (!mapped) return undefined;
  const sameAsTitle =
    normalizeOverlayCompareValue(mapped) === normalizeOverlayCompareValue(titleRendered);
  return sameAsTitle ? undefined : mapped;
}

function buildTopItems(
  cards: Array<{ isRevealed?: boolean; title?: string; description?: string; imageId?: string; id?: string }>,
  subtitleMap: SubtitleMap,
  locale: "ru" | "en",
  preferredSubtitleMap?: SubtitleMap
) {
  const revealedCards = cards.filter((card) => card.isRevealed);
  return revealedCards.map((card) => {
    const unknownShort = tOverlay(locale, "overlay.unknownShort");
    const titleRaw =
      sanitizeSingleLine(card.title || card.description || unknownShort, OVERLAY_MAX_LINE_LEN).trim() || unknownShort;
    const title = titleRaw;
    const description = sanitizeSingleLine(card.description || "", OVERLAY_MAX_LINE_LEN)
      .trim()
      .replace(/\s+/g, " ");
    const titleNorm = normalizeOverlayCompareValue(title);
    const descNorm = normalizeOverlayCompareValue(description);
    let subtitle = readMappedSubtitle(preferredSubtitleMap, card.imageId || card.id, title);
    if (!subtitle) {
      subtitle = readMappedSubtitle(subtitleMap, card.imageId || card.id, title);
    }
    if (!subtitle && description && description !== "?" && descNorm !== titleNorm) {
      subtitle = description;
    }
    if (subtitle && normalizeOverlayCompareValue(subtitle) === normalizeOverlayCompareValue(title)) {
      subtitle = undefined;
    }
    return { title, subtitle, imageId: card.imageId };
  });
}

function buildTopLinesFromItems(items: Array<{ title: string }>, locale: "ru" | "en") {
  if (!items.length) return [getOverlayHiddenText(locale)];
  return items.map((item) => item.title || tOverlay(locale, "overlay.unknownShort"));
}

function findCategory(player: PublicPlayerView, key: string) {
  return player.categories.find((item) => item.category === key);
}

function readCategoryValue(player: PublicPlayerView, key: string, locale: "ru" | "en") {
  const category = findCategory(player, key);
  if (!category || category.status !== "revealed" || category.cards.length === 0) {
    return {
      revealed: false,
      value: tOverlay(locale, "overlay.unknownShort"),
      imgUrl: undefined as string | undefined,
    };
  }
  return {
    revealed: true,
    value: category.cards.map((card) => card.labelShort).join(", "),
    imgUrl: category.cards[0]?.imgUrl,
  };
}
function readCategoryCardId(player: PublicPlayerView, key: string) {
  const category = findCategory(player, key);
  if (!category || category.status !== "revealed" || category.cards.length === 0) {
    return undefined;
  }
  const assetId = resolveAssetIdFromImageUrl(category.cards[0]?.imgUrl);
  const resolved = assetId ? resolveCardKeyFromAssetId(assetId) : null;
  return resolved?.cardId;
}

function extractBioTags(player: PublicPlayerView, locale: "ru" | "en") {
  return buildOverlayBiology(readCategoryCardId(player, "biology"), locale);
}

async function getOverlayState(room: Room): Promise<OverlayState | null> {
  const overlayLocale = getOverlayLocale(room);
  const overlayCategories = buildOverlayCategories(overlayLocale);
  const fallback = {
    roomId: room.code,
    locale: overlayLocale,
    playerCount: room.players.size,
    top: {
      bunker: { revealed: 0, total: 0, lines: [getOverlayHiddenText(overlayLocale)] },
      catastrophe: { text: getOverlayHiddenText(overlayLocale), title: undefined, imageId: undefined },
      threats: { revealed: 0, total: 0, lines: [getOverlayHiddenText(overlayLocale)] },
    },
    players: room.joinOrder
      .map((id) => room.players.get(id))
      .filter(Boolean)
      .map((player) => ({
        id: player!.playerId,
        nickname: player!.name,
        connected: player!.connected,
        alive: !player!.leftBunker,
        biology: undefined,
        tags: {
          ...buildDefaultOverlayBioTags(overlayLocale),
        },
        categories: overlayCategories.map((entry) => ({
          key: entry.key,
          label: entry.label,
          revealed: false,
          value: tOverlay(overlayLocale, "overlay.unknownShort"),
        })),
      })),
    overrides: room.overlayOverrides,
  } satisfies OverlayState;

  if (!room.session || !room.hostId) {
    return fallback;
  }

  try {
    const locale = overlayLocale;
    const subtitleMap = await getSubtitleMap(locale);
    const threatOverlayShortMap = await getThreatOverlayShortMap(locale);
    const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
    if (!anchorId) return fallback;
    const view = localizeGameViewForLocale(room.session.getGameView(anchorId), locale, room.scenarioId);
    const world = view.world;
    const bunkerTotal = world?.counts.bunker ?? world?.bunker.length ?? 0;
    const threatTotal = world?.counts.threats ?? world?.threats.length ?? 0;
    const bunkerCards = (world?.bunker ?? []).slice(0, bunkerTotal);
    const threatCards = (world?.threats ?? []).slice(0, threatTotal);
    const bunkerOpened = bunkerCards.filter((card) => card.isRevealed).length;
    const threatOpened = threatCards.filter((card) => card.isRevealed).length;
    const bunkerItems = buildTopItems(bunkerCards, subtitleMap, overlayLocale);
    const threatItems = buildTopItems(threatCards, subtitleMap, overlayLocale, threatOverlayShortMap);
    const bunkerLines = buildTopLinesFromItems(bunkerItems, overlayLocale);
    const threatLines = buildTopLinesFromItems(threatItems, overlayLocale);
    const catastropheTitle = normalizeOverlayCatastropheTitle(
      world?.disaster.title,
      world?.disaster.description,
      (world?.disaster as { labelShort?: string } | undefined)?.labelShort
    );
    const catastropheText = normalizeOverlayCatastropheText(buildOverlayCatastropheBody(world?.disaster, overlayLocale), overlayLocale);

    return {
      roomId: room.code,
      locale: overlayLocale,
      playerCount: view.public.players.length,
      top: {
        bunker: { revealed: bunkerOpened, total: bunkerTotal, lines: bunkerLines, items: bunkerItems },
        catastrophe: {
          text: catastropheText,
          title: catastropheTitle,
          imageId: world?.disaster.imageId,
        },
        threats: { revealed: threatOpened, total: threatTotal, lines: threatLines, items: threatItems },
      },
      players: view.public.players.map((player) => {
        const roomPlayer = room.players.get(player.playerId);
        const categories = overlayCategories.map((entry) => {
          const value = readCategoryValue(player, entry.key, overlayLocale);
          return {
            key: entry.key,
            label: entry.label,
            revealed: value.revealed,
            value: value.value,
            imgUrl: value.imgUrl,
          };
        });

        const bio = extractBioTags(player, overlayLocale);

        return {
          id: player.playerId,
          nickname: player.name,
          connected: roomPlayer?.connected ?? true,
          alive: player.status === "alive",
          biology: bio.biology,
          tags: bio.tags,
          categories,
        };
      }),
      overrides: room.overlayOverrides,
    };
  } catch (error) {
    console.error("[overlay] failed to build state", error);
    return fallback;
  }
}

function generatePlayerReconnectToken(): PlayerReconnectToken {
  return crypto.randomUUID();
}

function generateOverlayViewToken(): OverlayViewToken {
  return crypto.randomBytes(20).toString("hex");
}

function generateOverlayControlToken(): OverlayControlToken {
  return crypto.randomBytes(20).toString("hex");
}

function generateOverlayControlInviteToken(): OverlayControlInviteToken {
  return crypto.randomBytes(24).toString("hex");
}

function generateSpectatorToken(): SpectatorToken {
  return crypto.randomBytes(20).toString("hex");
}

function generateSpectatorInviteToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

function isOverlayTokenExpired(issuedAtMs: number, now = Date.now()): boolean {
  if (OVERLAY_TOKEN_TTL_MS <= 0) return false;
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return false;
  return now - issuedAtMs >= OVERLAY_TOKEN_TTL_MS;
}

function rotateOverlayTokens(room: Room, reason: "initial" | "ttl_expired"): void {
  const now = Date.now();
  room.overlayToken = generateOverlayViewToken();
  room.overlayEditToken = generateOverlayControlToken();
  room.overlayTokenIssuedAt = now;
  room.overlayEditTokenIssuedAt = now;

  if (reason !== "initial") {
    logRoomLifecycle("overlay_tokens_rotated", room.code, {
      reason,
      ttlMs: OVERLAY_TOKEN_TTL_MS,
    });
  }
}

function ensureOverlayTokensActive(room: Room): boolean {
  if (OVERLAY_TOKEN_TTL_MS <= 0) return false;
  const now = Date.now();
  const viewExpired = isOverlayTokenExpired(room.overlayTokenIssuedAt, now);
  const controlExpired = isOverlayTokenExpired(room.overlayEditTokenIssuedAt, now);
  if (!viewExpired && !controlExpired) return false;
  rotateOverlayTokens(room, "ttl_expired");
  return true;
}

function ensureOverlayControlInviteActive(room: Room): boolean {
  if (OVERLAY_CONTROL_INVITE_TTL_MS <= 0) return false;
  if (!isOverlayControlInviteExpired(room.overlayControlInviteIssuedAt)) return false;
  rotateOverlayControlInvite(room, "ttl_expired");
  return true;
}

function isOverlayControlInviteExpired(issuedAtMs: number, now = Date.now()): boolean {
  if (OVERLAY_CONTROL_INVITE_TTL_MS <= 0) return false;
  if (!Number.isFinite(issuedAtMs) || issuedAtMs <= 0) return false;
  return now - issuedAtMs >= OVERLAY_CONTROL_INVITE_TTL_MS;
}

function normalizeSpectatorInviteMaxUses(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

function pruneExpiredSpectatorInvites(room: Room, now = Date.now()): void {
  if (room.spectatorInvites.size === 0) return;
  for (const [token, invite] of room.spectatorInvites.entries()) {
    if (invite.remainingUses <= 0 || now >= invite.expiresAt) {
      room.spectatorInvites.delete(token);
    }
  }
}

function issueSpectatorInvite(room: Room, maxUses: number): { token: string; expiresAt: number; maxUses: number } {
  const normalizedMaxUses = normalizeSpectatorInviteMaxUses(maxUses);
  const now = Date.now();
  pruneExpiredSpectatorInvites(room, now);
  const token = generateSpectatorInviteToken();
  room.spectatorInvites.set(token, {
    maxUses: normalizedMaxUses,
    remainingUses: normalizedMaxUses,
    issuedAt: now,
    expiresAt: now + SPECTATOR_INVITE_TTL_MS,
  });
  return {
    token,
    expiresAt: now + SPECTATOR_INVITE_TTL_MS,
    maxUses: normalizedMaxUses,
  };
}

function consumeSpectatorInvite(room: Room, inviteToken: string): boolean {
  const token = String(inviteToken ?? "").trim();
  if (!token) return false;
  const now = Date.now();
  pruneExpiredSpectatorInvites(room, now);
  const invite = room.spectatorInvites.get(token);
  if (!invite) return false;
  if (invite.remainingUses <= 0 || now >= invite.expiresAt) {
    room.spectatorInvites.delete(token);
    return false;
  }
  invite.remainingUses -= 1;
  if (invite.remainingUses <= 0) {
    room.spectatorInvites.delete(token);
  } else {
    room.spectatorInvites.set(token, invite);
  }
  return true;
}

function rotateOverlayControlInvite(
  room: Room,
  reason: "initial" | "host_create" | "host_revoke" | "exchange" | "ttl_expired"
): void {
  room.overlayControlInviteToken = generateOverlayControlInviteToken();
  room.overlayControlInviteIssuedAt = Date.now();
  if (reason !== "initial") {
    logRoomLifecycle("overlay_invite_rotated", room.code, {
      reason,
      ttlMs: OVERLAY_CONTROL_INVITE_TTL_MS,
    });
  }
}

function rotateOverlayControlSessionToken(room: Room, reason: "invite_exchange"): OverlayControlToken {
  room.overlayEditToken = generateOverlayControlToken();
  room.overlayEditTokenIssuedAt = Date.now();
  logRoomLifecycle("overlay_control_session_rotated", room.code, {
    reason,
    ttlMs: OVERLAY_TOKEN_TTL_MS,
  });
  return room.overlayEditToken;
}

function isOverlayControlInviteAuthorized(room: Room, inviteToken: string): boolean {
  if (!inviteToken) return false;
  if (inviteToken !== room.overlayControlInviteToken) return false;
  if (isOverlayControlInviteExpired(room.overlayControlInviteIssuedAt)) return false;
  return true;
}

function getRoleForPlayer(room: Room, playerId: string | undefined): Role {
  if (!playerId) return "VIEW";
  if (playerId === room.controlId) return "CONTROL";
  return room.players.has(playerId) ? "PLAYER" : "VIEW";
}

function getRoleForToken(room: Room, token: string): Role | null {
  if (!token) return null;
  if (token === room.spectatorToken) {
    return "VIEW";
  }
  if (token === room.overlayToken) {
    return isOverlayTokenExpired(room.overlayTokenIssuedAt) ? null : "VIEW";
  }
  if (token === room.overlayEditToken) {
    return isOverlayTokenExpired(room.overlayEditTokenIssuedAt) ? null : "CONTROL";
  }
  const playerId = room.playersByToken.get(token);
  if (!playerId) return null;
  return getRoleForPlayer(room, playerId);
}

function canPlayerAction(role: Role): boolean {
  return role === "PLAYER" || role === "CONTROL";
}

function canControl(role: Role): boolean {
  return role === "CONTROL";
}

function isOverlayEditAuthorized(room: Room, token: string): boolean {
  const role = getRoleForToken(room, token);
  return role !== null && canControl(role);
}

function buildOverlayPresenterState(room: Room) {
  const presenterEnabled = Boolean(room.settings.enablePresenterMode);
  const fallbackPlayers = room.joinOrder
    .map((playerId) => room.players.get(playerId))
    .filter(Boolean)
    .map((player) => ({
      playerId: player!.playerId,
      name: player!.name,
      connected: player!.connected,
      status: player!.leftBunker ? ("left_bunker" as const) : ("alive" as const),
      voted: false,
      votedTargetName: "-",
      votesAgainst: 0,
      revealedThisRound: false,
    }));

  const base = {
    enabled: presenterEnabled,
    roomCode: room.code,
    scenarioId: room.scenarioMeta.id,
    scenarioName: room.scenarioMeta.name,
    roomPhase: room.phase,
    hostId: room.hostId,
    controlId: room.controlId,
    gamePhase: null as string | null,
    currentTurnPlayerId: null as string | null,
    round: null as number | null,
    votePhase: null as string | null,
    postGameActive: false,
    postGameOutcome: null as "survived" | "failed" | null,
    players: fallbackPlayers,
    control: {
      players: [] as Array<{
        playerId: string;
        name: string;
        status: PlayerStatus;
      hand: Array<{
        instanceId: string;
        id: string;
        deck: string;
        labelShort: string;
        revealed: boolean;
        missing?: boolean;
      }>;
        specialConditions: Array<{
          instanceId: string;
          id: string;
          title: string;
          text: string;
          used: boolean;
          revealedPublic: boolean;
          pendingActivation?: boolean;
          implemented: boolean;
          choiceKind?: string;
          targetScope?: string;
          allowSelfTarget?: boolean;
          effectType?: string;
          requires?: string[];
          imgUrl?: string;
        }>;
      }>,
      specialCatalog: [] as Array<{
        id: string;
        title: string;
        text: string;
        implemented: boolean;
        choiceKind?: string;
        targetScope?: string;
        allowSelfTarget?: boolean;
        effectType?: string;
        requires?: string[];
      }>,
      world: null as
        | {
            disaster: { title: string; imageId?: string };
            bunker: Array<{ index: number; title: string; isRevealed: boolean; imageId?: string }>;
            threats: Array<{ index: number; title: string; isRevealed: boolean; imageId?: string }>;
          }
        | null,
      supportedScenarioActions: [
        "revealCard",
        "applySpecial",
        "vote",
        "continueRound",
        "finalizeVoting",
        "revealWorldThreat",
        "setBunkerOutcome",
        "markLeftBunker",
        "devKickPlayer",
        "devSkipRound",
        "devAddPlayer",
        "devRemovePlayer",
        "adminReplacePlayerCard",
        "adminSetWorldCardReveal",
        "adminReplaceWorldCard",
        "adminSetWorldCount",
        "adminApplySpecial",
      ] as const,
    },
    actions: {
      canStartGame: room.phase === "lobby",
      canNextStep: false,
      canSkipStep: false,
      canSkipRound: room.phase === "game",
      canStartVote: false,
      canEndVote: false,
      canSetOutcome: false,
      canKickPlayer: fallbackPlayers.some(
        (player) => player.playerId !== room.controlId && player.status !== "left_bunker"
      ),
    },
  };

  if (room.phase !== "game" || !room.session) {
    return base;
  }

  try {
    const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
    if (!anchorId) return base;
    const locale = getOverlayLocale(room);
    const view = localizeGameViewForLocale(room.session.getGameView(anchorId), locale, room.scenarioId);
    const votesByPlayer = new Map((view.public.votesPublic ?? []).map((vote) => [vote.voterId, vote.status]));
    const voteTargetNameByVoter = new Map(
      (view.public.votesPublic ?? []).map((vote) => [vote.voterId, vote.targetName ?? ""])
    );
    const votesAgainstByTarget = new Map<string, number>();
    for (const vote of view.public.votesPublic ?? []) {
      if (vote.status !== "voted" || !vote.targetId) continue;
      votesAgainstByTarget.set(vote.targetId, (votesAgainstByTarget.get(vote.targetId) ?? 0) + 1);
    }
    const revealedThisRound = new Set(view.public.revealedThisRound ?? []);

    const controlPlayers = view.public.players.map((publicPlayer) => {
      let hand: Array<{
        instanceId: string;
        deck: string;
        labelShort: string;
        revealed: boolean;
        missing?: boolean;
      }> = [];
      let specialConditions: Array<{
        instanceId: string;
        id: string;
        title: string;
        text: string;
        used: boolean;
        revealedPublic: boolean;
        pendingActivation?: boolean;
        implemented: boolean;
        choiceKind?: string;
        targetScope?: string;
        allowSelfTarget?: boolean;
        effectType?: string;
        requires?: string[];
        imgUrl?: string;
      }> = [];
      const cachedPersonalView = room.lastGameViews?.get(publicPlayer.playerId);
      try {
        const personalView =
          cachedPersonalView ??
          localizeGameViewForLocale(
            room.session!.getGameView(publicPlayer.playerId),
            locale,
            room.scenarioId
          );
        hand = personalView.you.hand.map((card) => ({
          instanceId: String(card.instanceId ?? card.id ?? `${publicPlayer.playerId}-card`),
          id: String(card.id ?? ""),
          deck: card.deck,
          labelShort: String(card.labelShort ?? card.deck ?? tOverlay(locale, "control.world.cardFallback")),
          revealed: card.revealed,
          missing: card.missing,
        }));
        specialConditions = personalView.you.specialConditions.map((special) => {
          const requiresRaw = (special as { requires?: unknown[] }).requires;
          return {
            instanceId: special.instanceId,
            id: special.id,
            title: special.title,
            text: special.text,
            used: special.used,
            revealedPublic: special.revealedPublic,
            pendingActivation: special.pendingActivation,
            implemented: special.implemented,
            choiceKind: special.choiceKind,
            targetScope: special.targetScope,
            allowSelfTarget: special.allowSelfTarget,
            effectType: String(special.effect?.type ?? ""),
            requires: Array.isArray(requiresRaw)
              ? requiresRaw
                  .map((item) => String(item ?? "").trim())
                  .filter(Boolean)
              : undefined,
            imgUrl: special.imgUrl,
          };
        });
      } catch {
        // ignore per-player read errors in presenter state
      }
      return {
        playerId: publicPlayer.playerId,
        name: publicPlayer.name,
        status: publicPlayer.status,
        hand,
        specialConditions,
      };
    });

    const worldControl = view.world
      ? {
          disaster: {
            title: view.world.disaster.title,
            imageId: view.world.disaster.imageId,
          },
          bunker: view.world.bunker.map((card, index) => ({
            index,
            title: card.title,
            isRevealed: card.isRevealed,
            imageId: card.imageId,
          })),
          threats: view.world.threats.map((card, index) => ({
            index,
            title: card.title,
            isRevealed: card.isRevealed,
            imageId: card.imageId,
          })),
        }
      : null;

    const sessionWithCatalog = room.session as ScenarioSession & {
      getSpecialCatalog?: () => Array<{
        id: string;
        title: string;
        text: string;
        implemented?: boolean;
        choiceKind?: string;
        targetScope?: string;
        allowSelfTarget?: boolean;
        effectType?: string;
        requires?: string[];
      }>;
    };
    const rawSpecialCatalog = sessionWithCatalog.getSpecialCatalog?.();
    const specialCatalog = Array.isArray(rawSpecialCatalog)
      ? rawSpecialCatalog.map((item) => {
          const specialId = String(item.id ?? "").trim();
          const fallbackTitle = String(item.title ?? item.id ?? "").trim();
          const fallbackText = String(item.text ?? "").trim();
          const localizedTitleRaw = localizeSpecialConditionField(room.scenarioId, specialId, "title", fallbackTitle, locale);
          const localizedTextRaw = localizeSpecialConditionField(room.scenarioId, specialId, "text", fallbackText, locale);
          return {
          id: specialId,
          title: localizedTitleRaw !== fallbackTitle ? localizedTitleRaw : localizeScenarioMessage(fallbackTitle, locale, room.scenarioId),
          text: localizedTextRaw !== fallbackText ? localizedTextRaw : localizeScenarioMessage(fallbackText, locale, room.scenarioId),
          implemented: Boolean(item.implemented ?? true),
          choiceKind: item.choiceKind ? String(item.choiceKind) : undefined,
          targetScope: item.targetScope ? String(item.targetScope) : undefined,
          allowSelfTarget: item.allowSelfTarget === true,
          effectType: item.effectType ? String(item.effectType) : undefined,
          requires: Array.isArray(item.requires)
            ? item.requires.map((entry) => String(entry ?? "").trim()).filter(Boolean)
            : undefined,
        };
      })
      : [];

    return {
      ...base,
      gamePhase: view.phase,
      currentTurnPlayerId: view.public.currentTurnPlayerId ?? null,
      round: view.round,
      votePhase: view.public.votePhase ?? null,
      postGameActive: Boolean(view.postGame?.isActive),
      postGameOutcome: view.postGame?.outcome ?? null,
      players: view.public.players.map((player) => ({
        playerId: player.playerId,
        name: player.name,
        connected: player.connected,
        status: player.status,
        voted: votesByPlayer.get(player.playerId) === "voted",
        votedTargetName: voteTargetNameByVoter.get(player.playerId) || "-",
        votesAgainst: votesAgainstByTarget.get(player.playerId) ?? 0,
        revealedThisRound: revealedThisRound.has(player.playerId),
      })),
      control: {
        ...base.control,
        players: controlPlayers,
        specialCatalog,
        world: worldControl,
      },
      actions: {
        canStartGame: false,
        canNextStep: view.phase === "reveal_discussion",
        canSkipStep:
          view.phase === "reveal_discussion" ||
          (view.phase === "voting" && view.public.votePhase === "voteSpecialWindow"),
        canSkipRound:
          view.phase !== "voting" && view.phase !== "resolution" && view.phase !== "ended",
        canStartVote:
          view.phase === "reveal_discussion" &&
          (view.public.votesRemainingInRound ?? 0) > 0 &&
          (view.public.roundRevealedCount ?? 0) >= (view.public.roundTotalAlive ?? 0),
        canEndVote:
          view.phase === "voting" &&
          (view.public.votePhase === "voteSpecialWindow" || view.public.votePhase === "voting"),
        canSetOutcome: Boolean(view.postGame?.isActive && !view.postGame?.outcome),
        canKickPlayer: view.public.players.some(
          (player) => player.playerId !== room.controlId && player.status === "alive"
        ),
      },
    };
  } catch {
    return base;
  }
}

async function buildOverlayControlState(room: Room) {
  const roomLocale = getOverlayLocale(room);
  const overlayState = await getOverlayState(room);
  const overlayCategories = buildOverlayCategories(roomLocale);
  const categoriesMap = new Map<string, string>();
  for (const category of overlayCategories) {
    categoriesMap.set(category.key, category.label);
  }
  for (const player of overlayState?.players ?? []) {
    for (const category of player.categories ?? []) {
      if (!categoriesMap.has(category.key)) {
        categoriesMap.set(category.key, category.label || category.key);
      }
    }
  }
  const categories = Array.from(categoriesMap.entries()).map(([key, label]) => ({ key, label }));
  const overlayPlayersById = new Map((overlayState?.players ?? []).map((player) => [player.id, player]));

  const players = room.joinOrder
    .map((playerId) => room.players.get(playerId))
    .filter(Boolean)
    .map((player) => ({
      playerId: player!.playerId,
      name: player!.name,
      connected: player!.connected,
      alive: overlayPlayersById.get(player!.playerId)?.alive ?? !player!.leftBunker,
      nickname: overlayPlayersById.get(player!.playerId)?.nickname ?? player!.name,
      categories,
    }));

  return {
    roomCode: room.code,
    cardLocale: roomLocale,
    categories,
    players,
    deckCatalog: localizeControlDeckCatalogForLocale(controlDeckCatalog, roomLocale),
    overrides: room.overlayOverrides ?? {},
    overlayState: overlayState ?? undefined,
    presenterModeEnabled: Boolean(room.settings.enablePresenterMode),
    presenter: buildOverlayPresenterState(room),
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function diffTopLevel<T extends object>(prev: T | undefined, next: T): Partial<T> | null {
  if (!prev) return null;
  const patch: Partial<T> = {};
  let changed = false;
  for (const key of Object.keys(next) as Array<keyof T>) {
    if (!deepEqual(prev[key], next[key])) {
      patch[key] = next[key];
      changed = true;
    }
  }
  return changed ? patch : null;
}

const OUTBOUND_GUARDED_MESSAGE_TYPES = new Set<ServerMessage["type"]>([
  "roomState",
  "statePatch",
  "gameView",
  "overlayState",
]);

const OUTBOUND_SENSITIVE_KEY_PATTERN = /(token|secret|sessionId|password|cookie|auth)/i;

function collectSensitiveKeyPaths(value: unknown, basePath = "$"): string[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const out: string[] = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      out.push(...collectSensitiveKeyPaths(value[index], `${basePath}[${index}]`));
    }
    return out;
  }

  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${basePath}.${key}`;
    if (OUTBOUND_SENSITIVE_KEY_PATTERN.test(key)) {
      out.push(nextPath);
    }
    out.push(...collectSensitiveKeyPaths(entry, nextPath));
  }

  return out;
}

function checkOutboundPayloadForSensitiveKeys(message: ServerMessage): void {
  if (!OUTBOUND_SENSITIVE_PAYLOAD_GUARD) return;
  if (!OUTBOUND_GUARDED_MESSAGE_TYPES.has(message.type)) return;

  const sensitivePaths = collectSensitiveKeyPaths(message.payload);
  if (sensitivePaths.length === 0) return;

  const keyPaths = sensitivePaths.slice(0, 12).join(",");
  const signature = `${message.type}|${keyPaths}`;
  if (outboundSensitiveGuardSignatures.has(signature)) {
    if (OUTBOUND_SENSITIVE_PAYLOAD_GUARD_STRICT) {
      throw new Error(`[security] blocked outbound ${message.type}: sensitive keys in payload (${keyPaths})`);
    }
    return;
  }
  outboundSensitiveGuardSignatures.add(signature);

  const warning = `[security] outbound ${message.type} contains sensitive-key names at: ${keyPaths}`;
  if (OUTBOUND_SENSITIVE_PAYLOAD_GUARD_STRICT) {
    throw new Error(`${warning}; strict guard is enabled`);
  }
  console.warn(warning);
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  checkOutboundPayloadForSensitiveKeys(message);
  ws.send(JSON.stringify(message));
}

const messagePresenterDeps = {
  send,
  normalizeServerLocale,
  connectionInfo,
  rooms,
};

function tServerForRoom(
  room: Room | undefined,
  key: string,
  vars?: Record<string, unknown>
): string {
  return tServerForRoomPresenter(messagePresenterDeps, room, key, vars);
}

function localizeScenarioMessageForPlayer(room: Room, playerId: string, message: string): string {
  return localizeScenarioMessage(message, getPlayerCardLocale(room.players.get(playerId)), room.scenarioId);
}

function sendLocalizedError(
  ws: WebSocket,
  options: {
    key: string;
    room?: Room;
    code?: string;
    vars?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  }
): void {
  sendLocalizedErrorPresenter(ws, messagePresenterDeps, options);
}

function sendReconnectForbidden(ws: WebSocket, room?: Room): void {
  sendReconnectForbiddenPresenter(ws, messagePresenterDeps, room);
}

const gameStatePresenterDeps = {
  disconnectGraceMs: DISCONNECT_GRACE_MS,
  overlaySubscriptions: overlaySubscriptions as Map<WebSocket, { roomCode: string; role: string }>,
  send,
  sendLocalizedError,
  canControl,
  getOverlayState,
  buildOverlayPresenterState,
  buildRoomState,
  diffTopLevel,
  localizeGameViewForLocale,
  getPlayerCardLocale,
  devLog,
};

async function sendOverlayState(room: Room, ws: WebSocket, role: Role = "VIEW") {
  await sendOverlayStatePresenter(room, ws, gameStatePresenterDeps, role);
}

function broadcastOverlayState(room: Room) {
  broadcastOverlayStatePresenter(room, gameStatePresenterDeps);
}

function devLog(...args: unknown[]) {
  if (!DEV_LOGS) return;
  console.log("[dev]", ...args);
}

function broadcastRoomState(room: Room): void {
  broadcastRoomStatePresenter(room, gameStatePresenterDeps);
}

function sendGameView(room: Room, player: Player): void {
  sendGameViewPresenter(room, player, gameStatePresenterDeps);
}

function broadcastGameViews(room: Room): void {
  broadcastGameViewsPresenter(room, gameStatePresenterDeps);
}

const removeLobbyPlayer = (room: Room, playerId: string): boolean =>
  removeLobbyPlayerState(room, playerId, {
    logRoomLifecycle,
    pickNextHost,
    updateRulesetIfAuto: (targetRoom) =>
      updateRulesetIfAuto(targetRoom, {
        classicScenarioId: CLASSIC_SCENARIO_ID,
        buildAutoRuleset,
        buildManualRuleset,
      }),
  });

const addLobbyBotPlayer = (room: Room, preferredName?: string): Player | null =>
  addLobbyBotPlayerState(
    room,
    {
      getEffectiveMaxPlayers: (targetRoom) =>
        getEffectiveMaxPlayers(targetRoom, {
          classicScenarioId: CLASSIC_SCENARIO_ID,
          maxClassicPlayers: MAX_CLASSIC_PLAYERS,
        }),
      logRoomLifecycle,
      tServerForRoom,
      updateRulesetIfAuto: (targetRoom) =>
        updateRulesetIfAuto(targetRoom, {
          classicScenarioId: CLASSIC_SCENARIO_ID,
          buildAutoRuleset,
          buildManualRuleset,
        }),
      generatePlayerReconnectToken,
    },
    preferredName
  );

const transferHost = (
  room: Room,
  reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual",
  excludeId?: string,
  preferredHostId?: string
): void =>
  transferHostState(
    room,
    reason,
    {
      pickNextHost,
      broadcastRoomState,
      broadcastEvent: broadcastEventRuntime,
      buildSystemEvent,
      tServerForRoom,
      sendHostChanged: (player, nextHostId, hostReason) => {
        if (!player.ws) return;
        send(player.ws, { type: "hostChanged", payload: { newHostId: nextHostId, reason: hostReason } });
      },
    },
    excludeId,
    preferredHostId
  );

const scheduleHostTransfer = (room: Room, reason: "disconnect_timeout" | "left_bunker" | "eliminated"): void =>
  scheduleHostTransferState(room, reason, {
    pickNextHost,
    broadcastRoomState,
    broadcastEvent: broadcastEventRuntime,
    buildSystemEvent,
    tServerForRoom,
    hostGraceMs: HOST_GRACE_MS,
    unrefTimer,
    sendHostChanged: (player, nextHostId, hostReason) => {
      if (!player.ws) return;
      send(player.ws, { type: "hostChanged", payload: { newHostId: nextHostId, reason: hostReason } });
    },
  });

const markPlayerLeftBunker = (room: Room, player: Player) =>
  markPlayerLeftBunkerState(room, player, {
    pickNextHost,
    broadcastRoomState,
    broadcastEvent: broadcastEventRuntime,
    buildSystemEvent,
    tServerForRoom,
    sendHostChanged: (targetPlayer, nextHostId, hostReason) => {
      if (!targetPlayer.ws) return;
      send(targetPlayer.ws, { type: "hostChanged", payload: { newHostId: nextHostId, reason: hostReason } });
    },
    broadcastGameViews,
  });

const computeKickRemainingMs = (player: Player, now = Date.now()): number =>
  computeKickRemainingMsState(player, DISCONNECT_GRACE_MS, now);

const findPlayerByToken = (room: Room, token?: string): Player | undefined => findPlayerByTokenState(room, token);

const findPlayerByTabId = (room: Room, tabId?: string): Player | undefined => findPlayerByTabIdState(room, tabId);

const findPlayerBySessionId = (room: Room, sessionId?: string): Player | undefined =>
  findPlayerBySessionIdState(room, sessionId);

const attachPlayer = (room: Room, payload: ClientHelloPayload, ws: WebSocket, existing?: Player): Player =>
  attachPlayerState(
    room,
    payload,
    ws,
    {
      broadcastEvent: broadcastEventRuntime,
      buildSystemEvent,
      identityMode: IDENTITY_MODE,
      tServerForRoom,
      send: (socket, message) => send(socket, message as ServerMessage),
      generatePlayerReconnectToken,
    },
    existing
  );

const isClassicRoomRuntime = (room: Room): boolean => isClassicRoom(room, CLASSIC_SCENARIO_ID);
const getEffectiveMaxPlayersRuntime = (room: Room): number =>
  getEffectiveMaxPlayers(room, {
    classicScenarioId: CLASSIC_SCENARIO_ID,
    maxClassicPlayers: MAX_CLASSIC_PLAYERS,
  });
const updateRulesetIfAutoRuntime = (room: Room): void =>
  updateRulesetIfAuto(room, {
    classicScenarioId: CLASSIC_SCENARIO_ID,
    buildAutoRuleset,
    buildManualRuleset,
  });
const broadcastEventRuntime = (room: Room, event: GameEvent): void => {
  for (const player of room.players.values()) {
    if (!player.ws || player.ws.readyState !== WebSocket.OPEN) continue;
    send(player.ws, {
      type: "gameEvent",
      payload: localizeGameEventForLocale(event, getPlayerCardLocale(player), room.scenarioId),
    });
  }
};

async function main() {
  const runtimeContext = await createRuntimeContext({
    assetsRoot: ASSETS_ROOT,
    devScenariosEnabled: DEV_SCENARIOS_ENABLED,
  });
  const { assets, availableScenarios, scenarioMap } = runtimeContext;
  controlDeckCatalog = runtimeContext.controlDeckCatalog;

  const app = express();
  if (TRUST_PROXY) {
    app.set("trust proxy", true);
  }
  app.use((req, res, next) => {
    const originAllowed = applyCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
      if (ENFORCE_ORIGIN_CHECKS && req.get("origin") && !originAllowed) {
        res.status(403).end();
        return;
      }
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "256kb" }));

  const enforceSensitiveOrigin = (req: Request, res: Response, next: NextFunction) => {
    if (!ENFORCE_ORIGIN_CHECKS) {
      next();
      return;
    }
    const originHeader = req.get("origin");
    const requestOrigin = buildRequestOrigin(req.protocol, req.get("host"));
    const allowed = isOriginAllowed(originHeader, requestOrigin, { allowMissingOrigin: false });
    if (!allowed) {
      res.status(403).json({ ok: false, message: tServerForRoom(undefined, "error.forbidden") });
      return;
    }
    next();
  };

  const enforceSensitiveHttpRateLimit = (req: Request, res: Response, next: NextFunction) => {
    if (!SENSITIVE_HTTP_RATE_LIMIT_ENABLED) {
      next();
      return;
    }

    const now = Date.now();
    maybeCleanupSensitiveHttpRateBuckets(now);
    const clientIp = normalizeIpForRateLimit(req);
    const routeKey = `${req.method.toUpperCase()} ${req.path}`;
    const bucketKey = `${clientIp}|${routeKey}`;
    const bucket = touchSensitiveHttpRateLimitBucket(bucketKey, now);

    if (bucket.count > SENSITIVE_HTTP_RATE_LIMIT_MAX) {
      const signature = `${clientIp}|${routeKey}`;
      if (!sensitiveHttpRateLimitSignatures.has(signature)) {
        sensitiveHttpRateLimitSignatures.add(signature);
        console.warn(
          `[security] sensitive http rate-limit exceeded ip=${clientIp} route=${routeKey} count=${bucket.count} windowMs=${SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS} max=${SENSITIVE_HTTP_RATE_LIMIT_MAX}`
        );
      }

      res.status(429).json({
        ok: false,
        message: tServerForRoom(undefined, "error.tooManyRequests"),
      });
      return;
    }

    next();
  };

  const sensitiveOriginRoutes: string[] = [
    LINK_PATHS.overlayControlState,
    LINK_PATHS.overlayControlSave,
    LINK_PATHS.overlayControlAction,
    LINK_PATHS.overlayControlInviteCreate,
    LINK_PATHS.overlayControlInviteExchange,
    LINK_PATHS.overlayControlInviteRevoke,
    LINK_PATHS.spectatorInviteCreate,
    LINK_PATHS.spectatorInviteExchange,
    LINK_PATHS.apiOverlayLinks,
  ];

  const sensitiveRateLimitRoutes: string[] = [...sensitiveOriginRoutes, LINK_PATHS.overlayControl];

  app.use(sensitiveOriginRoutes, enforceSensitiveOrigin);
  app.use(sensitiveRateLimitRoutes, enforceSensitiveHttpRateLimit);

  app.get("/assets/decks/:deckName/:fileName", (req, res, next) => {
    if (req.params.deckName !== BACK_DECK_DIR_NAME) {
      next();
      return;
    }
    const resolvedPath = resolveBackDeckAssetPath(req.params.fileName, String(req.query.locale ?? ""));
    if (!resolvedPath) {
      next();
      return;
    }
    res.sendFile(resolvedPath);
  });

  app.use("/assets", express.static(ASSETS_ROOT));
  app.use("/locales", express.static(LOCALES_ROOT));
  app.use(LINK_PATHS.overlayAssets, express.static(OVERLAY_PUBLIC_ROOT));
  if (SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false }));
  }

  app.get(LINK_PATHS.overlayView, (_req, res) => {
    const overlayHtml = path.join(OVERLAY_PUBLIC_ROOT, "overlay.html");
    if (!fs.existsSync(overlayHtml)) {
      res.status(404).type("text/plain").send(tServerForRoom(undefined, "error.overlayPageNotFound"));
      return;
    }
    res.sendFile(overlayHtml);
  });

  app.get(LINK_PATHS.overlayControl, (req, res) => {
    const roomCode = String(req.query.room ?? req.query.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(req.query.token ?? "").trim();
    const inviteToken = String(req.query.invite ?? req.query.inviteToken ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      const message = tServerForRoom(room, "error.forbidden");
      sendAccessDeniedPage(res, {
        roomCode,
        title: message,
        message,
        status: 403,
      });
      return;
    }

    ensureOverlayTokensActive(room);
    ensureOverlayControlInviteActive(room);

    const tokenAllowed = token ? isOverlayEditAuthorized(room, token) : false;
    const inviteAllowed = inviteToken ? isOverlayControlInviteAuthorized(room, inviteToken) : false;
    if (!tokenAllowed && !inviteAllowed) {
      const message = tServerForRoom(room, "error.forbidden");
      sendAccessDeniedPage(res, {
        roomCode: room.code,
        title: message,
        message,
        status: 403,
      });
      return;
    }
    const controlHtml = path.join(OVERLAY_PUBLIC_ROOT, "overlay-control.html");
    if (!fs.existsSync(controlHtml)) {
      res.status(404).type("text/plain").send(tServerForRoom(room, "error.overlayControlPageNotFound"));
      return;
    }
    res.sendFile(controlHtml);
  });

  app.get("/api/overlay-backgrounds", (_req, res) => {
    const catalog = getOverlayBackgroundCatalog();
    res.json({
      ok: true,
      defaultPreset: catalog.defaultPreset,
      presets: catalog.presets,
    });
  });

  app.get("/api/overlay-url-presets", (_req, res) => {
    const presets = getOverlayUrlPresets();
    res.json({
      ok: true,
      presets,
    });
  });

  app.get(LINK_PATHS.overlayControlState, async (req, res) => {
    const roomCode = String(req.query.room ?? req.query.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(req.query.token ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    const tokenRole = getRoleForToken(room, token);
    if (tokenRole === null || !canControl(tokenRole)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }
    try {
      const controlState = await buildOverlayControlState(room);
      res.json({
        ok: true,
        role: tokenRole,
        ...controlState,
      });
    } catch (error) {
      console.error("[overlay-control] failed to build state:", error);
      res.status(500).json({ ok: false, message: tServerForRoom(room, "error.overlayControlStateBuildFailed") });
    }
  });

  app.post(LINK_PATHS.overlayControlSave, (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(payload.token ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }
    const normalized = normalizeOverlayOverrides(payload.overrides, room);
    const parsed = OverlayOverridesSchema.safeParse(normalized);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: tServerForRoom(room, "error.overlayOverridesInvalidPayload"),
      });
      return;
    }

    room.overlayOverrides = parsed.data;
    broadcastOverlayState(room);
    broadcastRoomState(room);
    res.json({
      ok: true,
      roomCode: room.code,
      overrides: room.overlayOverrides,
    });
  });

  app.post(LINK_PATHS.overlayControlInviteCreate, async (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(payload.token ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }

    rotateOverlayControlInvite(room, "host_create");

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    const invitePath = `${LINK_PATHS.overlayControl}?room=${encodeURIComponent(room.code)}&invite=${encodeURIComponent(
      room.overlayControlInviteToken
    )}`;
    const lanInviteUrl = `${lanOrigin}${invitePath}`;
    const publicInviteUrl = publicResolution.base ? `${publicResolution.base}${invitePath}` : null;

    res.json({
      ok: true,
      roomCode: room.code,
      inviteTokenExpiresInMs: OVERLAY_CONTROL_INVITE_TTL_MS > 0 ? OVERLAY_CONTROL_INVITE_TTL_MS : null,
      inviteUrlLan: lanInviteUrl,
      inviteUrlExternal: publicInviteUrl,
    });
  });

  app.post(LINK_PATHS.overlayControlInviteRevoke, (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(payload.token ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }

    rotateOverlayControlInvite(room, "host_revoke");

    res.json({
      ok: true,
      roomCode: room.code,
      inviteTokenExpiresInMs: OVERLAY_CONTROL_INVITE_TTL_MS > 0 ? OVERLAY_CONTROL_INVITE_TTL_MS : null,
    });
  });

  app.post(LINK_PATHS.overlayControlInviteExchange, async (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const inviteToken = String(payload.inviteToken ?? payload.invite ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    if (!isOverlayControlInviteAuthorized(room, inviteToken)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }

    ensureOverlayTokensActive(room);
    const controlSessionToken = rotateOverlayControlSessionToken(room, "invite_exchange");
    rotateOverlayControlInvite(room, "exchange");

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    const links = buildLinkSet({
      lanBase: lanOrigin,
      publicBase: publicResolution.base,
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      spectatorViewToken: room.spectatorToken,
      overlayControlToken: controlSessionToken,
      overlayControlInviteToken: room.overlayControlInviteToken,
      overlayQueryParams: room.overlayOverrides?.overlayUrlParams,
    });

    res.json({
      ok: true,
      roomCode: room.code,
      controlSessionToken,
      controlSessionExpiresInMs: OVERLAY_TOKEN_TTL_MS > 0 ? OVERLAY_TOKEN_TTL_MS : null,
      links,
    });
  });

  app.post(LINK_PATHS.spectatorInviteCreate, async (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(payload.token ?? "").trim();
    const maxUses = normalizeSpectatorInviteMaxUses(payload.maxUses);
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }

    const invite = issueSpectatorInvite(room, maxUses);
    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    const invitePath = `${LINK_PATHS.spectator}?room=${encodeURIComponent(room.code)}&invite=${encodeURIComponent(invite.token)}`;
    const inviteUrlLan = `${lanOrigin}${invitePath}`;
    const inviteUrlExternal = publicResolution.base ? `${publicResolution.base}${invitePath}` : null;

    res.json({
      ok: true,
      roomCode: room.code,
      maxUses: invite.maxUses,
      inviteTokenExpiresInMs: Math.max(0, invite.expiresAt - Date.now()),
      inviteUrlLan,
      inviteUrlExternal,
    });
  });

  app.post(LINK_PATHS.spectatorInviteExchange, async (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const inviteToken = String(payload.inviteToken ?? payload.invite ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }
    if (!consumeSpectatorInvite(room, inviteToken)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    const viewPath = `${LINK_PATHS.overlayView}?room=${encodeURIComponent(room.code)}&token=${encodeURIComponent(room.spectatorToken)}`;

    res.json({
      ok: true,
      roomCode: room.code,
      viewUrlLan: `${lanOrigin}${viewPath}`,
      viewUrlExternal: publicResolution.base ? `${publicResolution.base}${viewPath}` : null,
    });
  });

  app.post("/api/desktop/access", async (req, res) => {
    if (!isDesktopApiAuthorized(req)) {
      res.status(403).json({ ok: false, message: tServerForRoom(undefined, "error.forbidden") });
      return;
    }

    const payload = isRecord(req.body) ? req.body : {};
    const requestedRoomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const room =
      requestedRoomCode.length > 0
        ? rooms.get(requestedRoomCode)
        : rooms.size === 1
          ? Array.from(rooms.values())[0]
          : undefined;

    if (!room) {
      if (requestedRoomCode.length > 0) {
        res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
        return;
      }

      if (rooms.size === 0) {
        res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.noActiveRoom") });
        return;
      }

      res.status(409).json({ ok: false, message: tServerForRoom(undefined, "error.roomSelectionRequired") });
      return;
    }

    ensureOverlayTokensActive(room);
    ensureOverlayControlInviteActive(room);

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    const links = buildLinkSet({
      lanBase: lanOrigin,
      publicBase: publicResolution.base,
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      spectatorViewToken: room.spectatorToken,
      overlayControlToken: room.overlayEditToken,
      overlayControlInviteToken: room.overlayControlInviteToken,
      overlayQueryParams: room.overlayOverrides?.overlayUrlParams,
    });

    res.json({
      ok: true,
      roomCode: room.code,
      links: {
        appUrl: links.appUrl,
        overlayViewUrl: links.overlayViewUrl,
      },
    });
  });

  app.post("/api/desktop/endpoints", async (req, res) => {
    if (!isDesktopApiAuthorized(req)) {
      res.status(403).json({ ok: false, message: tServerForRoom(undefined, "error.forbidden") });
      return;
    }

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);

    res.json({
      ok: true,
      base: {
        lan: lanOrigin,
        public: publicResolution.base ?? null,
      },
    });
  });

  app.post("/api/desktop/control-invite", async (req, res) => {
    if (!isDesktopApiAuthorized(req)) {
      res.status(403).json({ ok: false, message: tServerForRoom(undefined, "error.forbidden") });
      return;
    }

    const payload = isRecord(req.body) ? req.body : {};
    const requestedRoomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const room =
      requestedRoomCode.length > 0
        ? rooms.get(requestedRoomCode)
        : rooms.size === 1
          ? Array.from(rooms.values())[0]
          : undefined;

    if (!room) {
      if (requestedRoomCode.length > 0) {
        res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
        return;
      }

      if (rooms.size === 0) {
        res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.noActiveRoom") });
        return;
      }

      res.status(409).json({ ok: false, message: tServerForRoom(undefined, "error.roomSelectionRequired") });
      return;
    }

    rotateOverlayControlInvite(room, "host_create");
    ensureOverlayTokensActive(room);

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    const links = buildLinkSet({
      lanBase: lanOrigin,
      publicBase: publicResolution.base,
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      spectatorViewToken: room.spectatorToken,
      overlayControlToken: room.overlayEditToken,
      overlayControlInviteToken: room.overlayControlInviteToken,
      overlayQueryParams: room.overlayOverrides?.overlayUrlParams,
    });

    res.json({
      ok: true,
      roomCode: room.code,
      inviteUrlLan: links.overlayControlUrl.lan,
      inviteUrlExternal: links.overlayControlUrl.public ?? null,
    });
  });

  app.post(LINK_PATHS.apiOverlayLinks, async (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(payload.token ?? "").trim();

    if (!roomCode || !token) {
      res
        .status(400)
        .json({ ok: false, message: tServerForRoom(undefined, "error.overlayLinksRequireRoomAndToken") });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }

    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }

    ensureOverlayTokensActive(room);
    ensureOverlayControlInviteActive(room);

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    logPublicBaseResolution(publicResolution);
    const requestedLocale = normalizeCardLocale(payload.locale);
    const overlayQueryParams = {
      lang: requestedLocale,
      ...(room.overlayOverrides?.overlayUrlParams ?? {}),
    };
    const links = buildLinkSet({
      lanBase: lanOrigin,
      publicBase: publicResolution.base,
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      spectatorViewToken: room.spectatorToken,
      overlayControlToken: room.overlayEditToken,
      overlayControlInviteToken: room.overlayControlInviteToken,
      overlayQueryParams,
    });

    res.json({
      ok: true,
      linkVisibility: HIDE_LOCAL_LINKS_IN_LOGS ? "public" : "all",
      buildProfile: BUILD_PROFILE || "public",
      roomCode: room.code,
      links,
    });
  });

  app.get("/api/scenarios", (_req, res) => {
    res.json(availableScenarios.map((scenario) => scenario.meta));
  });

  app.post(LINK_PATHS.overlayControlAction, (req, res) => {
    const requestPayload = isRecord(req.body) ? req.body : {};
    const roomCode = String(requestPayload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(requestPayload.token ?? "").trim();
    const action = String(requestPayload.action ?? "").trim().toUpperCase() as ControlCommand;
    const targetPlayerId = String(requestPayload.targetPlayerId ?? "").trim();
    const actorPlayerId = String(requestPayload.actorPlayerId ?? "").trim();
    const scenarioActionType = String(requestPayload.scenarioActionType ?? "").trim();
    const scenarioPayload = isRecord(requestPayload.scenarioPayload)
      ? requestPayload.scenarioPayload
      : isRecord(requestPayload.payload)
        ? requestPayload.payload
        : {};

    if (!roomCode || !token || !action) {
      res
        .status(400)
        .json({ ok: false, message: tServerForRoom(undefined, "error.overlayActionRequireRoomTokenAction") });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: tServerForRoom(undefined, "error.roomNotFound") });
      return;
    }

    const tokenRole = getRoleForToken(room, token);
    if (tokenRole === null || !canControl(tokenRole)) {
      res.status(403).json({ ok: false, message: tServerForRoom(room, "error.forbidden") });
      return;
    }
    if (!room.settings.enablePresenterMode) {
      res.status(400).json({ ok: false, message: tServerForRoom(room, "error.presenterModeDisabled") });
      return;
    }

    const result = runControlCommand(
      room,
      action,
      {
        assets,
        rooms,
        classicScenarioId: CLASSIC_SCENARIO_ID,
        minClassicPlayers: MIN_CLASSIC_PLAYERS,
        isClassicRoom: isClassicRoomRuntime,
        updateRulesetIfAuto: updateRulesetIfAutoRuntime,
        broadcastRoomState,
        broadcastGameViews,
        broadcastEvent: broadcastEventRuntime,
        buildSystemEvent,
        pickNextHost,
        transferHost,
        removeLobbyPlayer,
        addLobbyBotPlayer,
        getCurrentTurnPlayerId,
        resolveControlActorId,
      },
      {
        targetPlayerId,
        actorPlayerId,
        scenarioActionType,
        scenarioPayload,
      }
    );
    if (!result.ok) {
      const localizedMessage = result.message
        ? localizeScenarioMessage(result.message, getOverlayLocale(room), room.scenarioId)
        : result.messageKey
          ? tServerForRoom(room, result.messageKey, result.messageVars)
          : tServerForRoom(room, "error.actionRejected");
      res.status(400).json({ ok: false, message: localizedMessage });
      return;
    }

    res.json({
      ok: true,
      roomCode: room.code,
      role: tokenRole,
      presenterModeEnabled: Boolean(room.settings.enablePresenterMode),
      presenter: buildOverlayPresenterState(room),
    });
  });

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/assets")) return next();
    if (SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
      const indexPath = path.join(CLIENT_DIST, "index.html");
      if (fs.existsSync(indexPath)) {
        res.status(200).type("html").send(renderClientIndexHtml(IDENTITY_MODE));
        return;
      }
    }
    if (!SERVE_CLIENT && req.path === "/") {
      res
        .status(200)
        .type("text/plain")
        .send("Dev client is served by Vite on http://localhost:5173");
      return;
    }
    next();
  });

  const httpServer = createServer(app);
  const httpSockets = new Set<Socket>();
  httpServer.on("connection", (socket) => {
    httpSockets.add(socket);
    socket.on("close", () => httpSockets.delete(socket));
  });
  const wss = new WebSocketServer({ server: httpServer });
  roomCleanupTimer = setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL_MS);
  unrefTimer(roomCleanupTimer);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down...`);

    for (const room of rooms.values()) {
      if (room.hostTransferTimer) {
        clearTimeout(room.hostTransferTimer);
        room.hostTransferTimer = undefined;
      }
      for (const player of room.players.values()) {
        if (player.disconnectTimer) {
          clearTimeout(player.disconnectTimer);
          player.disconnectTimer = undefined;
        }
        if (player.disconnectTicker) {
          clearInterval(player.disconnectTicker);
          player.disconnectTicker = undefined;
        }
      }
    }
    if (roomCleanupTimer) {
      clearInterval(roomCleanupTimer);
      roomCleanupTimer = undefined;
    }

    for (const ws of overlaySubscriptions.keys()) {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    }
    overlaySubscriptions.clear();

    for (const client of wss.clients) {
      try {
        client.terminate();
      } catch {
        // ignore
      }
    }

    for (const socket of httpSockets) {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
    }
    httpSockets.clear();

    const forceExit = setTimeout(() => {
      process.exit(0);
    }, 250);
    forceExit.unref();

    wss.close(() => {
      httpServer.close(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGBREAK", () => shutdown("SIGBREAK"));
  process.on("SIGHUP", () => shutdown("SIGHUP"));

  const { routerDeps, socketCloseDeps } = createWsContexts({
    identityMode: IDENTITY_MODE,
    devLogs: DEV_LOGS,
    devScenariosEnabled: DEV_SCENARIOS_ENABLED,
    reconnectGraceAfterKickMs: RECONNECT_GRACE_AFTER_KICK_MS,
    disconnectGraceMs: DISCONNECT_GRACE_MS,
    minClassicPlayers: MIN_CLASSIC_PLAYERS,
    maxClassicPlayers: MAX_CLASSIC_PLAYERS,
    classicScenarioId: CLASSIC_SCENARIO_ID,
    defaultSettings: DEFAULT_SETTINGS,
    assets,
    scenarioMap,
    rooms,
    connectionInfo,
    overlaySubscriptions: overlaySubscriptions as Map<WebSocket, { roomCode: string; role: string }>,
    sendLocalizedError,
    sendReconnectForbidden,
    send,
    devLog,
    logProtocol,
    logRoomLifecycle,
    createLobbyRoom,
    buildAutoRuleset,
    generateRoomCode,
    buildDisasterOptions,
    normalizeCardLocale,
    generateOverlayViewToken,
    generateSpectatorToken,
    generateOverlayControlToken,
    generateOverlayControlInviteToken,
    attachPlayer,
    printOverlayInfo,
    updateRulesetIfAuto: updateRulesetIfAutoRuntime,
    broadcastRoomState,
    broadcastGameViews,
    sendGameView,
    buildRoomState,
    localizeGameViewForLocale,
    getPlayerCardLocale,
    findPlayerByTabId,
    findPlayerByToken,
    findPlayerBySessionId,
    getScenarioStatus,
    computeKickRemainingMs,
    markPlayerLeftBunker,
    getEffectiveMaxPlayers: getEffectiveMaxPlayersRuntime,
    getRoleForToken,
    getRoleForPlayer,
    canControl,
    canPlayerAction,
    sendOverlayState,
    tServerForRoom,
    startGameAsControl: (room) =>
      startGameAsControl(room, {
        assets,
        rooms,
        classicScenarioId: CLASSIC_SCENARIO_ID,
        minClassicPlayers: MIN_CLASSIC_PLAYERS,
        isClassicRoom: isClassicRoomRuntime,
        updateRulesetIfAuto: updateRulesetIfAutoRuntime,
        broadcastRoomState,
        broadcastGameViews,
        broadcastEvent: broadcastEventRuntime,
        buildSystemEvent,
        pickNextHost,
        transferHost,
        removeLobbyPlayer,
        addLobbyBotPlayer,
        getCurrentTurnPlayerId,
        resolveControlActorId,
      }),
    isClassicRoom: isClassicRoomRuntime,
    clampInt,
    normalizeForcedDisasterId,
    normalizeManualConfig,
    seedManualConfigFromPreset,
    buildManualRuleset,
    pickNextHost,
    transferHost,
    removeLobbyPlayer,
    resolveControlActorId,
    getCurrentTurnPlayerId,
    localizeScenarioMessageForPlayer,
    broadcastEvent: broadcastEventRuntime,
    buildSystemEvent,
    formatRemaining,
    unrefTimer,
    scheduleHostTransfer,
  });

  wss.on("connection", (ws, request) => {
    if (
      !validateWsOrigin(ws, request, {
        enforceOriginChecks: ENFORCE_ORIGIN_CHECKS,
        getUpgradeRequestOrigin,
        isOriginAllowed,
        normalizeOrigin,
      })
    ) {
      return;
    }

    ws.on("message", (data) => {
      const message = parseIncomingClientMessage(ws, data, {
        sendLocalizedError,
        logProtocol,
      });
      if (!message) {
        return;
      }

      routeClientMessage(ws, message, routerDeps);
    });

    ws.on("close", () => {
      handleSocketClose(ws, socketCloseDeps);
    });
  });

  httpServer.listen(PORT, HOST, () => {
    const address = httpServer.address();
    if (address && typeof address !== "string") {
      LISTEN_PORT = (address as AddressInfo).port;
    } else {
      LISTEN_PORT = PORT;
    }
    const deckCount = Object.keys(assets.decks).length;
    console.log(`__BUNKER_PORT__=${LISTEN_PORT}`);
    console.log(`Server listening on http://${HOST}:${LISTEN_PORT}`);
    if (PUBLIC_ORIGIN) {
      console.log(`Public origin: ${PUBLIC_ORIGIN}`);
    }
    const allowedOriginsList = Array.from(ALLOWED_ORIGINS).filter((origin) => origin !== "*");
    const allowedOriginsText = ALLOW_ALL_ORIGINS
      ? "*"
      : allowedOriginsList.length > 0
        ? allowedOriginsList.join(", ")
        : ENFORCE_ORIGIN_CHECKS
          ? "same-origin"
          : "all (compat)";
    console.log(`Origin checks: ${ENFORCE_ORIGIN_CHECKS ? "enforced" : "compat"} (allowed: ${allowedOriginsText})`);
    console.log(
      `Sensitive HTTP rate-limit: ${SENSITIVE_HTTP_RATE_LIMIT_ENABLED ? "enabled" : "disabled"} (max=${SENSITIVE_HTTP_RATE_LIMIT_MAX}, window=${SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS}ms)`
    );
    console.log(`Overlay token TTL: ${OVERLAY_TOKEN_TTL_MS > 0 ? `${OVERLAY_TOKEN_TTL_MS}ms` : "disabled"}`);
    console.log(`Assets root: ${ASSETS_ROOT} (decks: ${deckCount}, source: ${ASSETS_ROOT_SOURCE})`);
    if (SERVE_CLIENT) {
      console.log(`Client dist: ${CLIENT_DIST} (source: ${CLIENT_DIST_SOURCE})`);
    }
    console.log(`Overlay assets: ${OVERLAY_PUBLIC_ROOT}`);
    console.log(`Loaded scenarios: ${availableScenarios.map((s) => s.meta.name).join(", ")}`);
    void resolvePublicBase(LISTEN_PORT)
      .then((resolution) => logPublicBaseResolution(resolution))
      .catch(() => logPublicBaseResolution({ source: "EMPTY" }));
    if (DEV_LOGS) {
      console.log(`[dev] mode=${IDENTITY_MODE} logs=on`);
    }
  });
}

main().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
