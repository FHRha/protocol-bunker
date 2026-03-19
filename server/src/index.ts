import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
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
  type ScenarioContext,
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
import { buildAssetCatalog } from "./catalog.js";
import { createRandomRng } from "./rng.js";
import {
  getSubtitleMap,
  resolveCardKeyFromAssetId as resolveSubtitleCardKeyFromAssetId,
  type SubtitleMap,
} from "./card_subtitles.js";
import { getDisasterTextByAssetId } from "./world_texts.js";
import { normalizeServerLocale, tServer, type ServerLocaleCode } from "./serverLocale.js";
import { localizeScenarioMessage } from "./scenarioLocale.js";
import { localizeSpecialConditionField } from "./specialConditionLocale.js";
import { loadScenarios } from "@bunker/scenarios";

interface Player {
  playerId: string;
  name: string;
  token: string;
  tabId?: string;
  sessionId?: string;
  ws?: WebSocket;
  connected: boolean;
  disconnectedAt?: number;
  totalAbsentMs?: number;
  scenarioStatus?: PlayerStatus;
  eliminatedAt?: number;
  leftBunker?: boolean;
  kickedAt?: number;
  disconnectTimer?: ReturnType<typeof setTimeout>;
  disconnectTicker?: ReturnType<typeof setInterval>;
  disconnectNotifiedMinutes?: number;
  needsFullState?: boolean;
  needsFullGameView?: boolean;
}

interface Room {
  code: string;
  hostId: string;
  controlId: string;
  createdAt: number;
  phase: "lobby" | "game";
  scenarioId: string;
  scenarioMeta: ScenarioMeta;
  scenarioModule: ScenarioModule;
  settings: GameSettings;
  disasterOptions: Array<{ id: string; title: string }>;
  ruleset: GameRuleset;
  rulesOverriddenByHost: boolean;
  rulesPresetCount?: number;
  world?: WorldState30;
  isDev?: boolean;
  players: Map<string, Player>;
  playersByToken: Map<string, string>;
  playersByTabId: Map<string, string>;
  playersBySessionId: Map<string, string>;
  joinOrder: string[];
  hostTransferTimer?: ReturnType<typeof setTimeout>;
  session?: ScenarioSession;
  sessionContext?: ScenarioContext;
  sessionPlayerIds?: Set<string>;
  lastRoomState?: RoomState;
  lastGameViews?: Map<string, ReturnType<ScenarioSession["getGameView"]>>;
  overlayToken: string;
  overlayEditToken: string;
  overlayOverrides?: OverlayOverrides;
}

const PORT = Number(process.env.PORT ?? 3000);
let LISTEN_PORT = PORT;
const HOST = process.env.HOST ?? "0.0.0.0";
const ASSETS_PRIMARY = path.resolve(process.cwd(), "assets");
const ASSETS_FALLBACK = path.resolve(process.cwd(), "..", "assets");
const LOCALES_PRIMARY = path.resolve(process.cwd(), "locales");
const LOCALES_FALLBACK = path.resolve(process.cwd(), "..", "locales");
const CLIENT_DIST_PRIMARY = path.resolve(process.cwd(), "client", "dist");
const CLIENT_DIST_FALLBACK = path.resolve(process.cwd(), "..", "client", "dist");
const OVERLAY_PUBLIC_PRIMARY = path.resolve(process.cwd(), "server", "public", "overlay");
const OVERLAY_PUBLIC_FALLBACK = path.resolve(process.cwd(), "public", "overlay");

const resolveOptionalPath = (envKey: string, primary: string, fallback: string) => {
  const raw = process.env[envKey]?.trim();
  if (raw) {
    const resolved = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
    return { path: resolved, source: `${envKey}=${raw}` };
  }
  const chosen = fs.existsSync(primary) ? primary : fallback;
  return { path: chosen, source: fs.existsSync(primary) ? "default(primary)" : "default(fallback)" };
};

const assetsResolved = resolveOptionalPath("BUNKER_ASSETS_ROOT", ASSETS_PRIMARY, ASSETS_FALLBACK);
const ASSETS_ROOT = assetsResolved.path;
const localesResolved = resolveOptionalPath("BUNKER_LOCALES_ROOT", LOCALES_PRIMARY, LOCALES_FALLBACK);
const LOCALES_ROOT = localesResolved.path;
const clientResolved = resolveOptionalPath("BUNKER_CLIENT_DIST", CLIENT_DIST_PRIMARY, CLIENT_DIST_FALLBACK);
const CLIENT_DIST = clientResolved.path;
const overlayPublicResolved = fs.existsSync(OVERLAY_PUBLIC_PRIMARY)
  ? OVERLAY_PUBLIC_PRIMARY
  : OVERLAY_PUBLIC_FALLBACK;
const OVERLAY_PUBLIC_ROOT = overlayPublicResolved;
type IdentityMode = "prod" | "dev_tab";
const IDENTITY_MODE: IdentityMode =
  process.env.BUNKER_IDENTITY_MODE?.trim().toLowerCase() === "dev_tab" ||
  envFlag(process.env.DEV_NEW_PLAYER_PER_TAB)
    ? "dev_tab"
    : "prod";
const DEV_LOGS = IDENTITY_MODE === "dev_tab" || envFlag(process.env.BUNKER_DEV_LOGS);
const DEV_SCENARIOS_ENABLED =
  IDENTITY_MODE === "dev_tab" || envFlag(process.env.BUNKER_ENABLE_DEV_SCENARIOS);
const DISCONNECT_GRACE_MS = 300_000;
const RECONNECT_GRACE_AFTER_KICK_MS = 300_000;
const HOST_GRACE_MS = 60_000;
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.BUNKER_ROOM_CLEANUP_INTERVAL_MS ?? 60_000);
const ROOM_INACTIVE_TTL_MS = Number(process.env.BUNKER_ROOM_INACTIVE_TTL_MS ?? 6 * 60 * 60 * 1000);
const ROOM_ENDED_TTL_MS = Number(process.env.BUNKER_ROOM_ENDED_TTL_MS ?? 30 * 60 * 1000);
const CLASSIC_SCENARIO_ID = "classic";
const MIN_CLASSIC_PLAYERS = 4;
const MAX_CLASSIC_PLAYERS = 16;
const TRUST_PROXY = envFlag(process.env.TRUST_PROXY);
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN;
const PUBLIC_HOST = process.env.PUBLIC_HOST ?? process.env.BUNKER_PUBLIC_HOST;
const DOMAIN = process.env.DOMAIN ?? process.env.BUNKER_DOMAIN;
const BUILD_PROFILE = (process.env.BUNKER_BUILD_PROFILE ?? "").trim().toLowerCase();
const LINKS_VISIBILITY_MODE = (
  process.env.BUNKER_LINKS_VISIBILITY ?? (BUILD_PROFILE === "server" ? "public" : "all")
)
  .trim()
  .toLowerCase();
const HIDE_LOCAL_LINKS_IN_LOGS =
  LINKS_VISIBILITY_MODE === "public" || LINKS_VISIBILITY_MODE === "external";
const SERVE_CLIENT = process.env.BUNKER_SERVE_CLIENT !== "false";
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
const WAN_LOOKUP_TIMEOUT_MS = 2800;
const WAN_LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;

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
let clientIndexCacheStamp = "";
let clientIndexCacheHtml = "";
let controlDeckCatalog: Record<string, Array<{ id: string; labelShort: string }>> = {};

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

function envFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

function hostFromOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
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
  let lanIp = selectLanIp();
  if (!allowLocalhost && isLocalHostValue(lanIp)) {
    const requestHost = hostFromOrigin(normalizeOrigin(requestOrigin) ?? undefined);
    if (requestHost && !isLocalHostValue(requestHost)) {
      lanIp = requestHost;
    } else if (HOST && HOST !== "0.0.0.0" && !isLocalHostValue(HOST)) {
      lanIp = HOST;
    } else {
      lanIp = "0.0.0.0";
    }
  }

  const lanOrigin = `http://${lanIp}:${LISTEN_PORT}`;
  return { lanOrigin, lanIp };
}

function printOverlayInfo(
  roomCode: string,
  token: string,
  controlToken?: string,
  overlayQueryParams?: Record<string, string>
) {
  const { lanOrigin } = buildLinkOrigins();
  const links = buildLinkSet({
    lanBase: lanOrigin,
    publicBase: undefined,
    roomCode,
    overlayViewToken: token,
    overlayControlToken: controlToken ?? "<CONTROL_OR_EDIT_TOKEN>",
    overlayQueryParams,
  });

  const line = "-".repeat(72);

  console.log(paint(line, "dim"));
  console.log(paint("OBS OVERLAY", "bold", "cyan"));
  console.log(`${paint("Room:", "yellow")}        ${paint(roomCode, "bold", "yellow")}`);
  console.log(`${paint("Token:", "magenta")}       ${paint(token, "magenta")}`);
  if (!HIDE_LOCAL_LINKS_IN_LOGS) {
    console.log(`${paint("App LAN:", "blue")}     ${paint(links.appUrl.lan, "underline", "blue")}`);
    console.log(`${paint("Spec LAN:", "green")}    ${paint(links.viewerUrl.lan, "underline", "green")}`);
    console.log(`${paint("View LAN:", "cyan")}    ${paint(links.overlayViewUrl.lan, "underline", "cyan")}`);
    console.log(`${paint("Dbg LAN:", "yellow")}     ${paint(links.overlayDebugUrl.lan, "underline", "yellow")}`);
    console.log(`${paint("Ctrl LAN:", "magenta")}   ${paint(links.overlayControlUrl.lan, "underline", "magenta")}`);
    console.log(`${paint("API LAN:", "blue")}     ${paint(links.overlayControlStateUrl.lan, "underline", "blue")}`);
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
        overlayControlToken: controlToken ?? "<CONTROL_OR_EDIT_TOKEN>",
        overlayQueryParams,
      });
      console.log(`${paint("App Ext:", "blue")}     ${paint(publicLinks.appUrl.public ?? "", "underline", "blue")}`);
      console.log(`${paint("Spec Ext:", "green")}    ${paint(publicLinks.viewerUrl.public ?? "", "underline", "green")}`);
      console.log(`${paint("View Ext:", "cyan")}    ${paint(publicLinks.overlayViewUrl.public ?? "", "underline", "cyan")}`);
      if (publicLinks.overlayDebugUrl.public) {
        console.log(`${paint("Dbg Ext:", "yellow")}     ${paint(publicLinks.overlayDebugUrl.public, "underline", "yellow")}`);
      }
      console.log(
        `${paint("Ctrl Ext:", "magenta")}   ${paint(publicLinks.overlayControlUrl.public ?? "", "underline", "magenta")}`
      );
      console.log(
        `${paint("API Ext:", "blue")}     ${paint(publicLinks.overlayControlStateUrl.public ?? "", "underline", "blue")}`
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

function logRoomLifecycle(event: string, roomCode: string, details: Record<string, unknown>) {
  const payload =
    Object.entries(details)
      .map(([key, value]) => `${key}=${String(value)}`)
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
  профессия: "profession",
  здоровье: "health",
  хобби: "hobby",
  багаж: "baggage",
  факты: "fact",
  биология: "biology",
  "особые условия": "special",
  бункер: "bunker",
  катастрофа: "disaster",
  угроза: "threat",
  рубашки: "back",
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
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, maxLength);
  return normalized;
}

function sanitizeMultiLine(value: unknown, maxLength: number): string {
  const text = String(value ?? "");
  const normalized = text
    .replace(/\r\n?/g, "\n")
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
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
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
  const localizedText = getDisasterTextByAssetId(lookupAssetId, locale) ?? card.text;
  return {
    ...card,
    title: localizeCardLabel(lookupAssetId, card.title, locale),
    description: localizeCardLabel(lookupAssetId, card.description, locale),
    imageId: resolveLocalizedAssetId(card.imageId, locale),
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

function localizeGameViewForLocale(
  view: ReturnType<ScenarioSession["getGameView"]>,
  locale: CardLocaleCode,
  scenarioId?: string
): ReturnType<ScenarioSession["getGameView"]> {
  const localizedHand = view.you.hand.map((card) => ({
    ...card,
    labelShort: localizeCardLabel(card.id, card.labelShort ?? "", locale),
  }));
  const handLabelByInstanceId = new Map(localizedHand.map((card) => [card.instanceId, card.labelShort] as const));

  return {
    ...view,
    lastStageText: view.lastStageText
      ? localizeScenarioMessage(view.lastStageText, locale, scenarioId)
      : view.lastStageText,
    world: localizeWorldStateForLocale(view.world, locale),
    you: {
      ...view.you,
      hand: localizedHand,
      categories: view.you.categories.map((slot) => ({
        ...slot,
        cards: slot.cards.map((card) => ({
          ...card,
          labelShort: handLabelByInstanceId.get(card.instanceId) ?? card.labelShort,
        })),
      })),
      specialConditions: view.you.specialConditions.map((special) => localizeSpecialConditionForLocale(scenarioId, special, locale)),
    },
    public: {
      ...view.public,
      votesPublic: view.public.votesPublic?.map((vote) => ({
        ...vote,
        reason: vote.reason
          ? localizeScenarioMessage(vote.reason, locale, scenarioId)
          : vote.reason,
      })),
      resolutionNote: view.public.resolutionNote
        ? localizeScenarioMessage(view.public.resolutionNote, locale, scenarioId)
        : view.public.resolutionNote,
      threatModifier: view.public.threatModifier
        ? {
            ...view.public.threatModifier,
            reasons: view.public.threatModifier.reasons.map((reason) =>
              localizeScenarioMessage(reason, locale, scenarioId)
            ),
          }
        : view.public.threatModifier,
      players: view.public.players.map((player) => ({
        ...player,
        revealedCards: player.revealedCards.map((card) => ({
          ...card,
          labelShort: localizeCardLabel(card.id, card.labelShort ?? "", locale),
        })),
        categories: player.categories.map((slot) => ({
          ...slot,
          cards: slot.cards.map((card) => ({
            ...card,
            labelShort: localizeCardLabel(
              resolveAssetIdFromImageUrl(card.imgUrl),
              card.labelShort,
              locale
            ),
            imgUrl: localizeAssetUrl(card.imgUrl, locale),
          })),
        })),
      })),
    },
  };
}

const getRoomCardLocale = (room: Room): CardLocaleCode => normalizeCardLocale(room.settings.cardLocale);

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
  cardLocale: "ru",
};

const rooms = new Map<string, Room>();
const connectionInfo = new WeakMap<WebSocket, { roomCode: string; playerId: string }>();
const overlaySubscriptions = new Map<WebSocket, { roomCode: string; role: Role }>();
let roomCleanupTimer: ReturnType<typeof setInterval> | undefined;

function hasOverlaySubscribers(roomCode: string): boolean {
  for (const sub of overlaySubscriptions.values()) {
    if (sub.roomCode === roomCode) return true;
  }
  return false;
}

function getRoomGamePhase(room: Room): string | undefined {
  if (room.lastGameViews && room.lastGameViews.size > 0) {
    const cached = room.lastGameViews.values().next().value as { phase?: string } | undefined;
    if (cached?.phase) return cached.phase;
  }
  if (!room.session) return undefined;
  const anchorId = room.players.has(room.hostId)
    ? room.hostId
    : room.joinOrder.find((id) => room.players.has(id));
  if (!anchorId) return undefined;
  try {
    return room.session.getGameView(anchorId).phase;
  } catch {
    return undefined;
  }
}

function cleanupInactiveRooms(): void {
  const now = Date.now();
  for (const [roomCode, room] of rooms.entries()) {
    const players = Array.from(room.players.values());
    if (players.length === 0) {
      logRoomLifecycle("closed", roomCode, { reason: "cleanup_empty" });
      rooms.delete(roomCode);
      continue;
    }
    if (players.some((player) => player.connected || Boolean(player.ws))) continue;
    if (hasOverlaySubscribers(roomCode)) continue;

    let lastDisconnectAt = 0;
    for (const player of players) {
      if (player.disconnectedAt) {
        lastDisconnectAt = Math.max(lastDisconnectAt, player.disconnectedAt);
      }
    }
    if (!lastDisconnectAt) continue;

    const inactiveMs = now - lastDisconnectAt;
    const gamePhase = getRoomGamePhase(room);
    const ttlMs = gamePhase === "ended" ? ROOM_ENDED_TTL_MS : ROOM_INACTIVE_TTL_MS;
    if (inactiveMs < ttlMs) continue;

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

    logRoomLifecycle("closed", roomCode, {
      reason: gamePhase === "ended" ? "cleanup_ended_ttl" : "cleanup_inactive_ttl",
      inactiveSec: Math.floor(inactiveMs / 1000),
      phase: room.phase,
      gamePhase,
      players: room.players.size,
    });
    rooms.delete(roomCode);
  }
}

function generateRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function buildRoomState(room: Room): RoomState {
  const locale = getRoomCardLocale(room);
  if (room.session) {
    try {
      room.world = room.session.getGameView(room.hostId).world;
    } catch {
      // ignore world sync errors
    }
  }
  return {
    roomCode: room.code,
    players: Array.from(room.players.values()).map((player) => ({
      playerId: player.playerId,
      name: player.name,
      connected: player.connected,
      disconnectedAt: player.disconnectedAt,
      totalAbsentMs: player.totalAbsentMs ?? 0,
      currentOfflineMs: !player.connected && player.disconnectedAt ? Date.now() - player.disconnectedAt : 0,
      kickRemainingMs: Math.max(
        0,
        DISCONNECT_GRACE_MS - (!player.connected && player.disconnectedAt ? Date.now() - player.disconnectedAt : 0)
      ),
      leftBunker: player.leftBunker,
    })),
    hostId: room.hostId,
    controlId: room.controlId,
    phase: room.phase,
    scenarioMeta: room.scenarioMeta,
    settings: {
      ...room.settings,
      cardLocale: locale,
    },
    ruleset: room.ruleset,
    rulesOverriddenByHost: room.rulesOverriddenByHost,
    rulesPresetCount: room.rulesPresetCount,
    world: localizeWorldStateForLocale(room.world, locale),
    isDev: room.isDev,
    disasterOptions: localizeDisasterOptionsForLocale(room.disasterOptions, locale),
  };
}

// Overlay category configuration with localization keys
const OVERLAY_CATEGORY_KEYS = [
  { key: "profession", labelKey: "categoryProfession", aliasesRu: ["Профессия"], aliasesEn: ["Profession"] },
  { key: "health", labelKey: "categoryHealth", aliasesRu: ["Здоровье"], aliasesEn: ["Health"] },
  { key: "hobby", labelKey: "categoryHobby", aliasesRu: ["Хобби"], aliasesEn: ["Hobby"] },
  { key: "phobia", labelKey: "categoryPhobia", aliasesRu: ["Фобия"], aliasesEn: ["Phobia"] },
  { key: "baggage", labelKey: "categoryBaggage", aliasesRu: ["Багаж"], aliasesEn: ["Baggage"] },
  { key: "fact1", labelKey: "categoryFact1", aliasesRu: ["Факт №1", "Факт 1"], aliasesEn: ["Fact #1", "Fact 1"] },
  { key: "fact2", labelKey: "categoryFact2", aliasesRu: ["Факт №2", "Факт 2"], aliasesEn: ["Fact #2", "Fact 2"] },
  { key: "biology", labelKey: "categoryBiology", aliasesRu: ["Биология"], aliasesEn: ["Biology"] },
] as const;

// Runtime overlay categories with localized labels (built per-request)
interface OverlayCategoryConfig {
  key: string;
  label: string;
  aliases: readonly string[];
}

function buildOverlayCategories(locale: "ru" | "en"): OverlayCategoryConfig[] {
  const localeDict = locale === "en"
    ? {
        categoryProfession: "Profession",
        categoryHealth: "Health",
        categoryHobby: "Hobby",
        categoryPhobia: "Phobia",
        categoryBaggage: "Baggage",
        categoryFact1: "Fact #1",
        categoryFact2: "Fact #2",
        categoryBiology: "Biology",
      }
    : {
        categoryProfession: "Профессия",
        categoryHealth: "Здоровье",
        categoryHobby: "Хобби",
        categoryPhobia: "Фобия",
        categoryBaggage: "Багаж",
        categoryFact1: "Факт №1",
        categoryFact2: "Факт №2",
        categoryBiology: "Биология",
      };
  
  return OVERLAY_CATEGORY_KEYS.map((entry) => ({
    key: entry.key,
    label: localeDict[entry.labelKey as keyof typeof localeDict] ?? entry.key,
    aliases: locale === "en" ? entry.aliasesEn : entry.aliasesRu,
  }));
}

function clampLine(value: string, max = 56): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "?";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function getOverlayHiddenText(locale: "ru" | "en"): string {
  return locale === "en" ? "hidden" : "скрыто";
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
  subtitleMap: SubtitleMap,
  assetId: string | undefined,
  titleRendered: string
): string | undefined {
  if (subtitleMap.size === 0) return undefined;
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
  subtitleMap: SubtitleMap
) {
  const revealedCards = cards.filter((card) => card.isRevealed);
  return revealedCards.map((card) => {
    const titleRaw = sanitizeSingleLine(card.title || card.description || "?", OVERLAY_MAX_LINE_LEN).trim() || "?";
    const title = titleRaw;
    const description = sanitizeSingleLine(card.description || "", OVERLAY_MAX_LINE_LEN)
      .trim()
      .replace(/\s+/g, " ");
    const titleNorm = normalizeOverlayCompareValue(title);
    const descNorm = normalizeOverlayCompareValue(description);
    let subtitle = description && description !== "?" && descNorm !== titleNorm ? description : undefined;
    if (!subtitle) {
      subtitle = readMappedSubtitle(subtitleMap, card.imageId || card.id, title);
    }
    if (subtitle && normalizeOverlayCompareValue(subtitle) === normalizeOverlayCompareValue(title)) {
      subtitle = undefined;
    }
    return { title, subtitle, imageId: card.imageId };
  });
}

function buildTopLinesFromItems(items: Array<{ title: string }>, locale: "ru" | "en") {
  if (!items.length) return [getOverlayHiddenText(locale)];
  return items.map((item) => item.title || "?");
}

function findCategory(player: PublicPlayerView, aliases: readonly string[]) {
  return player.categories.find((item) => aliases.includes(item.category));
}

function readCategoryValue(player: PublicPlayerView, aliases: readonly string[]) {
  const category = findCategory(player, aliases);
  if (!category || category.status !== "revealed" || category.cards.length === 0) {
    return { revealed: false, value: "?", imgUrl: undefined as string | undefined };
  }
  return {
    revealed: true,
    value: category.cards.map((card) => card.labelShort).join(", "),
    imgUrl: category.cards[0]?.imgUrl,
  };
}

function extractBioTags(player: PublicPlayerView, locale: "ru" | "en") {
  const bioAliases = locale === "en" ? ["Biology", "Bio"] : ["Биология"];
  const orientationAliases = locale === "en" ? ["Orientation"] : ["Ориентация"];
  
  const bio = readCategoryValue(player, bioAliases);
  if (!bio.revealed) {
    const sexLabel = locale === "en" ? "Sex" : "Пол";
    const ageLabel = locale === "en" ? "Age" : "Возраст";
    const orientationLabel = locale === "en" ? "Orientation" : "Ориентация";
    return {
      sex: { label: sexLabel, revealed: false, value: "?" },
      age: { label: ageLabel, revealed: false, value: "?" },
      orientation: { label: orientationLabel, revealed: false, value: "?" },
    };
  }

  const raw = bio.value;
  const sexMatch = raw.match(/\b([МЖ])\b/i);
  const ageMatch = raw.match(/\b(\d{1,3})\b/);
  const orientationDirect = readCategoryValue(player, orientationAliases);

  const sexLabel = locale === "en" ? "Sex" : "Пол";
  const ageLabel = locale === "en" ? "Age" : "Возраст";
  const orientationLabel = locale === "en" ? "Orientation" : "Ориентация";

  return {
    sex: {
      label: sexLabel,
      revealed: Boolean(sexMatch),
      value: sexMatch ? sexMatch[1].toUpperCase() : "?",
    },
    age: {
      label: ageLabel,
      revealed: Boolean(ageMatch),
      value: ageMatch ? ageMatch[1] : "?",
    },
    orientation: orientationDirect.revealed
      ? { label: orientationLabel, revealed: true, value: orientationDirect.value }
      : { label: orientationLabel, revealed: false, value: "?" },
  };
}

async function getOverlayState(room: Room): Promise<OverlayState | null> {
  const roomLocale = getRoomCardLocale(room);
  const overlayCategories = buildOverlayCategories(roomLocale);
  const fallback = {
    roomId: room.code,
    locale: roomLocale,
    playerCount: room.players.size,
    top: {
      bunker: { revealed: 0, total: 0, lines: [getOverlayHiddenText(roomLocale)] },
      catastrophe: { text: getOverlayHiddenText(roomLocale), title: undefined, imageId: undefined },
      threats: { revealed: 0, total: 0, lines: [getOverlayHiddenText(roomLocale)] },
    },
    players: room.joinOrder
      .map((id) => room.players.get(id))
      .filter(Boolean)
      .map((player) => ({
        id: player!.playerId,
        nickname: player!.name,
        connected: player!.connected,
        alive: !player!.leftBunker,
        tags: {
          sex: { label: roomLocale === "en" ? "Sex" : "Пол", revealed: false, value: "?" },
          age: { label: roomLocale === "en" ? "Age" : "Возраст", revealed: false, value: "?" },
          orientation: { label: roomLocale === "en" ? "Orientation" : "Ориентация", revealed: false, value: "?" },
        },
        categories: overlayCategories.map((entry) => ({
          key: entry.key,
          label: entry.label,
          revealed: false,
          value: "?",
        })),
      })),
    overrides: room.overlayOverrides,
  } satisfies OverlayState;

  if (!room.session || !room.hostId) {
    return fallback;
  }

  try {
    const locale = getRoomCardLocale(room);
    const subtitleMap = await getSubtitleMap(locale);
    const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
    if (!anchorId) return fallback;
    const view = localizeGameViewForLocale(room.session.getGameView(anchorId), locale, room.scenarioId);
    const world = view.world;
    const bunkerOpened = world?.bunker.filter((card) => card.isRevealed).length ?? 0;
    const bunkerTotal = world?.counts.bunker ?? 0;
    const threatOpened = world?.threats.filter((card) => card.isRevealed).length ?? 0;
    const threatTotal = world?.counts.threats ?? 0;
    const bunkerItems = buildTopItems(world?.bunker ?? [], subtitleMap);
    const threatItems = buildTopItems(world?.threats ?? [], subtitleMap);
    const bunkerLines = buildTopLinesFromItems(bunkerItems, roomLocale);
    const threatLines = buildTopLinesFromItems(threatItems, roomLocale);
    const catastropheTitle = normalizeOverlayCatastropheTitle(
      world?.disaster.title,
      world?.disaster.description,
      (world?.disaster as { labelShort?: string } | undefined)?.labelShort
    );
    const catastropheText = normalizeOverlayCatastropheText(buildOverlayCatastropheBody(world?.disaster, roomLocale), roomLocale);

    return {
      roomId: room.code,
      locale: roomLocale,
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
          const value = readCategoryValue(player, entry.aliases);
          return {
            key: entry.key,
            label: entry.label,
            revealed: value.revealed,
            value: value.value,
            imgUrl: value.imgUrl,
          };
        });

        return {
          id: player.playerId,
          nickname: player.name,
          connected: roomPlayer?.connected ?? true,
          alive: player.status === "alive",
          tags: extractBioTags(player, roomLocale),
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

function getRoleForPlayer(room: Room, playerId: string | undefined): Role {
  if (!playerId) return "VIEW";
  if (playerId === room.controlId) return "CONTROL";
  return room.players.has(playerId) ? "PLAYER" : "VIEW";
}

function getRoleForToken(room: Room, token: string): Role | null {
  if (!token) return null;
  if (token === room.overlayToken) return "VIEW";
  if (token === room.overlayEditToken) return "CONTROL";
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
    const locale = getRoomCardLocale(room);
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
      try {
        const personalView = localizeGameViewForLocale(
          room.session!.getGameView(publicPlayer.playerId),
          locale,
          room.scenarioId
        );
        hand = personalView.you.hand.map((card) => ({
          instanceId: String(card.instanceId ?? card.id ?? `${publicPlayer.playerId}-card`),
          id: String(card.id ?? ""),
          deck: card.deck,
          labelShort: String(card.labelShort ?? card.deck ?? "Карта"),
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
  const roomLocale = getRoomCardLocale(room);
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
    cardLocale: getRoomCardLocale(room),
    categories,
    players,
    deckCatalog: localizeControlDeckCatalogForLocale(controlDeckCatalog, getRoomCardLocale(room)),
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

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(message));
}

function getSocketLocale(ws: WebSocket, room?: Room): ServerLocaleCode {
  if (room) {
    return normalizeServerLocale(room.settings.cardLocale);
  }
  const info = connectionInfo.get(ws);
  if (!info) return "ru";
  const resolvedRoom = rooms.get(info.roomCode);
  return normalizeServerLocale(resolvedRoom?.settings.cardLocale);
}

function tServerForRoom(
  room: Room | undefined,
  key: string,
  vars?: Record<string, unknown>
): string {
  const locale = room ? normalizeServerLocale(room.settings.cardLocale) : "ru";
  return tServer(locale, key, vars);
}

function localizeScenarioMessageForRoom(room: Room, message: string): string {
  return localizeScenarioMessage(message, normalizeServerLocale(room.settings.cardLocale), room.scenarioId);
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
  const locale = getSocketLocale(ws, options.room);
  send(ws, {
    type: "error",
    payload: {
      ...(options.extra ?? {}),
      ...(options.code ? { code: options.code } : {}),
      message: tServer(locale, options.key, options.vars),
    },
  });
}

function sendReconnectForbidden(ws: WebSocket, room?: Room): void {
  sendLocalizedError(ws, {
    key: "error.reconnectForbidden",
    room,
    code: "RECONNECT_FORBIDDEN",
  });
}

async function sendOverlayState(room: Room, ws: WebSocket, role: Role = "VIEW") {
  const state = await getOverlayState(room);
  const presenter = canControl(role) ? buildOverlayPresenterState(room) : undefined;
  send(ws, {
    type: "overlayState",
    payload: {
      ok: true,
      roomCode: room.code,
      state: state ?? undefined,
      presenter,
      presenterModeEnabled: Boolean(room.settings.enablePresenterMode),
      role,
    },
  });
}

function broadcastOverlayState(room: Room) {
  for (const [ws, sub] of overlaySubscriptions.entries()) {
    if (sub.roomCode !== room.code) continue;
    void sendOverlayState(room, ws, sub.role);
  }
}

function devLog(...args: unknown[]) {
  if (!DEV_LOGS) return;
  console.log("[dev]", ...args);
}

function isClassicRoom(room: Room): boolean {
  return room.scenarioMeta.id === CLASSIC_SCENARIO_ID;
}

function getEffectiveMaxPlayers(room: Room): number {
  if (!isClassicRoom(room)) return room.settings.maxPlayers;
  return Math.min(room.settings.maxPlayers, MAX_CLASSIC_PLAYERS);
}

function updateRulesetIfAuto(room: Room): void {
  if (room.phase !== "lobby") return;
  if (!isClassicRoom(room)) {
    room.ruleset = buildAutoRuleset(room.players.size);
    room.rulesOverriddenByHost = false;
    room.rulesPresetCount = undefined;
    return;
  }
  if (room.rulesOverriddenByHost) {
    const manualConfig = room.ruleset.manualConfig;
    if (room.ruleset.rulesetMode === "manual" && manualConfig) {
      room.ruleset = buildManualRuleset(manualConfig, room.players.size);
      room.rulesPresetCount = manualConfig.seedTemplatePlayers;
    }
    return;
  }
  room.ruleset = buildAutoRuleset(room.players.size);
  room.rulesPresetCount = undefined;
}

function broadcastRoomState(room: Room): void {
  const roomState = buildRoomState(room);
  const patch = diffTopLevel(room.lastRoomState, roomState);
  for (const player of room.players.values()) {
    if (player.ws) {
      if (player.needsFullState || !room.lastRoomState) {
        send(player.ws, { type: "roomState", payload: roomState });
      } else if (patch) {
        send(player.ws, { type: "statePatch", payload: { roomState: patch } });
      }
    }
  }
  room.lastRoomState = roomState;
  for (const player of room.players.values()) {
    player.needsFullState = false;
  }
  broadcastOverlayState(room);
}

function sendGameView(room: Room, player: Player): void {
  if (!room.session || !player.ws) return;
  if (room.sessionPlayerIds && !room.sessionPlayerIds.has(player.playerId)) {
    devLog("gameView skip: player not in session", { room: room.code, playerId: player.playerId });
    sendLocalizedError(player.ws, {
      key: "error.playerRestoreFailedRejoin",
      room,
      code: "PLAYER_RESTORE_FAILED",
    });
    return;
  }
  try {
    const view = room.session.getGameView(player.playerId);
    syncScenarioStatuses(room, view.public.players);
    const enrichedPlayers = view.public.players.map((entry) => {
      const roomPlayer = room.players.get(entry.playerId);
      const currentOfflineMs =
        roomPlayer && !roomPlayer.connected && roomPlayer.disconnectedAt
          ? Date.now() - roomPlayer.disconnectedAt
          : 0;
      return {
        ...entry,
        connected: roomPlayer?.connected ?? false,
        disconnectedAt: roomPlayer?.disconnectedAt,
        totalAbsentMs: roomPlayer?.totalAbsentMs ?? 0,
        currentOfflineMs,
        kickRemainingMs: Math.max(0, DISCONNECT_GRACE_MS - currentOfflineMs),
        leftBunker: roomPlayer?.leftBunker ?? entry.status === "left_bunker",
      };
    });
    const payload = {
      ...view,
      public: {
        ...view.public,
        players: enrichedPlayers,
      },
    };
    const localizedPayload = localizeGameViewForLocale(payload, getRoomCardLocale(room), room.scenarioId);
    if (!room.lastGameViews) {
      room.lastGameViews = new Map();
    }
    const lastView = room.lastGameViews.get(player.playerId);
    if (player.needsFullGameView || !lastView) {
      send(player.ws, { type: "gameView", payload: localizedPayload });
      player.needsFullGameView = false;
    } else {
      const patch = diffTopLevel(lastView, localizedPayload);
      if (patch) {
        send(player.ws, { type: "statePatch", payload: { gameView: patch } });
      }
      player.needsFullGameView = false;
    }
    room.lastGameViews.set(player.playerId, localizedPayload);
    devLog("gameView sent", { room: room.code, playerId: player.playerId });
  } catch (error) {
    console.error("[server] Scenario getGameView failed", error);
    sendLocalizedError(player.ws, {
      key: "error.scenarioStateFailed",
      room,
    });
  }
}

function broadcastGameViews(room: Room): void {
  if (!room.session) return;
  for (const player of room.players.values()) {
    if (player.ws) {
      try {
        sendGameView(room, player);
      } catch (error) {
        console.error("[server] broadcast gameView failed", error);
      }
    }
  }
  broadcastOverlayState(room);
}

function broadcastEvent(room: Room, event: GameEvent): void {
  for (const player of room.players.values()) {
    if (player.ws) {
      send(player.ws, { type: "gameEvent", payload: event });
    }
  }
}

function buildSystemEvent(room: Room, kind: GameEvent["kind"], message: string): GameEvent {
  return {
    id: `${room.code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
    createdAt: Date.now(),
  };
}

function syncScenarioStatuses(room: Room, players: Array<{ playerId: string; status: PlayerStatus }>) {
  players.forEach((entry) => {
    const roomPlayer = room.players.get(entry.playerId);
    if (!roomPlayer) return;
    roomPlayer.scenarioStatus = entry.status;
    if (entry.status === "eliminated" && !roomPlayer.eliminatedAt) {
      roomPlayer.eliminatedAt = Date.now();
    }
  });
}

function getScenarioStatus(room: Room, playerId: string): PlayerStatus | undefined {
  const cached = room.players.get(playerId)?.scenarioStatus;
  if (cached) return cached;
  if (!room.session) return undefined;
  try {
    const view = room.session.getGameView(playerId);
    syncScenarioStatuses(room, view.public.players);
    return room.players.get(playerId)?.scenarioStatus;
  } catch (error) {
    console.error("[server] getScenarioStatus failed", error);
    return undefined;
  }
}

function isPlayerAlive(room: Room, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player) return false;
  if (player.leftBunker) return false;
  if (!room.session) return true;
  const status = getScenarioStatus(room, playerId);
  return status ? status === "alive" : true;
}

function pickNextHost(room: Room, excludeId?: string): string | undefined {
  const order = room.joinOrder.filter((id) => room.players.has(id));
  if (order.length === 0) return undefined;
  for (const id of order) {
    if (excludeId && id === excludeId) continue;
    if (isPlayerAlive(room, id)) return id;
  }
  for (const id of order) {
    if (excludeId && id === excludeId) continue;
    return id;
  }
  return undefined;
}

function getCurrentTurnPlayerId(room: Room): string | undefined {
  if (!room.session) return undefined;
  const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
  if (!anchorId) return undefined;
  try {
    const view = room.session.getGameView(anchorId);
    return view.public.currentTurnPlayerId ?? undefined;
  } catch {
    return undefined;
  }
}

function resolveControlActorId(
  room: Room,
  options?: { preferredId?: string; allowAnyPresentPlayer?: boolean }
): string | undefined {
  const preferredId = String(options?.preferredId ?? "").trim();
  if (preferredId) {
    if (!room.players.has(preferredId)) return undefined;
    if (!room.session || isPlayerAlive(room, preferredId)) return preferredId;
  }

  if (room.players.has(room.hostId) && (!room.session || isPlayerAlive(room, room.hostId))) {
    return room.hostId;
  }

  const nextAlive = pickNextHost(room, room.hostId);
  if (nextAlive) return nextAlive;

  if (options?.allowAnyPresentPlayer) {
    const anyPresent = room.joinOrder.find((id) => room.players.has(id));
    if (anyPresent) return anyPresent;
  }

  if (room.players.has(room.hostId)) return room.hostId;
  return room.joinOrder.find((id) => room.players.has(id));
}

function removeLobbyPlayer(room: Room, playerId: string): boolean {
  const player = room.players.get(playerId);
  if (!player) return false;

  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }
  if (player.disconnectTicker) {
    clearInterval(player.disconnectTicker);
    player.disconnectTicker = undefined;
  }

  if (player.ws) {
    connectionInfo.delete(player.ws);
  }

  room.players.delete(playerId);
  room.playersByToken.delete(player.token);
  if (player.tabId) {
    room.playersByTabId.delete(player.tabId);
  }
  if (player.sessionId) {
    room.playersBySessionId.delete(player.sessionId);
  }
  room.joinOrder = room.joinOrder.filter((id) => id !== playerId);
  logRoomLifecycle("left", room.code, {
    player: player.name,
    count: room.players.size,
    phase: room.phase,
  });

  if (room.players.size === 0) {
    if (room.hostTransferTimer) {
      clearTimeout(room.hostTransferTimer);
      room.hostTransferTimer = undefined;
    }
    logRoomLifecycle("closed", room.code, { reason: "empty_lobby" });
    rooms.delete(room.code);
    return true;
  }

  if (room.hostId === playerId) {
    const nextHostId = pickNextHost(room, playerId);
    if (nextHostId) {
      room.hostId = nextHostId;
      if (room.sessionContext) {
        room.sessionContext.hostId = nextHostId;
      }
    }
  }
  if (room.controlId === playerId) {
    const nextControlId = pickNextHost(room, playerId);
    if (nextControlId) {
      room.controlId = nextControlId;
    }
  }

  updateRulesetIfAuto(room);

  return true;
}

function addLobbyBotPlayer(room: Room, preferredName?: string): Player | null {
  if (room.phase !== "lobby") return null;
  const maxPlayers = getEffectiveMaxPlayers(room);
  if (room.players.size >= maxPlayers) return null;

  const baseName = String(preferredName ?? "").trim() || "Бот";
  const existingNames = new Set(
    Array.from(room.players.values()).map((player) => String(player.name || "").trim().toLocaleLowerCase("ru-RU"))
  );
  let nextName = baseName;
  let suffix = 2;
  while (existingNames.has(nextName.toLocaleLowerCase("ru-RU"))) {
    nextName = `${baseName} ${suffix}`;
    suffix += 1;
  }

  const bot: Player = {
    playerId: crypto.randomUUID(),
    name: nextName,
    token: crypto.randomUUID(),
    connected: true,
    totalAbsentMs: 0,
    needsFullState: false,
    needsFullGameView: false,
  };

  room.players.set(bot.playerId, bot);
  room.playersByToken.set(bot.token, bot.playerId);
  room.joinOrder.push(bot.playerId);
  updateRulesetIfAuto(room);
  logRoomLifecycle("joined", room.code, { player: bot.name, count: room.players.size, phase: room.phase });
  return bot;
}

function transferHost(
  room: Room,
  reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual",
  excludeId?: string,
  preferredHostId?: string
): void {
  if (room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
  }
  const preferredId = String(preferredHostId ?? "").trim();
  const nextHostId =
    preferredId && preferredId !== excludeId && room.players.has(preferredId)
      ? preferredId
      : pickNextHost(room, excludeId);
  if (!nextHostId) {
    if (room.players.size === 0) {
      rooms.delete(room.code);
    }
    return;
  }
  if (room.hostId === nextHostId) return;
  room.hostId = nextHostId;
  if (room.sessionContext) {
    room.sessionContext.hostId = nextHostId;
  }
  broadcastRoomState(room);
  const hostName = room.players.get(nextHostId)?.name ?? "игрок";
  broadcastEvent(
    room,
    buildSystemEvent(
      room,
      "info",
      tServerForRoom(room, "info.hostTransferred", {
        hostName,
      })
    )
  );
  for (const player of room.players.values()) {
    if (player.ws) {
      send(player.ws, { type: "hostChanged", payload: { newHostId: nextHostId, reason } });
    }
  }
}

function scheduleHostTransfer(room: Room, reason: "disconnect_timeout" | "left_bunker" | "eliminated"): void {
  const candidate = pickNextHost(room, room.hostId);
  if (!candidate) {
    return;
  }
  if (room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
  }
  const hostPlayer = room.players.get(room.hostId);
  if (hostPlayer) {
    broadcastEvent(
      room,
      buildSystemEvent(
        room,
        "info",
        tServerForRoom(room, "info.hostDisconnectedTransferIn", {
          hostName: hostPlayer.name,
          seconds: String(Math.floor(HOST_GRACE_MS / 1000)),
        })
      )
    );
  }
  room.hostTransferTimer = setTimeout(() => {
    room.hostTransferTimer = undefined;
    transferHost(room, reason, room.hostId);
  }, HOST_GRACE_MS);
  unrefTimer(room.hostTransferTimer);
}

function markPlayerLeftBunker(room: Room, player: Player) {
  if (player.leftBunker) return;
  if (player.connected) return;
  player.leftBunker = true;
  if (!player.kickedAt) {
    player.kickedAt = Date.now();
  }
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }
  if (player.disconnectTicker) {
    clearInterval(player.disconnectTicker);
    player.disconnectTicker = undefined;
  }
  if (room.hostTransferTimer && room.hostId === player.playerId) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
  }
  const systemActorId =
    room.hostId && room.players.has(room.hostId)
      ? room.hostId
      : Array.from(room.players.keys())[0];
  if (room.session && systemActorId) {
    const result = room.session.handleAction(systemActorId, {
      type: "markLeftBunker",
      payload: { targetPlayerId: player.playerId },
    });
    if (result.stateChanged) {
      broadcastGameViews(room);
    }
  }
  broadcastRoomState(room);
  broadcastGameViews(room);
  broadcastEvent(
    room,
    buildSystemEvent(
      room,
      "playerLeftBunker",
      tServerForRoom(room, "info.playerLeftBunker", {
        playerName: player.name,
      })
    )
  );
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function computeKickRemainingMs(player: Player, now = Date.now()): number {
  const currentOfflineMs = player.disconnectedAt ? now - player.disconnectedAt : 0;
  return Math.max(0, DISCONNECT_GRACE_MS - currentOfflineMs);
}

function findPlayerByToken(room: Room, token?: string): Player | undefined {
  if (!token) return undefined;
  const playerId = room.playersByToken.get(token);
  return playerId ? room.players.get(playerId) : undefined;
}

function findPlayerByTabId(room: Room, tabId?: string): Player | undefined {
  if (!tabId) return undefined;
  const playerId = room.playersByTabId.get(tabId);
  return playerId ? room.players.get(playerId) : undefined;
}

function findPlayerBySessionId(room: Room, sessionId?: string): Player | undefined {
  if (!sessionId) return undefined;
  const playerId = room.playersBySessionId.get(sessionId);
  return playerId ? room.players.get(playerId) : undefined;
}

function attachPlayer(room: Room, payload: ClientHelloPayload, ws: WebSocket, existing?: Player): Player {
  const isNew = !existing;
  const player = existing ?? {
    playerId: crypto.randomUUID(),
    name: payload.name,
    token: crypto.randomUUID(),
    tabId: IDENTITY_MODE === "dev_tab" ? payload.tabId : undefined,
    sessionId: payload.sessionId,
    connected: true,
    totalAbsentMs: 0,
  };

  if (isNew || !player.name) {
    player.name = payload.name;
  }
  if (payload.sessionId) {
    player.sessionId = payload.sessionId;
  }
  if (IDENTITY_MODE === "dev_tab" && payload.tabId) {
    player.tabId = payload.tabId;
  }
  const wasDisconnected = Boolean(player.disconnectedAt);
  if (player.disconnectTimer) {
    clearTimeout(player.disconnectTimer);
    player.disconnectTimer = undefined;
  }
  if (player.disconnectTicker) {
    clearInterval(player.disconnectTicker);
    player.disconnectTicker = undefined;
  }
  player.disconnectNotifiedMinutes = undefined;
  if (wasDisconnected) {
    // Grace timeout should apply to a single disconnection window, not accumulated history.
    player.totalAbsentMs = 0;
    player.disconnectedAt = undefined;
  }
  if (room.hostId === player.playerId && room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
    broadcastEvent(
      room,
      buildSystemEvent(
        room,
        "info",
        tServerForRoom(room, "info.hostReturnedTransferCanceled", {
          hostName: player.name,
        })
      )
    );
  }
  player.ws = ws;
  player.connected = true;
  player.needsFullState = true;
  player.needsFullGameView = true;

  room.players.set(player.playerId, player);
  room.playersByToken.set(player.token, player.playerId);
  if (player.tabId) {
    room.playersByTabId.set(player.tabId, player.playerId);
  }
  if (player.sessionId) {
    room.playersBySessionId.set(player.sessionId, player.playerId);
  }
  if (isNew && !room.joinOrder.includes(player.playerId)) {
    room.joinOrder.push(player.playerId);
  }
  if (!room.hostId) {
    room.hostId = player.playerId;
  }
  if (!room.controlId) {
    room.controlId = player.playerId;
  }

  connectionInfo.set(ws, { roomCode: room.code, playerId: player.playerId });
  send(ws, { type: "helloAck", payload: { playerId: player.playerId, playerToken: player.token } });

  if (existing && wasDisconnected) {
    broadcastEvent(
      room,
      buildSystemEvent(
        room,
        "playerReconnected",
        tServerForRoom(room, "info.playerReconnected", {
          playerName: player.name,
        })
      )
    );
  }

  return player;
}

async function main() {
  const assets = buildAssetCatalog(ASSETS_ROOT);
  controlDeckCatalog = Object.fromEntries(
    Object.entries(assets.decks).map(([deckName, cards]) => [
      deckName,
      cards.map((card) => ({ id: card.id, labelShort: card.labelShort })),
    ])
  );
  const scenarios = await loadScenarios();
  const availableScenarios = scenarios.filter(
    (scenario) => !(scenario.meta.devOnly && !DEV_SCENARIOS_ENABLED)
  );
  const scenarioMap = new Map<string, ScenarioModule>(
    availableScenarios.map((scenario) => [scenario.meta.id, scenario])
  );

  const app = express();
  if (TRUST_PROXY) {
    app.set("trust proxy", true);
  }
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "256kb" }));

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
    const room = rooms.get(roomCode);
    if (!room || !isOverlayEditAuthorized(room, token)) {
      res.status(403).type("text/plain").send(tServerForRoom(room, "error.forbidden"));
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

    const host = req.get("host");
    const requestOrigin = host ? `${req.protocol}://${host}` : undefined;
    const { lanOrigin } = buildLinkOrigins(requestOrigin);
    const publicResolution = await resolvePublicBase(LISTEN_PORT);
    logPublicBaseResolution(publicResolution);
    const links = buildLinkSet({
      lanBase: lanOrigin,
      publicBase: publicResolution.base,
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      overlayControlToken: room.overlayEditToken,
      overlayQueryParams: room.overlayOverrides?.overlayUrlParams,
    });

    res.json({
      ok: true,
      lanBase: links.lanBase,
      publicBase: links.publicBase ?? null,
      linkVisibility: HIDE_LOCAL_LINKS_IN_LOGS ? "public" : "all",
      buildProfile: BUILD_PROFILE || "public",
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      overlayControlToken: room.overlayEditToken,
      overlayQueryParams: room.overlayOverrides?.overlayUrlParams ?? null,
      links,
    });
  });

  app.get("/api/scenarios", (_req, res) => {
    res.json(availableScenarios.map((scenario) => scenario.meta));
  });

  type ControlCommand =
    | "START_GAME"
    | "NEXT_STEP"
    | "SKIP_STEP"
    | "START_VOTE"
    | "END_VOTE"
    | "SET_OUTCOME_SURVIVED"
    | "SET_OUTCOME_FAILED"
    | "SKIP_ROUND"
    | "KICK_PLAYER"
    | "TRANSFER_HOST"
    | "SCENARIO_ACTION";

  type ControlCommandError = { errorKey: string; errorVars?: Record<string, unknown> };
  type ControlCommandResult =
    | { ok: true }
    | { ok: false; messageKey?: string; messageVars?: Record<string, unknown>; message?: string };

  const controlError = (
    messageKey: string,
    messageVars?: Record<string, unknown>
  ): ControlCommandResult => ({
    ok: false,
    messageKey,
    messageVars,
  });

  const startGameAsControl = (room: Room): ControlCommandResult => {
    if (room.phase !== "lobby") {
      return controlError("error.control.gameAlreadyStarted");
    }
    if (isClassicRoom(room) && room.players.size < MIN_CLASSIC_PLAYERS) {
      return controlError("error.control.minPlayersRequired", { minPlayers: MIN_CLASSIC_PLAYERS });
    }

    updateRulesetIfAuto(room);

    const rng = createRandomRng();
    room.sessionPlayerIds = new Set(room.players.keys());
    const sessionContext: ScenarioContext = {
      roomCode: room.code,
      createdAt: room.createdAt,
      rng,
      assets,
      players: Array.from(room.players.values()).map((player) => ({
        playerId: player.playerId,
        name: player.name,
      })),
      settings: room.settings,
      hostId: room.hostId,
      ruleset: room.ruleset,
      onStateChange: () => broadcastGameViews(room),
      onEvent: (event) =>
        broadcastEvent(room, {
          ...event,
          message: localizeScenarioMessageForRoom(room, event.message),
        }),
    };
    room.sessionContext = sessionContext;
    room.session = room.scenarioModule.createSession(sessionContext);
    try {
      room.world = room.session.getGameView(room.hostId).world;
    } catch {
      room.world = undefined;
    }
    room.phase = "game";
    broadcastRoomState(room);
    broadcastGameViews(room);
    return { ok: true };
  };

  const parseControlScenarioAction = (
    typeRaw: string,
    payloadRaw: Record<string, unknown>
  ): ScenarioAction | ControlCommandError => {
    const actionType = String(typeRaw ?? "").trim();
    const payload = isRecord(payloadRaw) ? payloadRaw : {};
    const requireNonEmpty = (
      value: unknown,
      errorKey: string,
      errorVars?: Record<string, unknown>
    ): string | ControlCommandError => {
      const next = String(value ?? "").trim();
      return next ? next : { errorKey, errorVars };
    };
    const toNumber = (value: unknown): number | null => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    switch (actionType) {
      case "revealCard": {
        const cardId = requireNonEmpty(payload.cardId, "error.control.cardIdRequired");
        if (typeof cardId !== "string") return cardId;
        return { type: "revealCard", payload: { cardId } };
      }
      case "vote": {
        const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.voteTargetRequired");
        if (typeof targetPlayerId !== "string") return targetPlayerId;
        return { type: "vote", payload: { targetPlayerId } };
      }
      case "finalizeVoting":
        return { type: "finalizeVoting", payload: {} };
      case "applySpecial": {
        const specialInstanceId = requireNonEmpty(
          payload.specialInstanceId,
          "error.control.specialInstanceIdRequired"
        );
        if (typeof specialInstanceId !== "string") return specialInstanceId;
        const nestedPayload = isRecord(payload.payload) ? payload.payload : {};
        const fallbackPayload = { ...payload };
        delete fallbackPayload.specialInstanceId;
        delete fallbackPayload.payload;
        const effectivePayload =
          Object.keys(nestedPayload).length > 0 ? nestedPayload : (fallbackPayload as Record<string, unknown>);
        return {
          type: "applySpecial",
          payload: {
            specialInstanceId,
            payload: effectivePayload,
          },
        };
      }
      case "revealWorldThreat": {
        const index = toNumber(payload.index);
        if (index === null || !Number.isInteger(index) || index < 0) {
          return { errorKey: "error.control.threatIndexInvalid" };
        }
        return { type: "revealWorldThreat", payload: { index } };
      }
      case "setBunkerOutcome": {
        const outcome = String(payload.outcome ?? "").trim();
        if (outcome !== "survived" && outcome !== "failed") {
          return { errorKey: "error.control.bunkerOutcomeInvalid" };
        }
        return { type: "setBunkerOutcome", payload: { outcome } };
      }
      case "devSkipRound":
        return { type: "devSkipRound", payload: {} };
      case "devKickPlayer": {
        const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.kickTargetRequired");
        if (typeof targetPlayerId !== "string") return targetPlayerId;
        return { type: "devKickPlayer", payload: { targetPlayerId } };
      }
      case "markLeftBunker": {
        const targetPlayerId = requireNonEmpty(
          payload.targetPlayerId,
          "error.control.markLeftBunkerTargetRequired"
        );
        if (typeof targetPlayerId !== "string") return targetPlayerId;
        return { type: "markLeftBunker", payload: { targetPlayerId } };
      }
      case "continueRound":
        return { type: "continueRound", payload: {} };
      case "devAddPlayer": {
        const name = String(payload.name ?? "").trim();
        return { type: "devAddPlayer", payload: name ? { name } : {} };
      }
      case "devRemovePlayer": {
        const targetPlayerId = String(payload.targetPlayerId ?? "").trim();
        return { type: "devRemovePlayer", payload: targetPlayerId ? { targetPlayerId } : {} };
      }
      case "adminReplacePlayerCard": {
        const targetPlayerId = requireNonEmpty(payload.targetPlayerId, "error.control.targetPlayerRequired");
        if (typeof targetPlayerId !== "string") return targetPlayerId;
        const cardInstanceId = requireNonEmpty(payload.cardInstanceId, "error.control.playerCardRequired");
        if (typeof cardInstanceId !== "string") return cardInstanceId;
        const targetAreaRaw = String(payload.targetArea ?? "hand").trim().toLowerCase();
        const targetArea = targetAreaRaw === "special" ? "special" : "hand";
        const replacementModeRaw = String(payload.replacementMode ?? "random").trim().toLowerCase();
        const replacementMode = replacementModeRaw === "specific" ? "specific" : "random";
        const replacementCardId = String(payload.replacementCardId ?? "").trim();
        return {
          type: "adminReplacePlayerCard",
          payload: {
            targetPlayerId,
            cardInstanceId,
            targetArea,
            replacementMode,
            replacementCardId: replacementCardId || undefined,
          },
        };
      }
      case "adminSetWorldCardReveal": {
        const kind = String(payload.kind ?? "").trim().toLowerCase();
        if (kind !== "bunker" && kind !== "threat") {
          return { errorKey: "error.control.worldKindBunkerThreatRequired" };
        }
        const index = toNumber(payload.index);
        if (index === null || !Number.isInteger(index) || index < 0) {
          return { errorKey: "error.control.worldCardIndexInvalid" };
        }
        return {
          type: "adminSetWorldCardReveal",
          payload: {
            kind,
            index,
            revealed: Boolean(payload.revealed),
          },
        };
      }
      case "adminReplaceWorldCard": {
        const kind = String(payload.kind ?? "").trim().toLowerCase();
        if (kind !== "bunker" && kind !== "threat" && kind !== "disaster") {
          return { errorKey: "error.control.worldKindBunkerThreatDisasterRequired" };
        }
        const replacementModeRaw = String(payload.replacementMode ?? "random").trim().toLowerCase();
        const replacementMode = replacementModeRaw === "specific" ? "specific" : "random";
        const replacementCardId = String(payload.replacementCardId ?? "").trim();
        const index = toNumber(payload.index);
        if (kind !== "disaster" && (index === null || !Number.isInteger(index) || index < 0)) {
          return { errorKey: "error.control.worldIndexRequiredForBunkerThreat" };
        }
        return {
          type: "adminReplaceWorldCard",
          payload: {
            kind,
            index: kind === "disaster" ? undefined : index ?? undefined,
            replacementMode,
            replacementCardId: replacementCardId || undefined,
          },
        };
      }
      case "adminSetWorldCount": {
        const kind = String(payload.kind ?? "").trim().toLowerCase();
        if (kind !== "bunker" && kind !== "threat") {
          return { errorKey: "error.control.worldKindBunkerThreatRequired" };
        }
        const count = toNumber(payload.count);
        if (count === null || !Number.isInteger(count) || count < 0) {
          return { errorKey: "error.control.worldCountInvalid" };
        }
        return { type: "adminSetWorldCount", payload: { kind, count } };
      }
      case "adminApplySpecial": {
        const actorPlayerId = requireNonEmpty(payload.actorPlayerId, "error.control.actorPlayerRequired");
        if (typeof actorPlayerId !== "string") return actorPlayerId;
        const specialInstanceId = String(payload.specialInstanceId ?? "").trim();
        const specialId = String(payload.specialId ?? "").trim();
        if (!specialInstanceId && !specialId) {
          return { errorKey: "error.control.specialSelectionRequired" };
        }
        const nestedPayload = isRecord(payload.payload) ? payload.payload : {};
        const fallbackPayload = { ...payload };
        delete fallbackPayload.actorPlayerId;
        delete fallbackPayload.specialInstanceId;
        delete fallbackPayload.specialId;
        delete fallbackPayload.payload;
        const effectivePayload =
          Object.keys(nestedPayload).length > 0 ? nestedPayload : (fallbackPayload as Record<string, unknown>);
        return {
          type: "adminApplySpecial",
          payload: {
            actorPlayerId,
            specialInstanceId: specialInstanceId || undefined,
            specialId: specialId || undefined,
            payload: effectivePayload,
          },
        };
      }
      default:
        return {
          errorKey: "error.control.unsupportedScenarioAction",
          errorVars: { actionType: actionType || "unknown" },
        };
    }
  };

  const runControlCommand = (
    room: Room,
    command: ControlCommand,
    options?: {
      targetPlayerId?: string;
      actorPlayerId?: string;
      scenarioActionType?: string;
      scenarioPayload?: Record<string, unknown>;
    }
  ): ControlCommandResult => {
    if (command === "START_GAME") {
      return startGameAsControl(room);
    }

    if (command === "TRANSFER_HOST") {
      const requestedTargetId = String(options?.targetPlayerId ?? "").trim();
      if (requestedTargetId) {
        if (requestedTargetId === room.hostId) {
          return controlError("error.alreadyHost");
        }
        const requestedTarget = room.players.get(requestedTargetId);
        if (!requestedTarget) {
          return controlError("error.targetPlayerNotFound");
        }
        if (!requestedTarget.connected) {
          return controlError("error.cannotTransferHostOffline");
        }
      }
      const nextHostId = requestedTargetId || pickNextHost(room, room.hostId);
      if (!nextHostId) {
        return controlError("error.noOtherPlayerForHostTransfer");
      }
      transferHost(room, "manual", room.hostId, requestedTargetId || undefined);
      return { ok: true };
    }

    if (command === "KICK_PLAYER" && room.phase === "lobby") {
      const targetPlayerId = String(options?.targetPlayerId ?? "").trim();
      if (!targetPlayerId) {
        return controlError("error.control.targetPlayerRequired");
      }
      if (targetPlayerId === room.controlId) {
        return controlError("error.control.cannotKickControl");
      }
      const target = room.players.get(targetPlayerId);
      if (!target) {
        return controlError("error.targetPlayerNotFound");
      }
      if (target.ws) {
        try {
          target.ws.close();
        } catch {
          // ignore
        }
      }
      removeLobbyPlayer(room, targetPlayerId);
      if (rooms.has(room.code)) {
        broadcastRoomState(room);
      }
      return { ok: true };
    }

    if (command === "SCENARIO_ACTION") {
      const actionType = String(options?.scenarioActionType ?? "").trim();
      if (!actionType) {
        return controlError("error.control.scenarioActionTypeRequired");
      }
      const parsedScenarioAction = parseControlScenarioAction(actionType, options?.scenarioPayload ?? {});
      if ("errorKey" in parsedScenarioAction) {
        return controlError(parsedScenarioAction.errorKey, parsedScenarioAction.errorVars);
      }

      if (!room.session || room.phase !== "game") {
        if (parsedScenarioAction.type === "devAddPlayer") {
          const bot = addLobbyBotPlayer(room, parsedScenarioAction.payload.name);
          if (!bot) {
            return controlError("error.control.addBotFailed");
          }
          broadcastRoomState(room);
          return { ok: true };
        }

        if (
          parsedScenarioAction.type === "devKickPlayer" ||
          parsedScenarioAction.type === "devRemovePlayer"
        ) {
          const targetPlayerId = String(parsedScenarioAction.payload.targetPlayerId ?? "").trim();
          if (!targetPlayerId) {
            return controlError("error.control.targetPlayerRequired");
          }
          if (targetPlayerId === room.controlId) {
            return controlError("error.control.cannotKickControl");
          }
          const target = room.players.get(targetPlayerId);
          if (!target) {
            return controlError("error.targetPlayerNotFound");
          }
          if (target.ws) {
            try {
              target.ws.close();
            } catch {
              // ignore
            }
          }
          removeLobbyPlayer(room, targetPlayerId);
          if (rooms.has(room.code)) {
            broadcastRoomState(room);
          }
          return { ok: true };
        }

        return controlError("error.control.availableAfterGameStart");
      }

      const explicitActorId = String(options?.actorPlayerId ?? "").trim();
      const preferredContinueActorId =
        parsedScenarioAction.type === "continueRound" && room.settings.continuePermission === "revealer_only"
          ? getCurrentTurnPlayerId(room)
          : room.hostId;
      const actorPlayerId =
        parsedScenarioAction.type === "adminApplySpecial"
          ? parsedScenarioAction.payload.actorPlayerId
          : resolveControlActorId(room, {
              preferredId: explicitActorId || preferredContinueActorId,
              allowAnyPresentPlayer: true,
            }) || room.hostId;
      if (!room.players.has(actorPlayerId)) {
        return controlError("error.control.actorNotFoundInRoom");
      }
      const result = room.session.handleAction(actorPlayerId, parsedScenarioAction);
      if (result.error) {
        return { ok: false, message: localizeScenarioMessageForRoom(room, result.error) };
      }
      if (result.stateChanged) {
        broadcastGameViews(room);
      }
      return { ok: true };
    }

    if (!room.session || room.phase !== "game") {
      return controlError("error.gameNotFound");
    }

    const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
    if (!anchorId) {
      return controlError("error.control.noActiveHost");
    }
    let hostView: ReturnType<ScenarioSession["getGameView"]>;
    try {
      hostView = room.session.getGameView(anchorId);
    } catch {
      return controlError("error.control.phaseDetectFailed");
    }
    const continueActorId =
      room.settings.continuePermission === "revealer_only"
        ? hostView.public.currentTurnPlayerId ?? room.hostId
        : room.hostId;

    let scenarioAction: ScenarioAction | null = null;
    if (command === "NEXT_STEP" || command === "START_VOTE") {
      scenarioAction = { type: "continueRound", payload: {} };
    } else if (command === "END_VOTE") {
      scenarioAction = { type: "finalizeVoting", payload: {} };
    } else if (command === "SKIP_STEP") {
      if (hostView.phase === "reveal_discussion") {
        scenarioAction = { type: "continueRound", payload: {} };
      } else if (hostView.phase === "voting" && hostView.public.votePhase === "voteSpecialWindow") {
        scenarioAction = { type: "finalizeVoting", payload: {} };
      } else {
        return controlError("error.control.skipStepUnavailable");
      }
    } else if (command === "SKIP_ROUND") {
      scenarioAction = { type: "devSkipRound", payload: {} };
    } else if (command === "SET_OUTCOME_SURVIVED") {
      scenarioAction = { type: "setBunkerOutcome", payload: { outcome: "survived" } };
    } else if (command === "SET_OUTCOME_FAILED") {
      scenarioAction = { type: "setBunkerOutcome", payload: { outcome: "failed" } };
    } else if (command === "KICK_PLAYER") {
      const targetPlayerId = String(options?.targetPlayerId ?? "").trim();
      if (!targetPlayerId) {
        return controlError("error.control.targetPlayerRequired");
      }
      if (targetPlayerId === room.controlId) {
        return controlError("error.control.cannotKickControl");
      }
      scenarioAction = { type: "devKickPlayer", payload: { targetPlayerId } };
    }

    if (!scenarioAction) {
      return controlError("error.control.unknownCommand");
    }

    const actorId =
      resolveControlActorId(room, {
        preferredId: scenarioAction.type === "continueRound" ? continueActorId : room.hostId,
        allowAnyPresentPlayer: true,
      }) || room.hostId;
    const result = room.session.handleAction(actorId, scenarioAction);
    if (result.error) {
      return { ok: false, message: localizeScenarioMessageForRoom(room, result.error) };
    }
    if (result.stateChanged) {
      broadcastGameViews(room);
    }
    return { ok: true };
  };

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

    const result = runControlCommand(room, action, {
      targetPlayerId,
      actorPlayerId,
      scenarioActionType,
      scenarioPayload,
    });
    if (!result.ok) {
      const localizedMessage = result.message
        ? result.message
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

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      let parsedJson: unknown;
      try {
          parsedJson = JSON.parse(data.toString());
        } catch {
          sendLocalizedError(ws, {
            key: "error.invalidJson",
          });
          return;
        }

      const parsed = ClientMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        sendLocalizedError(ws, {
          key: "error.invalidMessageFormat",
        });
        return;
      }

      const message = parsed.data as ClientMessage;
      logProtocol("message", { type: message.type });

      switch (message.type) {
        case "hello": {
          const payload = message.payload;
          devLog("hello received", {
            mode: IDENTITY_MODE,
            room: payload.roomCode ?? "(create)",
            tabId: payload.tabId ?? null,
            token: payload.playerToken ? "set" : "none",
          });
          if (IDENTITY_MODE === "dev_tab" && !payload.tabId && !payload.playerToken) {
            logProtocol("hello rejected", { reason: "missing_tabId", mode: IDENTITY_MODE });
            sendLocalizedError(ws, {
              key: "error.tabIdRequiredDev",
            });
            return;
          }
          if (payload.create) {
            if (!payload.scenarioId) {
              logProtocol("hello rejected", { reason: "missing_scenarioId" });
              sendLocalizedError(ws, {
                key: "error.scenarioIdRequired",
              });
              return;
            }
            const scenarioModule = scenarioMap.get(payload.scenarioId);
            if (!scenarioModule) {
              logProtocol("hello rejected", { reason: "scenario_not_found", scenarioId: payload.scenarioId });
              sendLocalizedError(ws, {
                key: "error.scenarioNotFound",
              });
              return;
            }
            const initialRuleset = buildAutoRuleset(MIN_CLASSIC_PLAYERS);

            const room: Room = {
              code: generateRoomCode(),
              hostId: "",
              controlId: "",
              createdAt: Date.now(),
              phase: "lobby",
              scenarioId: scenarioModule.meta.id,
              scenarioMeta: scenarioModule.meta,
              scenarioModule,
              settings: {
			   ...DEFAULT_SETTINGS,
			   cardLocale: normalizeCardLocale(payload.locale),
			  },
              disasterOptions: buildDisasterOptions(assets),
              ruleset: initialRuleset,
              rulesOverriddenByHost: false,
              rulesPresetCount: undefined,
              isDev: IDENTITY_MODE === "dev_tab",
              players: new Map(),
              playersByToken: new Map(),
              playersByTabId: new Map(),
              playersBySessionId: new Map(),
              joinOrder: [],
              lastGameViews: new Map(),
              overlayToken: crypto.randomBytes(20).toString("hex"),
              overlayEditToken: crypto.randomBytes(20).toString("hex"),
              overlayOverrides: {},
            };
            rooms.set(room.code, room);
            if (DEV_LOGS) {
              console.log(`[dev] room created code=${room.code} scenario=${room.scenarioMeta.id}`);
            }
            logRoomLifecycle("created", room.code, {
              scenario: room.scenarioMeta.id,
              phase: room.phase,
            });
            const player = attachPlayer(room, payload, ws);
            printOverlayInfo(
              room.code,
              room.overlayToken,
              room.overlayEditToken,
              room.overlayOverrides?.overlayUrlParams
            );
            updateRulesetIfAuto(room);
            logRoomLifecycle("joined", room.code, {
              player: payload.name,
              count: room.players.size,
              phase: room.phase,
            });
            broadcastRoomState(room);
            return;
          }

          if (!payload.roomCode) {
            logProtocol("hello rejected", { reason: "missing_roomCode" });
            sendLocalizedError(ws, {
              key: "error.roomCodeRequired",
            });
            return;
          }

          const room = rooms.get(payload.roomCode.toUpperCase());
          if (!room) {
            logProtocol("hello rejected", { reason: "room_not_found", roomCode: payload.roomCode.toUpperCase() });
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          if (payload.locale) {
            room.settings.cardLocale = normalizeCardLocale(payload.locale);
          }

          // Overlay Control websocket must never create a separate "CONTROL" player.
          // Bind companion socket either by overlayEditToken or by current control player's token.
          const controlPlayerForRoom = room.players.get(room.controlId);
          const controlPlayerToken = String(controlPlayerForRoom?.token ?? "");
          const helloPlayerToken = String(payload.playerToken ?? "");
          const isOverlayControlCompanionByToken =
            payload.name === "CONTROL" &&
            Boolean(helloPlayerToken) &&
            (helloPlayerToken === room.overlayEditToken || helloPlayerToken === controlPlayerToken);
          if (isOverlayControlCompanionByToken) {
            const controlPlayer = room.players.get(room.controlId);
            if (!controlPlayer) {
              sendLocalizedError(ws, {
                key: "error.controlPlayerNotFoundInRoom",
                room,
              });
              return;
            }
            connectionInfo.set(ws, { roomCode: room.code, playerId: controlPlayer.playerId });
            send(ws, {
              type: "helloAck",
              payload: { playerId: controlPlayer.playerId, playerToken: controlPlayer.token },
            });
            send(ws, { type: "roomState", payload: buildRoomState(room) });
            if (room.phase === "game" && room.session) {
              try {
                const payloadView = localizeGameViewForLocale(
                  room.session.getGameView(controlPlayer.playerId),
                  getRoomCardLocale(room),
                  room.scenarioId
                );
                send(ws, { type: "gameView", payload: payloadView });
              } catch {
                // ignore transient gameView errors for companion sockets
              }
            }
            return;
          }

          let existing: Player | undefined;
          if (IDENTITY_MODE === "dev_tab") {
            existing = findPlayerByTabId(room, payload.tabId);
          } else {
            existing = findPlayerByToken(room, payload.playerToken);
            if (!existing) {
              existing = findPlayerBySessionId(room, payload.sessionId);
            }
          }

          // Overlay Control may connect with the same control token while the creator
          // is already connected in the main app. Keep the primary player socket intact,
          // but still allow the companion socket to authenticate for CONTROL actions.
          const existingPlayer = existing;
          const isCompanionControlSocket =
            payload.name === "CONTROL" &&
            Boolean(payload.playerToken) &&
            existingPlayer !== undefined &&
            existingPlayer.connected &&
            Boolean(existingPlayer.ws) &&
            existingPlayer.ws !== ws;
          if (isCompanionControlSocket && existingPlayer) {
            connectionInfo.set(ws, { roomCode: room.code, playerId: existingPlayer.playerId });
            send(ws, {
              type: "helloAck",
              payload: { playerId: existingPlayer.playerId, playerToken: existingPlayer.token },
            });
            send(ws, { type: "roomState", payload: buildRoomState(room) });
            if (room.phase === "game" && room.session) {
              try {
                const payloadView = localizeGameViewForLocale(
                  room.session.getGameView(existingPlayer.playerId),
                  getRoomCardLocale(room),
                  room.scenarioId
                );
                send(ws, { type: "gameView", payload: payloadView });
              } catch {
                // ignore transient gameView errors for companion sockets
              }
            }
            return;
          }

          if (existing?.leftBunker) {
            if (
              existing.kickedAt &&
              Date.now() - existing.kickedAt <= RECONNECT_GRACE_AFTER_KICK_MS
            ) {
              // allow reconnect during grace window
            } else {
              sendReconnectForbidden(ws, room);
              return;
            }
          }

          if (existing && room.phase === "game") {
            const status = getScenarioStatus(room, existing.playerId);
            if (status === "eliminated" && existing.disconnectedAt) {
              if (Date.now() - existing.disconnectedAt > DISCONNECT_GRACE_MS) {
                sendReconnectForbidden(ws, room);
                return;
              }
            }
          }
          if (existing?.disconnectedAt) {
            const remainingMs = computeKickRemainingMs(existing);
            if (remainingMs <= 0) {
              markPlayerLeftBunker(room, existing);
              sendLocalizedError(ws, {
                key: "error.leftBunkerRejoinAsNew",
                room,
                code: "LEFT_BUNKER",
              });
              return;
            }
          }

          if (!existing && room.phase === "lobby" && room.players.size >= getEffectiveMaxPlayers(room)) {
            const maxPlayers = getEffectiveMaxPlayers(room);
            sendLocalizedError(ws, {
              key: "error.roomFull",
              room,
              code: "ROOM_FULL",
              vars: { maxPlayers },
              extra: { maxPlayers },
            });
            return;
          }

          if (!existing && room.phase === "game") {
            devLog("reconnect failed: player not found", { room: room.code });
            sendLocalizedError(ws, {
              key: "error.playerRestoreFailedRejoin",
              room,
              code: "PLAYER_RESTORE_FAILED",
            });
            return;
          }

          const wasDisconnected = Boolean(existing?.disconnectedAt);
          const player = attachPlayer(room, payload, ws, existing);
          devLog("player resolved", { room: room.code, playerId: player.playerId, existing: Boolean(existing) });
          updateRulesetIfAuto(room);
          logRoomLifecycle(existing ? "reconnected" : "joined", room.code, {
            player: player.name,
            count: room.players.size,
            phase: room.phase,
          });
          broadcastRoomState(room);
          if (room.phase === "game") {
            sendGameView(room, player);
            if (wasDisconnected) {
              broadcastGameViews(room);
            }
          }
          return;
        }
        case "resume": {
          const payload = message.payload;
          const room = rooms.get(payload.roomCode.toUpperCase());
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          const existing = findPlayerBySessionId(room, payload.sessionId);
          if (!existing) {
            sendLocalizedError(ws, {
              key: "error.playerRestoreFailed",
              room,
              code: "PLAYER_RESTORE_FAILED",
            });
            return;
          }

          if (existing.leftBunker) {
            if (
              existing.kickedAt &&
              Date.now() - existing.kickedAt <= RECONNECT_GRACE_AFTER_KICK_MS
            ) {
              // allow reconnect during grace window
            } else {
              sendReconnectForbidden(ws, room);
              return;
            }
          }

          if (room.phase === "game") {
            const status = getScenarioStatus(room, existing.playerId);
            if (status === "eliminated" && existing.disconnectedAt) {
              if (Date.now() - existing.disconnectedAt > DISCONNECT_GRACE_MS) {
                sendReconnectForbidden(ws, room);
                return;
              }
            }
          }

          if (existing.disconnectedAt) {
            const remainingMs = computeKickRemainingMs(existing);
            if (remainingMs <= 0) {
              markPlayerLeftBunker(room, existing);
              sendLocalizedError(ws, {
                key: "error.leftBunkerRejoinAsNew",
                room,
                code: "LEFT_BUNKER",
              });
              return;
            }
          }

          const wasDisconnected = Boolean(existing.disconnectedAt);
          const helloPayload: ClientHelloPayload = {
            name: existing.name,
            roomCode: room.code,
            playerToken: existing.token,
            tabId: existing.tabId,
            sessionId: payload.sessionId,
          };
          const player = attachPlayer(room, helloPayload, ws, existing);
          devLog("resume ok", { room: room.code, playerId: player.playerId });
          updateRulesetIfAuto(room);
          broadcastRoomState(room);
          if (room.phase === "game") {
            sendGameView(room, player);
            if (wasDisconnected) {
              broadcastGameViews(room);
            }
          }
          return;
        }
        case "overlaySubscribe": {
          const roomCode = message.payload.roomCode.toUpperCase();
          const room = rooms.get(roomCode);
          if (!room) {
            send(ws, {
              type: "overlayState",
              payload: {
                ok: false,
                unauthorized: true,
                message: tServerForRoom(undefined, "error.overlaySubscribeRoomNotFound"),
              },
            });
            return;
          }
          const token = message.payload.token;
          const role = getRoleForToken(room, token);
          if (role === null || (role !== "VIEW" && !canControl(role))) {
            send(ws, {
              type: "overlayState",
              payload: {
                ok: false,
                unauthorized: true,
                roomCode,
                message: tServerForRoom(room, "error.overlaySubscribeUnauthorized"),
              },
            });
            return;
          }
          overlaySubscriptions.set(ws, { roomCode, role });
          void sendOverlayState(room, ws, role);
          return;
        }
        case "startGame": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            sendLocalizedError(ws, {
              key: "error.onlyControlStartGame",
              room,
            });
            return;
          }
          const result = startGameAsControl(room);
          if (!result.ok) {
            if (result.messageKey) {
              sendLocalizedError(ws, {
                key: result.messageKey,
                room,
                vars: result.messageVars,
              });
              return;
            }
            if (result.message) {
              send(ws, { type: "error", payload: { message: result.message } });
              return;
            }
            sendLocalizedError(ws, {
              key: "error.startGameFailed",
              room,
            });
            return;
          }
          return;
        }
        case "updateLocale": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          room.settings.cardLocale = normalizeCardLocale(message.payload.locale);
          room.lastRoomState = undefined;
          room.lastGameViews?.clear();
          for (const player of room.players.values()) {
            player.needsFullState = true;
            player.needsFullGameView = true;
          }
          broadcastRoomState(room);
          if (room.session) {
            broadcastGameViews(room);
          }
          return;
        }
        case "updateSettings": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          if (room.phase !== "lobby") {
            sendLocalizedError(ws, {
              key: "error.settingsLobbyOnly",
              room,
            });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            sendLocalizedError(ws, {
              key: "error.onlyControlChangeSettings",
              room,
            });
            return;
          }
          const minAllowedPlayers = isClassicRoom(room) ? MIN_CLASSIC_PLAYERS : 2;
          const nextMaxPlayers = clampInt(message.payload.maxPlayers, minAllowedPlayers, MAX_CLASSIC_PLAYERS);
          if (nextMaxPlayers < room.players.size) {
            sendLocalizedError(ws, {
              key: "error.maxPlayersLowerThanCurrent",
              room,
            });
            return;
          }
          room.settings = {
			  ...message.payload,
			  maxPlayers: nextMaxPlayers,
			  forcedDisasterId: normalizeForcedDisasterId(
				message.payload.forcedDisasterId,
				room.disasterOptions
			  ),
			  cardLocale: normalizeCardLocale(message.payload.cardLocale),
			};
			broadcastRoomState(room);
			if (room.session) {
			  room.lastGameViews?.clear();
			  for (const player of room.players.values()) {
				player.needsFullGameView = true;
			  }
			  broadcastGameViews(room);
			}
			return;
        }
        case "updateRules": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          if (!isClassicRoom(room)) {
            sendLocalizedError(ws, {
              key: "error.rulesClassicOnly",
              room,
            });
            return;
          }
          if (room.phase !== "lobby") {
            sendLocalizedError(ws, {
              key: "error.rulesLobbyOnly",
              room,
            });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            sendLocalizedError(ws, {
              key: "error.onlyControlChangeRules",
              room,
            });
            return;
          }

          if (message.payload.mode === "auto") {
            room.rulesOverriddenByHost = false;
            room.rulesPresetCount = undefined;
            room.ruleset = buildAutoRuleset(room.players.size);
          } else {
            const presetCount = clampInt(
              message.payload.presetPlayerCount ?? room.rulesPresetCount ?? room.players.size,
              4,
              16
            );
            room.rulesOverriddenByHost = true;
            room.rulesPresetCount = presetCount;
            if (message.payload.manualConfig) {
              const manualConfig = normalizeManualConfig(
                message.payload.manualConfig,
                presetCount
              );
              room.rulesPresetCount = manualConfig.seedTemplatePlayers ?? presetCount;
              room.ruleset = buildManualRuleset(manualConfig, room.players.size);
            } else {
              const seedConfig = seedManualConfigFromPreset(presetCount);
              room.ruleset = buildManualRuleset(seedConfig, room.players.size);
            }
          }
          broadcastRoomState(room);
          return;
        }
        case "requestHostTransfer": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            sendLocalizedError(ws, {
              key: "error.onlyControlTransferRole",
              room,
            });
            return;
          }
          const requestedTargetId = String(message.payload.targetPlayerId ?? "").trim();
          if (requestedTargetId) {
            if (requestedTargetId === room.hostId) {
              sendLocalizedError(ws, {
                key: "error.alreadyHost",
                room,
              });
              return;
            }
            const requestedTarget = room.players.get(requestedTargetId);
            if (!requestedTarget) {
              sendLocalizedError(ws, {
                key: "error.targetPlayerNotFound",
                room,
              });
              return;
            }
            if (!requestedTarget.connected) {
              sendLocalizedError(ws, {
                key: "error.cannotTransferHostOffline",
                room,
              });
              return;
            }
          }
          const nextHostId = requestedTargetId || pickNextHost(room, room.hostId);
          if (!nextHostId) {
            sendLocalizedError(ws, {
              key: "error.noOtherPlayerForHostTransfer",
              room,
            });
            return;
          }
          transferHost(room, "manual", room.hostId, requestedTargetId || undefined);
          return;
        }
        case "ping": {
          send(ws, { type: "pong", payload: {} });
          return;
        }
        case "kickFromLobby": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            sendLocalizedError(ws, {
              key: "error.roomNotFound",
            });
            return;
          }
          if (room.phase !== "lobby") {
            sendLocalizedError(ws, {
              key: "error.commandLobbyOnly",
              room,
            });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            sendLocalizedError(ws, {
              key: "error.onlyControlKick",
              room,
            });
            return;
          }
          const targetId = message.payload.targetPlayerId;
          if (targetId === room.hostId) {
            sendLocalizedError(ws, {
              key: "error.cannotKickHost",
              room,
            });
            return;
          }
          const target = room.players.get(targetId);
          if (!target) {
            sendLocalizedError(ws, {
              key: "error.targetPlayerNotFound",
              room,
            });
            return;
          }
          if (target.ws) {
            try {
              target.ws.close();
            } catch {
              // ignore
            }
          }
          removeLobbyPlayer(room, targetId);
          devLog("lobby kick", {
            room: room.code,
            targetId,
            remaining: room.players.size,
          });
          if (rooms.has(room.code)) {
            broadcastRoomState(room);
          }
          return;
        }
        case "revealCard":
        case "vote":
        case "finalizeVoting":
        case "applySpecial":
        case "revealWorldThreat":
        case "setBunkerOutcome":
        case "continueRound":
        case "devSkipRound":
        case "devKickPlayer":
        case "devAddPlayer":
        case "devRemovePlayer": {
          const info = connectionInfo.get(ws);
          if (!info) {
            sendLocalizedError(ws, {
              key: "error.notInRoom",
            });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room || !room.session) {
            sendLocalizedError(ws, {
              key: "error.gameNotFound",
              room,
            });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          const controlOnlyActions = new Set([
            "finalizeVoting",
            "devSkipRound",
            "devKickPlayer",
            "devAddPlayer",
            "devRemovePlayer",
          ]);
          const continueRequiresControl =
            message.type === "continueRound" && Boolean(room.settings.enablePresenterMode);
          if ((controlOnlyActions.has(message.type) || continueRequiresControl) && !canControl(role)) {
            sendLocalizedError(ws, {
              key: "error.actionControlOnly",
              room,
              code: "PERMISSION_DENIED",
            });
            return;
          }
          if (
            (message.type === "revealCard" ||
              message.type === "vote" ||
              message.type === "applySpecial" ||
              message.type === "revealWorldThreat") &&
            !canPlayerAction(role)
          ) {
            sendLocalizedError(ws, {
              key: "error.actionPlayerPermission",
              room,
              code: "PERMISSION_DENIED",
            });
            return;
          }

          if (
            (message.type === "devAddPlayer" || message.type === "devRemovePlayer") &&
            !(DEV_SCENARIOS_ENABLED && room.scenarioMeta.devOnly)
          ) {
            sendLocalizedError(ws, {
              key: "error.devCommandsOnlyDevScenarios",
              room,
            });
            return;
          }

          if (message.type === "devSkipRound") {
            if (IDENTITY_MODE !== "dev_tab") {
              sendLocalizedError(ws, {
                key: "error.devModeDisabled",
                room,
              });
              return;
            }
            if (room.scenarioMeta.id !== CLASSIC_SCENARIO_ID) {
              sendLocalizedError(ws, {
                key: "error.commandClassicOnly",
                room,
              });
              return;
            }
          }

          if (message.type === "devKickPlayer") {
            if (IDENTITY_MODE !== "dev_tab") {
              sendLocalizedError(ws, {
                key: "error.devModeDisabled",
                room,
              });
              return;
            }
            if (room.scenarioMeta.id !== CLASSIC_SCENARIO_ID) {
              sendLocalizedError(ws, {
                key: "error.commandClassicOnly",
                room,
              });
              return;
            }
          }

          const action = message as ScenarioAction;
          let actorId =
            controlOnlyActions.has(message.type) || continueRequiresControl
              ? resolveControlActorId(room, { preferredId: room.hostId, allowAnyPresentPlayer: true }) ||
                room.hostId
              : info.playerId;
          if (
            message.type === "continueRound" &&
            canControl(role) &&
            room.settings.continuePermission === "revealer_only"
          ) {
            const turnActorId = getCurrentTurnPlayerId(room);
            actorId =
              resolveControlActorId(room, {
                preferredId: turnActorId || room.hostId,
                allowAnyPresentPlayer: true,
              }) || actorId;
          }
          if (message.type === "continueRound" && room.settings.continuePermission === "host_only") {
            const canProxyContinueAsHost = info.playerId === room.hostId || canControl(role);
            if (canProxyContinueAsHost) {
              actorId =
                resolveControlActorId(room, {
                  preferredId: room.hostId,
                  allowAnyPresentPlayer: true,
                }) || actorId;
            }
          }
          const result = room.session.handleAction(actorId, action);
          if (result.error) {
            send(ws, { type: "error", payload: { message: localizeScenarioMessageForRoom(room, result.error) } });
            return;
          }
          if (result.stateChanged) {
            broadcastGameViews(room);
          }
          return;
        }
        default: {
          sendLocalizedError(ws, {
            key: "error.unknownMessage",
          });
        }
      }
    });

    ws.on("close", () => {
      overlaySubscriptions.delete(ws);
      const info = connectionInfo.get(ws);
      if (!info) return;
      const room = rooms.get(info.roomCode);
      if (!room) return;
      const player = room.players.get(info.playerId);
      if (!player) return;
      if (player.ws && player.ws !== ws) {
        return;
      }
      connectionInfo.delete(ws);
      if (room.phase === "lobby") {
        removeLobbyPlayer(room, player.playerId);
        devLog("lobby disconnect", {
          room: room.code,
          playerId: player.playerId,
          remaining: room.players.size,
        });
        if (rooms.has(room.code)) {
          broadcastRoomState(room);
        }
        return;
      }
      const status = room.phase === "game" ? getScenarioStatus(room, player.playerId) : undefined;
      const isEliminated = status === "eliminated";
      player.connected = false;
      player.ws = undefined;
      if (!player.leftBunker) {
        if (!player.disconnectedAt) {
          player.disconnectedAt = Date.now();
          if (!isEliminated) {
            const remainingMs = computeKickRemainingMs(player);
            broadcastEvent(
              room,
              buildSystemEvent(
                room,
                "playerDisconnected",
                tServerForRoom(room, "info.playerDisconnectedGrace", {
                  playerName: player.name,
                  remaining: formatRemaining(remainingMs),
                })
              )
            );
          }
        }
        if (!isEliminated) {
          if (player.disconnectTimer) {
            clearTimeout(player.disconnectTimer);
          }
          const remainingMs = computeKickRemainingMs(player);
          if (remainingMs <= 0) {
            markPlayerLeftBunker(room, player);
          } else {
            player.disconnectTimer = setTimeout(() => {
              markPlayerLeftBunker(room, player);
            }, remainingMs);
            unrefTimer(player.disconnectTimer);
          }
          if (player.disconnectTicker) {
            clearInterval(player.disconnectTicker);
          }
          player.disconnectTicker = setInterval(() => {
            if (player.connected || player.leftBunker || !player.disconnectedAt) {
              if (player.disconnectTicker) {
                clearInterval(player.disconnectTicker);
                player.disconnectTicker = undefined;
              }
              return;
            }
            const remainingMsTick = computeKickRemainingMs(player);
            if (remainingMsTick <= 0) {
              markPlayerLeftBunker(room, player);
              return;
            }
            const remainingMinutes = Math.floor(remainingMsTick / 60000);
            if (player.disconnectNotifiedMinutes === remainingMinutes) return;
            player.disconnectNotifiedMinutes = remainingMinutes;
            broadcastEvent(
              room,
              buildSystemEvent(
                room,
                "playerDisconnected",
                tServerForRoom(room, "info.playerMissingGrace", {
                  playerName: player.name,
                  remaining: formatRemaining(remainingMsTick),
                })
              )
            );
          }, 60000);
          unrefTimer(player.disconnectTicker);
        }
      }
      if (room.phase === "game" && room.hostId === player.playerId) {
        scheduleHostTransfer(room, "disconnect_timeout");
      }
      logRoomLifecycle("disconnected", room.code, {
        player: player.name,
        phase: room.phase,
        connected: player.connected,
      });
      broadcastRoomState(room);
      if (room.phase === "game") {
        broadcastGameViews(room);
      }
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
    console.log(`Assets root: ${ASSETS_ROOT} (decks: ${deckCount}, source: ${assetsResolved.source})`);
    if (SERVE_CLIENT) {
      console.log(`Client dist: ${CLIENT_DIST} (source: ${clientResolved.source})`);
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
