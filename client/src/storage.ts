export const tokenKey = (roomCode: string) => `bunker.playerToken.${roomCode}`;

function normalizeStoredToken(value: string | null): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function readPlayerToken(roomCode: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const key = tokenKey(roomCode);

  const fromSession = normalizeStoredToken(window.sessionStorage.getItem(key));
  if (fromSession) {
    return fromSession;
  }

  const fromLegacyLocal = normalizeStoredToken(window.localStorage.getItem(key));
  if (!fromLegacyLocal) {
    return undefined;
  }

  try {
    window.sessionStorage.setItem(key, fromLegacyLocal);
  } catch {
    // ignore storage write errors
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore cleanup errors
  }
  return fromLegacyLocal;
}

export function writePlayerToken(roomCode: string, token: string): void {
  if (typeof window === "undefined") return;
  const normalizedToken = String(token ?? "").trim();
  if (!normalizedToken) return;
  const key = tokenKey(roomCode);
  try {
    window.sessionStorage.setItem(key, normalizedToken);
  } catch {
    // ignore storage write errors
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore cleanup errors
  }
}

export function clearPlayerToken(roomCode: string): void {
  if (typeof window === "undefined") return;
  const key = tokenKey(roomCode);
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage cleanup errors
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage cleanup errors
  }
}

const TAB_ID_KEY = "bunker.dev_tab_id";
const TAB_INSTANCE_KEY = "bunker.dev_tab_instance";
const TAB_CHANNEL = "bunker-dev-tab";
const TAB_CLAIM_PREFIX = "bunker.dev_tab_claim.";

const fallbackTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const generateId = () =>
  typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : fallbackTabId();

let tabChannel: BroadcastChannel | null = null;
let channelTabId: string | null = null;
let channelInstanceId: string | null = null;

function getTabClaimKey(tabId: string): string {
  return `${TAB_CLAIM_PREFIX}${tabId}`;
}

function readClaimInstance(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { instanceId?: string } | null;
    return typeof parsed?.instanceId === "string" ? parsed.instanceId : null;
  } catch {
    return null;
  }
}

function claimTabId(tabId: string, instanceId: string): boolean {
  try {
    const key = getTabClaimKey(tabId);
    const existingInstanceId = readClaimInstance(window.localStorage.getItem(key));
    if (existingInstanceId && existingInstanceId !== instanceId) {
      return false;
    }
    window.localStorage.setItem(key, JSON.stringify({ instanceId, updatedAt: Date.now() }));
    const verifyInstanceId = readClaimInstance(window.localStorage.getItem(key));
    return verifyInstanceId === instanceId;
  } catch {
    // Storage may be blocked; fallback to optimistic behavior.
    return true;
  }
}

function releaseTabIdClaim(tabId: string | null, instanceId: string | null): void {
  if (!tabId || !instanceId) return;
  try {
    const key = getTabClaimKey(tabId);
    const existingInstanceId = readClaimInstance(window.localStorage.getItem(key));
    if (existingInstanceId === instanceId) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore release failures
  }
}

const ensureChannel = (tabId: string, instanceId: string) => {
  if (!("BroadcastChannel" in window)) return;
  if (tabChannel) {
    channelTabId = tabId;
    channelInstanceId = instanceId;
    return;
  }
  channelTabId = tabId;
  channelInstanceId = instanceId;
  tabChannel = new BroadcastChannel(TAB_CHANNEL);
  tabChannel.onmessage = (event) => {
    const data = event.data as { type?: string; tabId?: string; instanceId?: string } | null;
    if (!data || !data.type) return;
    if (data.type === "who") {
      tabChannel?.postMessage({ type: "claim", tabId: channelTabId, instanceId: channelInstanceId });
      return;
    }
    if (data.type === "claim" && data.tabId === channelTabId && data.instanceId !== channelInstanceId) {
      return;
    }
  };
  window.addEventListener("beforeunload", () => {
    releaseTabIdClaim(channelTabId, channelInstanceId);
    tabChannel?.close();
    tabChannel = null;
  });
};

const getOrCreateTabId = (): string => {
  const existing = window.sessionStorage.getItem(TAB_ID_KEY);
  if (existing) return existing;
  const generated = generateId();
  window.sessionStorage.setItem(TAB_ID_KEY, generated);
  return generated;
};

export const initTabIdentity = async (): Promise<string | undefined> => {
  if (typeof window === "undefined") return undefined;
  try {
    const instanceId = generateId();
    window.sessionStorage.setItem(TAB_INSTANCE_KEY, instanceId);

    let tabId = getOrCreateTabId();
    if (!claimTabId(tabId, instanceId)) {
      let attempts = 0;
      do {
        tabId = generateId();
        attempts += 1;
      } while (!claimTabId(tabId, instanceId) && attempts < 8);
      window.sessionStorage.setItem(TAB_ID_KEY, tabId);
    }
    ensureChannel(tabId, instanceId);

    let conflict = false;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tabId?: string; instanceId?: string } | null;
      if (!data || !data.type) return;
      if (data.type === "claim" && data.tabId === tabId && data.instanceId !== instanceId) {
        conflict = true;
      }
    };

    tabChannel?.addEventListener("message", onMessage);
    tabChannel?.postMessage({ type: "who" });
    tabChannel?.postMessage({ type: "claim", tabId, instanceId });

    if (!tabChannel) {
      return tabId;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));

    if (conflict) {
      releaseTabIdClaim(tabId, instanceId);
      tabId = generateId();
      window.sessionStorage.setItem(TAB_ID_KEY, tabId);
      claimTabId(tabId, instanceId);
      channelTabId = tabId;
      tabChannel?.postMessage({ type: "claim", tabId, instanceId });
    }

    tabChannel?.removeEventListener("message", onMessage);
    return tabId;
  } catch {
    return fallbackTabId();
  }
};
