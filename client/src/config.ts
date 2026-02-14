const envWsUrl = import.meta.env.VITE_WS_URL as string | undefined;
const envApiBase = import.meta.env.VITE_API_BASE as string | undefined;
const envAssetBase = import.meta.env.VITE_ASSET_BASE as string | undefined;

const getOrigin = () => {
  if (typeof window === "undefined") return "";
  return window.location.origin;
};

const getDevServerOrigin = () => {
  if (typeof window === "undefined") return "http://localhost:3000";
  const host = window.location.hostname || "localhost";
  return `http://${host}:3000`;
};

const getWsUrl = () => {
  if (envWsUrl) return envWsUrl;
  if (import.meta.env.DEV) {
    if (typeof window === "undefined") return "ws://localhost:3000";
    const host = window.location.hostname || "localhost";
    return `ws://${host}:3000`;
  }
  if (typeof window === "undefined") return "ws://localhost:3000";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
};

export const WS_URL = getWsUrl();
export const API_BASE =
  envApiBase ?? (import.meta.env.DEV ? getDevServerOrigin() : getOrigin() || "http://localhost:3000");
export const ASSET_BASE =
  envAssetBase ??
  (import.meta.env.DEV
    ? `${getDevServerOrigin()}/assets`
    : getOrigin()
      ? `${getOrigin()}/assets`
      : "http://localhost:3000/assets");

export type IdentityMode = "prod" | "dev_tab";

const envMode = import.meta.env.VITE_IDENTITY_MODE as IdentityMode | undefined;
const legacyDevFlag =
  import.meta.env.VITE_DEV_TAB_IDENTITY === "true" ||
  import.meta.env.VITE_DEV_NEW_PLAYER_PER_TAB === "true";

export const IDENTITY_MODE: IdentityMode = envMode === "dev_tab" || envMode === "prod"
  ? envMode
  : legacyDevFlag
    ? "dev_tab"
    : "prod";

export const DEV_TAB_IDENTITY = IDENTITY_MODE === "dev_tab";
