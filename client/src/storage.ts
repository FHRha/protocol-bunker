export const tokenKey = (roomCode: string) => `bunker.playerToken.${roomCode}`;

const TAB_ID_KEY = "bunker.dev_tab_id";
const TAB_INSTANCE_KEY = "bunker.dev_tab_instance";
const TAB_CHANNEL = "bunker-dev-tab";

const fallbackTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const generateId = () =>
  typeof window.crypto?.randomUUID === "function" ? window.crypto.randomUUID() : fallbackTabId();

let tabChannel: BroadcastChannel | null = null;
let channelTabId: string | null = null;
let channelInstanceId: string | null = null;

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
      tabId = generateId();
      window.sessionStorage.setItem(TAB_ID_KEY, tabId);
      channelTabId = tabId;
      tabChannel?.postMessage({ type: "claim", tabId, instanceId });
    }

    tabChannel?.removeEventListener("message", onMessage);
    return tabId;
  } catch {
    return fallbackTabId();
  }
};
