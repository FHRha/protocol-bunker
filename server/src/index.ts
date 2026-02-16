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
  LINK_PATHS,
  OverlayOverridesSchema,
  buildLinkSet,
  getRulesetForPlayerCount,
} from "@bunker/shared";
import { buildAssetCatalog } from "./catalog.js";
import { createRandomRng } from "./rng.js";
import { getSubtitleMap, norm, normDeck, type CardDeck, type SubtitleMap } from "./card_subtitles.js";
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
const MANUAL_MAX_ROUNDS = 64;
const MANUAL_MAX_VOTES_PER_ROUND = 9;
const MANUAL_MIN_TARGET_REVEALS = 5;
const MANUAL_MAX_TARGET_REVEALS = 7;
const MANUAL_DEFAULT_TARGET_REVEALS = 7;
const WAN_LOOKUP_TIMEOUT_MS = 2800;
const WAN_LOOKUP_CACHE_TTL_MS = 10 * 60 * 1000;

let wanLookupCacheKey = "";
let wanLookupCacheIp: string | null = null;
let wanLookupCacheExpiresAt = 0;
let wanLookupInFlight: Promise<string | null> | null = null;
let publicBaseLogSignature = "";
let clientIndexCacheStamp = "";
let clientIndexCacheHtml = "";

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

function printOverlayInfo(roomCode: string, token: string, controlToken?: string) {
  const { lanOrigin } = buildLinkOrigins();
  const links = buildLinkSet({
    lanBase: lanOrigin,
    publicBase: undefined,
    roomCode,
    overlayViewToken: token,
    overlayControlToken: controlToken ?? "<CONTROL_OR_EDIT_TOKEN>",
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

const DEFAULT_SETTINGS: GameSettings = {
  enableRevealDiscussionTimer: false,
  revealDiscussionSeconds: 60,
  enablePreVoteDiscussionTimer: false,
  preVoteDiscussionSeconds: 60,
  enablePostVoteDiscussionTimer: false,
  postVoteDiscussionSeconds: 45,
  enablePresenterMode: false,
  continuePermission: "revealer_only",
  revealTimeoutAction: "random_card",
  revealsBeforeVoting: 2,
  specialUsage: "anytime",
  maxPlayers: 12,
  finalThreatReveal: "host",
};

const rooms = new Map<string, Room>();
const connectionInfo = new WeakMap<WebSocket, { roomCode: string; playerId: string }>();
const overlaySubscriptions = new Map<WebSocket, { roomCode: string; role: Role }>();

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
        DISCONNECT_GRACE_MS -
          ((player.totalAbsentMs ?? 0) +
            (!player.connected && player.disconnectedAt ? Date.now() - player.disconnectedAt : 0))
      ),
      leftBunker: player.leftBunker,
    })),
    hostId: room.hostId,
    controlId: room.controlId,
    phase: room.phase,
    scenarioMeta: room.scenarioMeta,
    settings: room.settings,
    ruleset: room.ruleset,
    rulesOverriddenByHost: room.rulesOverriddenByHost,
    rulesPresetCount: room.rulesPresetCount,
    world: room.world,
    isDev: room.isDev,
  };
}

const OVERLAY_CATEGORIES = [
  { key: "profession", label: "Профессия", aliases: ["Профессия"] },
  { key: "health", label: "Здоровье", aliases: ["Здоровье"] },
  { key: "hobby", label: "Хобби", aliases: ["Хобби"] },
  { key: "phobia", label: "Фобия", aliases: ["Фобия"] },
  { key: "baggage", label: "Багаж", aliases: ["Багаж"] },
  { key: "fact1", label: "Факт №1", aliases: ["Факт №1"] },
  { key: "fact2", label: "Факт №2", aliases: ["Факт №2"] },
  { key: "biology", label: "Биология", aliases: ["Биология"] },
] as const;

function clampLine(value: string, max = 56): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return "?";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function normalizeOverlayCatastropheText(value: string | undefined): string {
  const normalized = sanitizeMultiLine(value ?? "", OVERLAY_MAX_CATA_LEN).trim();
  return normalized || "скрыто";
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
} | null | undefined): string {
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
  return "скрыто";
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
  deck: string,
  titleRaw: string,
  titleRendered: string
): string | undefined {
  if (subtitleMap.size === 0) return undefined;
  const deckKey = normDeck(deck);
  const titlesToTry = [
    norm(titleRaw),
    norm(titleRendered),
  ];
  const expandedTitles = new Set<string>();
  for (const titleKey of titlesToTry) {
    if (!titleKey) continue;
    expandedTitles.add(titleKey);
    expandedTitles.add(titleKey.replace(/-/g, " "));
    expandedTitles.add(titleKey.replace(/\s+/g, "-"));
  }
  let mappedRaw = "";
  for (const titleKey of expandedTitles) {
    const found = subtitleMap.get(`${deckKey}::${titleKey}`);
    if (found) {
      mappedRaw = found;
      break;
    }
  }
  const mapped = sanitizeSingleLine(mappedRaw, OVERLAY_MAX_LINE_LEN)
    .trim()
    .replace(/\s+/g, " ");
  if (!mapped) return undefined;
  const sameAsTitle =
    normalizeOverlayCompareValue(mapped) === normalizeOverlayCompareValue(titleRendered);
  return sameAsTitle ? undefined : mapped;
}

function buildTopItems(
  cards: Array<{ isRevealed?: boolean; title?: string; description?: string; imageId?: string }>,
  deck: CardDeck,
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
      subtitle = readMappedSubtitle(subtitleMap, deck, titleRaw, title);
    }
    if (subtitle && normalizeOverlayCompareValue(subtitle) === normalizeOverlayCompareValue(title)) {
      subtitle = undefined;
    }
    if (DEV_LOGS && deck === "угроза" && norm(title).includes("стресс")) {
      const keyMain = `${normDeck(deck)}::${norm(title)}`;
      const fromMap = readMappedSubtitle(subtitleMap, deck, titleRaw, title);
      console.log("[overlay subtitles] stress debug", {
        title,
        keyMain,
        subtitleFromMapFound: Boolean(fromMap),
      });
    }
    return { title, subtitle, imageId: card.imageId };
  });
}

function buildTopLinesFromItems(items: Array<{ title: string }>) {
  if (!items.length) return ["скрыто"];
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

function extractBioTags(player: PublicPlayerView) {
  const bio = readCategoryValue(player, ["Биология"]);
  if (!bio.revealed) {
    return {
      sex: { label: "Пол", revealed: false, value: "?" },
      age: { label: "Возраст", revealed: false, value: "?" },
      orientation: { label: "Ориентация", revealed: false, value: "?" },
    };
  }

  const raw = bio.value;
  const sexMatch = raw.match(/\b([МЖ])\b/i);
  const ageMatch = raw.match(/\b(\d{1,3})\b/);
  const orientationDirect = readCategoryValue(player, ["Ориентация"]);

  return {
    sex: {
      label: "Пол",
      revealed: Boolean(sexMatch),
      value: sexMatch ? sexMatch[1].toUpperCase() : "?",
    },
    age: {
      label: "Возраст",
      revealed: Boolean(ageMatch),
      value: ageMatch ? ageMatch[1] : "?",
    },
    orientation: orientationDirect.revealed
      ? { label: "Ориентация", revealed: true, value: orientationDirect.value }
      : { label: "Ориентация", revealed: false, value: "?" },
  };
}

async function getOverlayState(room: Room): Promise<OverlayState | null> {
  const fallback = {
    roomId: room.code,
    playerCount: room.players.size,
    top: {
      bunker: { revealed: 0, total: 0, lines: ["скрыто"] },
      catastrophe: { text: "скрыто", title: undefined, imageId: undefined },
      threats: { revealed: 0, total: 0, lines: ["скрыто"] },
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
          sex: { label: "Пол", revealed: false, value: "?" },
          age: { label: "Возраст", revealed: false, value: "?" },
          orientation: { label: "Ориентация", revealed: false, value: "?" },
        },
        categories: OVERLAY_CATEGORIES.map((entry) => ({
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
    const subtitleMap = await getSubtitleMap();
    const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
    if (!anchorId) return fallback;
    const view = room.session.getGameView(anchorId);
    const world = view.world;
    const bunkerOpened = world?.bunker.filter((card) => card.isRevealed).length ?? 0;
    const bunkerTotal = world?.counts.bunker ?? 0;
    const threatOpened = world?.threats.filter((card) => card.isRevealed).length ?? 0;
    const threatTotal = world?.counts.threats ?? 0;
    const bunkerItems = buildTopItems(world?.bunker ?? [], "бункер", subtitleMap);
    const threatItems = buildTopItems(world?.threats ?? [], "угроза", subtitleMap);
    const bunkerLines = buildTopLinesFromItems(bunkerItems);
    const threatLines = buildTopLinesFromItems(threatItems);
    const catastropheTitle = normalizeOverlayCatastropheTitle(
      world?.disaster.title,
      world?.disaster.description,
      (world?.disaster as { labelShort?: string } | undefined)?.labelShort
    );
    const catastropheText = normalizeOverlayCatastropheText(buildOverlayCatastropheBody(world?.disaster));

    return {
      roomId: room.code,
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
        const categories = OVERLAY_CATEGORIES.map((entry) => {
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
          tags: extractBioTags(player),
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
    const view = room.session.getGameView(anchorId);
    const votesByPlayer = new Map((view.public.votesPublic ?? []).map((vote) => [vote.voterId, vote.status]));
    const revealedThisRound = new Set(view.public.revealedThisRound ?? []);

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
        revealedThisRound: revealedThisRound.has(player.playerId),
      })),
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
        canEndVote: view.phase === "voting" && view.public.votePhase === "voteSpecialWindow",
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
  const overlayState = await getOverlayState(room);
  const categoriesMap = new Map<string, string>();
  for (const category of OVERLAY_CATEGORIES) {
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
    categories,
    players,
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
    send(player.ws, {
      type: "error",
      payload: { message: "Не удалось восстановить игрока. Перезайдите в комнату." },
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
      const totalAbsentMs = roomPlayer?.totalAbsentMs ?? 0;
      return {
        ...entry,
        connected: roomPlayer?.connected ?? false,
        disconnectedAt: roomPlayer?.disconnectedAt,
        totalAbsentMs,
        currentOfflineMs,
        kickRemainingMs: Math.max(0, DISCONNECT_GRACE_MS - (totalAbsentMs + currentOfflineMs)),
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
    if (!room.lastGameViews) {
      room.lastGameViews = new Map();
    }
    const lastView = room.lastGameViews.get(player.playerId);
    if (player.needsFullGameView || !lastView) {
      send(player.ws, { type: "gameView", payload });
      player.needsFullGameView = false;
    } else {
      const patch = diffTopLevel(lastView, payload);
      if (patch) {
        send(player.ws, { type: "statePatch", payload: { gameView: patch } });
      }
      player.needsFullGameView = false;
    }
    room.lastGameViews.set(player.playerId, payload);
    devLog("gameView sent", { room: room.code, playerId: player.playerId });
  } catch (error) {
    console.error("[server] Scenario getGameView failed", error);
    send(player.ws, {
      type: "error",
      payload: { message: "Ошибка сценария. Попробуйте переподключиться." },
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
    if (entry.status === "eliminated" && room.hostId === entry.playerId) {
      transferHost(room, "eliminated");
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

function transferHost(
  room: Room,
  reason: "disconnect_timeout" | "left_bunker" | "eliminated" | "manual",
  excludeId?: string
): void {
  if (room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = undefined;
  }
  const nextHostId = pickNextHost(room, excludeId);
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
  broadcastEvent(room, buildSystemEvent(room, "info", `Новый хост: ${hostName}.`));
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
        `Хост ${hostPlayer.name} отключился. Если не вернётся за ${Math.floor(
          HOST_GRACE_MS / 1000
        )} секунд, хост будет передан.`
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
    buildSystemEvent(room, "playerLeftBunker", `Игрок ${player.name} покинул бункер.`)
  );
  if (room.hostId === player.playerId) {
    if (room.hostTransferTimer) {
      clearTimeout(room.hostTransferTimer);
      room.hostTransferTimer = undefined;
    }
    transferHost(room, "left_bunker");
  }
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function computeKickRemainingMs(player: Player, now = Date.now()): number {
  const totalAbsentMs = player.totalAbsentMs ?? 0;
  const currentOfflineMs = player.disconnectedAt ? now - player.disconnectedAt : 0;
  return Math.max(0, DISCONNECT_GRACE_MS - (totalAbsentMs + currentOfflineMs));
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
    if (player.disconnectedAt) {
      const delta = Math.max(0, Date.now() - player.disconnectedAt);
      player.totalAbsentMs = (player.totalAbsentMs ?? 0) + delta;
    }
    player.disconnectedAt = undefined;
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
      buildSystemEvent(room, "playerReconnected", `Игрок ${player.name} вернулся.`)
    );
  }

  return player;
}

function buildReconnectForbidden(): ServerMessage {
  return {
    type: "error",
    payload: { code: "RECONNECT_FORBIDDEN", message: "Истекло время на переподключение." },
  };
}

async function main() {
  const assets = buildAssetCatalog(ASSETS_ROOT);
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

  app.use("/assets", express.static(ASSETS_ROOT));
  app.use(LINK_PATHS.overlayAssets, express.static(OVERLAY_PUBLIC_ROOT));
  if (SERVE_CLIENT && fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST, { index: false }));
  }

  app.get(LINK_PATHS.overlayView, (_req, res) => {
    const overlayHtml = path.join(OVERLAY_PUBLIC_ROOT, "overlay.html");
    if (!fs.existsSync(overlayHtml)) {
      res.status(404).type("text/plain").send("Overlay page not found");
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
      res.status(403).type("text/plain").send("Forbidden");
      return;
    }
    const controlHtml = path.join(OVERLAY_PUBLIC_ROOT, "overlay-control.html");
    if (!fs.existsSync(controlHtml)) {
      res.status(404).type("text/plain").send("Overlay control page not found");
      return;
    }
    res.sendFile(controlHtml);
  });

  app.get(LINK_PATHS.overlayControlState, async (req, res) => {
    const roomCode = String(req.query.room ?? req.query.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(req.query.token ?? "").trim();
    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: "Room not found" });
      return;
    }
    const tokenRole = getRoleForToken(room, token);
    if (tokenRole === null || !canControl(tokenRole)) {
      res.status(403).json({ ok: false, message: "Forbidden" });
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
      res.status(500).json({ ok: false, message: "Failed to build overlay control state" });
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
      res.status(404).json({ ok: false, message: "Room not found" });
      return;
    }
    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: "Forbidden" });
      return;
    }
    const normalized = normalizeOverlayOverrides(payload.overrides, room);
    const parsed = OverlayOverridesSchema.safeParse(normalized);
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        message: "Invalid overrides payload",
      });
      return;
    }

    room.overlayOverrides = parsed.data;
    broadcastOverlayState(room);
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
      res.status(400).json({ ok: false, message: "roomCode and token are required" });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: "Room not found" });
      return;
    }

    if (!isOverlayEditAuthorized(room, token)) {
      res.status(403).json({ ok: false, message: "Forbidden" });
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
      overlayControlToken: token,
    });

    res.json({
      ok: true,
      lanBase: links.lanBase,
      publicBase: links.publicBase ?? null,
      linkVisibility: HIDE_LOCAL_LINKS_IN_LOGS ? "public" : "all",
      buildProfile: BUILD_PROFILE || "public",
      roomCode: room.code,
      overlayViewToken: room.overlayToken,
      overlayControlToken: token,
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
    | "KICK_PLAYER";

  const startGameAsControl = (room: Room): { ok: boolean; message?: string } => {
    if (room.phase !== "lobby") {
      return { ok: false, message: "Игра уже начата" };
    }
    if (isClassicRoom(room) && room.players.size < MIN_CLASSIC_PLAYERS) {
      return { ok: false, message: "Нужно минимум 4 игрока." };
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
      onEvent: (event) => broadcastEvent(room, event),
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

  const runControlCommand = (
    room: Room,
    command: ControlCommand,
    options?: { targetPlayerId?: string }
  ): { ok: boolean; message?: string } => {
    if (command === "START_GAME") {
      return startGameAsControl(room);
    }

    if (command === "KICK_PLAYER" && room.phase === "lobby") {
      const targetPlayerId = String(options?.targetPlayerId ?? "").trim();
      if (!targetPlayerId) {
        return { ok: false, message: "Нужно выбрать игрока." };
      }
      if (targetPlayerId === room.controlId) {
        return { ok: false, message: "Нельзя выгнать создателя комнаты (CONTROL)." };
      }
      const target = room.players.get(targetPlayerId);
      if (!target) {
        return { ok: false, message: "Игрок не найден." };
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

    if (!room.session || room.phase !== "game") {
      return { ok: false, message: "Игра не найдена" };
    }

    const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
    if (!anchorId) {
      return { ok: false, message: "Нет активного ведущего." };
    }
    let hostView: ReturnType<ScenarioSession["getGameView"]>;
    try {
      hostView = room.session.getGameView(anchorId);
    } catch {
      return { ok: false, message: "Не удалось определить текущую фазу." };
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
        return { ok: false, message: "Этот шаг сейчас нельзя пропустить." };
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
        return { ok: false, message: "Нужно выбрать игрока." };
      }
      if (targetPlayerId === room.controlId) {
        return { ok: false, message: "Нельзя выгнать создателя комнаты (CONTROL)." };
      }
      scenarioAction = { type: "devKickPlayer", payload: { targetPlayerId } };
    }

    if (!scenarioAction) {
      return { ok: false, message: "Неизвестная команда управления." };
    }

    const actorId = scenarioAction.type === "continueRound" ? continueActorId : room.hostId;
    const result = room.session.handleAction(actorId, scenarioAction);
    if (result.error) {
      return { ok: false, message: result.error };
    }
    if (result.stateChanged) {
      broadcastGameViews(room);
    }
    return { ok: true };
  };

  app.post(LINK_PATHS.overlayControlAction, (req, res) => {
    const payload = isRecord(req.body) ? req.body : {};
    const roomCode = String(payload.roomCode ?? "")
      .trim()
      .toUpperCase();
    const token = String(payload.token ?? "").trim();
    const action = String(payload.action ?? "").trim().toUpperCase() as ControlCommand;
    const targetPlayerId = String(payload.targetPlayerId ?? "").trim();

    if (!roomCode || !token || !action) {
      res.status(400).json({ ok: false, message: "roomCode, token and action are required" });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      res.status(404).json({ ok: false, message: "Room not found" });
      return;
    }

    const tokenRole = getRoleForToken(room, token);
    if (tokenRole === null || !canControl(tokenRole)) {
      res.status(403).json({ ok: false, message: "Forbidden" });
      return;
    }
    if (!room.settings.enablePresenterMode) {
      res.status(400).json({ ok: false, message: "Presenter mode is disabled for this room." });
      return;
    }

    const result = runControlCommand(room, action, { targetPlayerId });
    if (!result.ok) {
      res.status(400).json({ ok: false, message: result.message ?? "Action rejected" });
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
          send(ws, { type: "error", payload: { message: "Неверный JSON" } });
          return;
        }

      const parsed = ClientMessageSchema.safeParse(parsedJson);
      if (!parsed.success) {
        send(ws, { type: "error", payload: { message: "Неверный формат сообщения" } });
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
            send(ws, { type: "error", payload: { message: "tabId обязателен в dev_tab режиме" } });
            return;
          }
          if (payload.create) {
            if (!payload.scenarioId) {
              logProtocol("hello rejected", { reason: "missing_scenarioId" });
              send(ws, { type: "error", payload: { message: "Нужен scenarioId" } });
              return;
            }
            const scenarioModule = scenarioMap.get(payload.scenarioId);
            if (!scenarioModule) {
              logProtocol("hello rejected", { reason: "scenario_not_found", scenarioId: payload.scenarioId });
              send(ws, { type: "error", payload: { message: "Сценарий не найден" } });
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
              settings: { ...DEFAULT_SETTINGS },
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
            printOverlayInfo(room.code, room.overlayToken, player.token);
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
            send(ws, { type: "error", payload: { message: "Нужен roomCode" } });
            return;
          }

          const room = rooms.get(payload.roomCode.toUpperCase());
          if (!room) {
            logProtocol("hello rejected", { reason: "room_not_found", roomCode: payload.roomCode.toUpperCase() });
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }

          let existing: Player | undefined;
          if (IDENTITY_MODE === "dev_tab") {
            existing = findPlayerByTabId(room, payload.tabId);
            if (!existing) {
              existing = findPlayerByToken(room, payload.playerToken);
            }
          } else {
            existing = findPlayerByToken(room, payload.playerToken);
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
                const payloadView = room.session.getGameView(existingPlayer.playerId);
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
              send(ws, buildReconnectForbidden());
              return;
            }
          }

          if (existing && room.phase === "game") {
            const status = getScenarioStatus(room, existing.playerId);
            if (status === "eliminated" && existing.disconnectedAt) {
              if (Date.now() - existing.disconnectedAt > DISCONNECT_GRACE_MS) {
                send(ws, buildReconnectForbidden());
                return;
              }
            }
          }
          if (existing?.disconnectedAt) {
            const remainingMs = computeKickRemainingMs(existing);
            if (remainingMs <= 0) {
              markPlayerLeftBunker(room, existing);
              send(ws, {
                type: "error",
                payload: { message: "Игрок покинул бункер. Перезайдите в комнату как новый игрок." },
              });
              return;
            }
          }

          if (!existing && room.phase === "lobby" && room.players.size >= getEffectiveMaxPlayers(room)) {
            const maxPlayers = getEffectiveMaxPlayers(room);
            const message = `Комната заполнена (макс ${maxPlayers}).`;
            send(ws, { type: "error", payload: { message, code: "ROOM_FULL", maxPlayers } });
            return;
          }

          if (!existing && room.phase === "game") {
            devLog("reconnect failed: player not found", { room: room.code });
            send(ws, {
              type: "error",
              payload: { message: "Не удалось восстановить игрока. Перезайдите в комнату." },
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
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }
          const existing = findPlayerBySessionId(room, payload.sessionId);
          if (!existing) {
            send(ws, { type: "error", payload: { message: "Не удалось восстановить игрока." } });
            return;
          }

          if (existing.leftBunker) {
            if (
              existing.kickedAt &&
              Date.now() - existing.kickedAt <= RECONNECT_GRACE_AFTER_KICK_MS
            ) {
              // allow reconnect during grace window
            } else {
              send(ws, buildReconnectForbidden());
              return;
            }
          }

          if (room.phase === "game") {
            const status = getScenarioStatus(room, existing.playerId);
            if (status === "eliminated" && existing.disconnectedAt) {
              if (Date.now() - existing.disconnectedAt > DISCONNECT_GRACE_MS) {
                send(ws, buildReconnectForbidden());
                return;
              }
            }
          }

          if (existing.disconnectedAt) {
            const remainingMs = computeKickRemainingMs(existing);
            if (remainingMs <= 0) {
              markPlayerLeftBunker(room, existing);
              send(ws, {
                type: "error",
                payload: { message: "Игрок покинул бункер. Перезайдите в комнату как новый игрок." },
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
              payload: { ok: false, unauthorized: true, message: "Room not found." },
            });
            return;
          }
          const token = message.payload.token;
          const role = getRoleForToken(room, token);
          if (role === null || (role !== "VIEW" && !canControl(role))) {
            send(ws, {
              type: "overlayState",
              payload: { ok: false, unauthorized: true, roomCode, message: "Unauthorized." },
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
            send(ws, { type: "error", payload: { message: "Вы не в комнате" } });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            send(ws, { type: "error", payload: { message: "Только CONTROL может начать игру" } });
            return;
          }
          const result = startGameAsControl(room);
          if (!result.ok) {
            send(ws, { type: "error", payload: { message: result.message ?? "Не удалось начать игру" } });
            return;
          }
          return;
        }
        case "updateSettings": {
          const info = connectionInfo.get(ws);
          if (!info) {
            send(ws, { type: "error", payload: { message: "Вы не в комнате" } });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }
          if (room.phase !== "lobby") {
            send(ws, { type: "error", payload: { message: "Настройки доступны только в лобби." } });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            send(ws, { type: "error", payload: { message: "Только CONTROL может менять настройки." } });
            return;
          }
          const minAllowedPlayers = isClassicRoom(room) ? MIN_CLASSIC_PLAYERS : 2;
          const nextMaxPlayers = clampInt(message.payload.maxPlayers, minAllowedPlayers, MAX_CLASSIC_PLAYERS);
          if (nextMaxPlayers < room.players.size) {
            send(ws, { type: "error", payload: { message: "Лимит игроков меньше текущего числа." } });
            return;
          }
          room.settings = {
            ...message.payload,
            maxPlayers: nextMaxPlayers,
          };
          broadcastRoomState(room);
          return;
        }
        case "updateRules": {
          const info = connectionInfo.get(ws);
          if (!info) {
            send(ws, { type: "error", payload: { message: "Вы не в комнате" } });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }
          if (!isClassicRoom(room)) {
            send(ws, { type: "error", payload: { message: "Правила доступны только для Classic." } });
            return;
          }
          if (room.phase !== "lobby") {
            send(ws, { type: "error", payload: { message: "Правила можно менять только в лобби." } });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            send(ws, { type: "error", payload: { message: "Только CONTROL может менять правила." } });
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
            send(ws, { type: "error", payload: { message: "Вы не в комнате" } });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            send(ws, { type: "error", payload: { message: "Только CONTROL может передать роль." } });
            return;
          }
          const nextHostId = pickNextHost(room, room.hostId);
          if (!nextHostId) {
            send(ws, { type: "error", payload: { message: "Нет другого игрока для передачи роли." } });
            return;
          }
          transferHost(room, "manual", room.hostId);
          return;
        }
        case "ping": {
          send(ws, { type: "pong", payload: {} });
          return;
        }
        case "kickFromLobby": {
          const info = connectionInfo.get(ws);
          if (!info) {
            send(ws, { type: "error", payload: { message: "Вы не в комнате" } });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room) {
            send(ws, { type: "error", payload: { message: "Комната не найдена" } });
            return;
          }
          if (room.phase !== "lobby") {
            send(ws, { type: "error", payload: { message: "Команда доступна только в лобби." } });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          if (!canControl(role)) {
            send(ws, { type: "error", payload: { message: "Только CONTROL может кикать игроков." } });
            return;
          }
          const targetId = message.payload.targetPlayerId;
          if (targetId === room.hostId) {
            send(ws, { type: "error", payload: { message: "Нельзя кикнуть хоста." } });
            return;
          }
          const target = room.players.get(targetId);
          if (!target) {
            send(ws, { type: "error", payload: { message: "Игрок не найден." } });
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
            send(ws, { type: "error", payload: { message: "Вы не в комнате" } });
            return;
          }
          const room = rooms.get(info.roomCode);
          if (!room || !room.session) {
            send(ws, { type: "error", payload: { message: "Игра не найдена" } });
            return;
          }
          const role = getRoleForPlayer(room, info.playerId);
          const controlOnlyActions = new Set([
            "finalizeVoting",
            "setBunkerOutcome",
            "devSkipRound",
            "devKickPlayer",
            "devAddPlayer",
            "devRemovePlayer",
          ]);
          const continueRequiresControl =
            message.type === "continueRound" && Boolean(room.settings.enablePresenterMode);
          if ((controlOnlyActions.has(message.type) || continueRequiresControl) && !canControl(role)) {
            send(ws, { type: "error", payload: { message: "Действие доступно только роли CONTROL." } });
            return;
          }
          if (
            (message.type === "revealCard" ||
              message.type === "vote" ||
              message.type === "applySpecial" ||
              message.type === "revealWorldThreat") &&
            !canPlayerAction(role)
          ) {
            send(ws, { type: "error", payload: { message: "Недостаточно прав для действия игрока." } });
            return;
          }

          if (
            (message.type === "devAddPlayer" || message.type === "devRemovePlayer") &&
            !(DEV_SCENARIOS_ENABLED && room.scenarioMeta.devOnly)
          ) {
            send(ws, { type: "error", payload: { message: "Dev-команды доступны только в dev-сценариях." } });
            return;
          }

          if (message.type === "devSkipRound") {
            if (IDENTITY_MODE !== "dev_tab") {
              send(ws, { type: "error", payload: { message: "Dev-режим выключен." } });
              return;
            }
            if (room.scenarioMeta.id !== CLASSIC_SCENARIO_ID) {
              send(ws, { type: "error", payload: { message: "Команда доступна только в Classic." } });
              return;
            }
          }

          if (message.type === "devKickPlayer") {
            if (IDENTITY_MODE !== "dev_tab") {
              send(ws, { type: "error", payload: { message: "Dev-режим выключен." } });
              return;
            }
            if (room.scenarioMeta.id !== CLASSIC_SCENARIO_ID) {
              send(ws, { type: "error", payload: { message: "Команда доступна только в Classic." } });
              return;
            }
          }

          const action = message as ScenarioAction;
          let actorId =
            controlOnlyActions.has(message.type) || continueRequiresControl || message.type === "setBunkerOutcome"
              ? room.hostId
              : info.playerId;
          if (
            message.type === "continueRound" &&
            canControl(role) &&
            room.settings.continuePermission === "revealer_only"
          ) {
            try {
              const anchorId = room.players.has(room.hostId) ? room.hostId : room.joinOrder[0];
              if (anchorId) {
                const view = room.session.getGameView(anchorId);
                if (view.public.currentTurnPlayerId) {
                  actorId = view.public.currentTurnPlayerId;
                }
              }
            } catch {
              // keep default actorId
            }
          }
          const result = room.session.handleAction(actorId, action);
          if (result.error) {
            send(ws, { type: "error", payload: { message: result.error } });
            return;
          }
          if (result.stateChanged) {
            broadcastGameViews(room);
          }
          return;
        }
        default: {
          send(ws, { type: "error", payload: { message: "Неизвестное сообщение" } });
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
                `Игрок ${player.name} вышел. Осталось ${formatRemaining(remainingMs)} до исключения.`
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
                `Игрок ${player.name} отсутствует. Осталось ${formatRemaining(remainingMsTick)} до исключения.`
              )
            );
          }, 60000);
          unrefTimer(player.disconnectTicker);
        }
      }
      if (room.phase === "game" && room.hostId === player.playerId && !player.leftBunker) {
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



