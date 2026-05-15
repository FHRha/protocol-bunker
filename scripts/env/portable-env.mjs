const AI_ACCESS_KEYS_PATH = {
  win: "..\\..\\data\\ai-access-keys.json",
  linux: "../../data/ai-access-keys.json",
};

const LOG_PATHS = {
  win: ["logs\\server.log", "logs\\port.txt", "logs\\urls.txt", "logs\\last-start.txt"],
  linux: [
    "logs/server-YYYY-MM-DD.log",
    "logs/server.log",
    "logs/port.txt",
    "logs/urls.txt",
    "logs/last-start.txt",
  ],
};

function normalizePlatform(platform) {
  if (platform === "win" || platform === "linux") return platform;
  throw new Error(`Unsupported portable env platform: ${platform}`);
}

function normalizeProfile(profile) {
  if (!profile) return "public";
  if (profile === "public" || profile === "server") return profile;
  throw new Error(`Unsupported portable env profile: ${profile}`);
}

export function buildPortableEnv({ platform, profile = "public" }) {
  const normalizedPlatform = normalizePlatform(platform);
  normalizeProfile(profile);
  const aiAccessKeysPath = AI_ACCESS_KEYS_PATH[normalizedPlatform];

  return `# Protocol: Bunker Portable Configuration
# Edit this file before running start.bat / start.sh.
# Format: KEY=value # short explanation.

# =============================================================================
# 1. Launcher Settings
# =============================================================================

PORT=0 # Server port. Use 0 for automatic free port, or set a fixed port like 56986.
DEV_MODE=0 # 1 enables local testing mode: separate player identity per browser tab.
# MODE=local # Launcher mode: local or domain. If not set, launcher asks on startup.
# DOMAIN=bunker.example.com # Required when MODE=domain.
TRUST_PROXY=auto # auto uses true for domain mode and false for local mode; set true/false to force.

# =============================================================================
# 2. Bot Timing
# =============================================================================

BUNKER_RULE_BOT_MIN_DELAY_MS=2500 # Minimum delay before a regular bot action.
BUNKER_RULE_BOT_MAX_DELAY_MS=6500 # Maximum delay before a regular bot action.
BUNKER_RULE_BOT_DISCUSSION_MIN_DELAY_MS=10000 # Minimum pause after bot reveals a card before passing turn.
BUNKER_RULE_BOT_DISCUSSION_MAX_DELAY_MS=20000 # Maximum pause after bot reveals a card before passing turn.

# =============================================================================
# 3. AI Bots
# =============================================================================

BUNKER_AI_ACCESS_KEYS_FILE=${aiAccessKeysPath} # Path to client AI access keys.
BUNKER_AI_GATEWAY_BASE_URL= # OpenAI-compatible gateway base URL, e.g. https://api.openai.com/v1.
BUNKER_AI_GATEWAY_API_KEY= # Server-side gateway API key. Not the client pbai_* key.
BUNKER_AI_GATEWAY_MODEL= # Gateway model id, e.g. gpt-4o-mini.
BUNKER_AI_GATEWAY_TIMEOUT_MS=45000 # AI response timeout in milliseconds.

# =============================================================================
# 4. Public Links
# =============================================================================

# PUBLIC_HOST=203.0.113.10 # Public IP/host for generated invite links.
# PUBLIC_ORIGIN=https://bunker.example.com # Full public origin override.
# BUNKER_PORTABLE_NO_BROWSER=1 # Do not open browser automatically on startup.

# =============================================================================
# 5. Security / Limits
# =============================================================================

# BUNKER_ENFORCE_ORIGIN_CHECKS=1 # Force browser Origin validation.
# BUNKER_ALLOWED_ORIGINS=https://admin.example.com,https://overlay.example.com # Extra allowed origins.
# BUNKER_SENSITIVE_HTTP_RATE_LIMIT=1 # Enable rate limiting for sensitive HTTP routes.
# BUNKER_SENSITIVE_HTTP_RATE_LIMIT_MAX=120 # Max sensitive requests per window.
# BUNKER_SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS=60000 # Rate limit window in milliseconds.

# =============================================================================
# 6. Logs
# =============================================================================

LOG_RETENTION_DAYS=14 # Days to keep daily logs; 0 disables cleanup.

# =============================================================================
# 7. Examples
# =============================================================================

# Fixed local port:
# PORT=56986

# Local test with multiple players in one browser:
# DEV_MODE=1

# Domain mode:
# MODE=domain
# DOMAIN=bunker.example.com
# PORT=56986
# TRUST_PROXY=true
`;
}

export function buildPortableReadme({ platform, profile = "public" }) {
  const normalizedPlatform = normalizePlatform(platform);
  const normalizedProfile = normalizeProfile(profile);
  const isWin = normalizedPlatform === "win";
  const isServer = normalizedProfile === "server";
  const title =
    normalizedPlatform === "win"
      ? "Protocol Bunker Portable (Windows)"
      : `Protocol Bunker Portable (Linux ${isServer ? "Server" : "Public"})`;
  const startScript = isWin ? "start.bat" : "./start.sh";
  const chmodStep = isWin ? "" : "1. chmod +x start.sh\n";
  const startIndex = isWin ? 1 : 2;
  const logs = LOG_PATHS[normalizedPlatform].map((entry) => `- ${entry}`).join("\n");
  const profileNote = isWin
    ? ""
    : isServer
      ? "\nProfile:\n- Server profile hides LAN/localhost links in launcher output.\n"
      : "\nProfile:\n- Public profile prints both public and local links.\n";

  return `${title}
${"=".repeat(title.length)}

Start:
${chmodStep}${startIndex}. Run ${startScript}
${startIndex + 1}. Wait for startup lines in the console
${startIndex + 2}. Browser opens automatically unless BUNKER_PORTABLE_NO_BROWSER=1

Configuration:
- Edit portable.env before startup.
- PORT=0 uses an automatic free port; set PORT=56986 or another fixed port if needed.
- DEV_MODE=1 enables separate player identity per browser tab for local testing.
- MODE can be local or domain. If MODE is not set, the launcher asks on startup.
- DOMAIN is required for MODE=domain.
- TRUST_PROXY=auto follows MODE; set true/false only when you need to force it.
- PUBLIC_HOST or PUBLIC_ORIGIN can override generated invite links.
- BUNKER_AI_* settings enable AI bots.
- LOG_RETENTION_DAYS controls daily log cleanup; 0 disables cleanup.

Security / limits:
- BUNKER_ENFORCE_ORIGIN_CHECKS=1 forces browser Origin validation.
- BUNKER_ALLOWED_ORIGINS adds extra allowed browser origins; same-origin is always allowed.
- BUNKER_SENSITIVE_HTTP_RATE_LIMIT_* tunes sensitive HTTP route rate limiting.

Logs:
${logs}

Router port forwarding:
- Use the actual port from logs/port.txt.
- Forward that TCP port to this machine in your router settings.
${profileNote}`;
}
