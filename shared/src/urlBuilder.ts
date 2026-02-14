export interface UrlPair {
  lan: string;
  public?: string;
}

export const LINK_PATHS = {
  app: "/",
  spectator: "/spectate",
  overlayView: "/overlay",
  overlayAssets: "/overlay-assets",
  overlayControl: "/overlay-control",
  overlayControlState: "/overlay-control/state",
  overlayControlSave: "/overlay-control/save",
  overlayControlAction: "/overlay-control/action",
  apiOverlayLinks: "/api/overlay-links",
} as const;

export interface BuiltLinkSet {
  lanBase: string;
  publicBase?: string;
  appUrl: UrlPair;
  viewerUrl: UrlPair;
  overlayViewUrl: UrlPair;
  overlayDebugUrl: UrlPair;
  overlayControlUrl: UrlPair;
  overlayControlStateUrl: UrlPair;
  controlPanelUrl: UrlPair;
}

export interface BuildLinkSetInput {
  lanBase: string;
  publicBase?: string | null;
  roomCode: string;
  overlayViewToken: string;
  overlayControlToken: string;
}

export function normalizeBase(base: string): string {
  return base.trim().replace(/\/+$/, "");
}

function join(base: string, pathWithQuery: string): string {
  return `${normalizeBase(base)}${pathWithQuery}`;
}

function toBase64UrlUtf8(value: string): string {
  const utf8 = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))
  );

  if (typeof btoa === "function") {
    return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  // Node.js fallback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maybeBuffer = (globalThis as any).Buffer;
  if (typeof maybeBuffer?.from === "function") {
    return maybeBuffer
      .from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  return "";
}

function buildViewerUrlFromOverlay(overlayViewUrl: string): string {
  try {
    const origin = new URL(overlayViewUrl).origin;
    return `${origin}${LINK_PATHS.spectator}#v=${toBase64UrlUtf8(overlayViewUrl)}`;
  } catch {
    return overlayViewUrl;
  }
}

function withPublic(lanValue: string, publicBase: string | undefined, publicPath: string): UrlPair {
  if (!publicBase) return { lan: lanValue };
  return { lan: lanValue, public: join(publicBase, publicPath) };
}

export function buildLinkSet(input: BuildLinkSetInput): BuiltLinkSet {
  const lanBase = normalizeBase(input.lanBase);
  const publicBaseRaw = (input.publicBase ?? "").trim();
  const publicBase = publicBaseRaw.length > 0 ? normalizeBase(publicBaseRaw) : undefined;

  const encodedRoom = encodeURIComponent(input.roomCode);
  const encodedViewToken = encodeURIComponent(input.overlayViewToken);
  const encodedControlToken = encodeURIComponent(input.overlayControlToken);

  const appPath = `${LINK_PATHS.app}?room=${encodedRoom}`;
  const overlayViewPath = `${LINK_PATHS.overlayView}?room=${encodedRoom}&token=${encodedViewToken}`;
  const overlayControlPath = `${LINK_PATHS.overlayControl}?room=${encodedRoom}&token=${encodedControlToken}`;
  const overlayControlStatePath = `${LINK_PATHS.overlayControlState}?room=${encodedRoom}&token=${encodedControlToken}`;

  const appUrl = withPublic(join(lanBase, appPath), publicBase, appPath);
  const overlayViewUrl = withPublic(join(lanBase, overlayViewPath), publicBase, overlayViewPath);
  const overlayDebugUrl = withPublic(
    `${overlayViewUrl.lan}&debug=1`,
    publicBase,
    `${overlayViewPath}&debug=1`
  );
  const overlayControlUrl = withPublic(join(lanBase, overlayControlPath), publicBase, overlayControlPath);
  const overlayControlStateUrl = withPublic(
    join(lanBase, overlayControlStatePath),
    publicBase,
    overlayControlStatePath
  );

  const viewerUrl: UrlPair = {
    lan: buildViewerUrlFromOverlay(overlayViewUrl.lan),
  };
  if (overlayViewUrl.public) {
    viewerUrl.public = buildViewerUrlFromOverlay(overlayViewUrl.public);
  }

  return {
    lanBase,
    publicBase,
    appUrl,
    viewerUrl,
    overlayViewUrl,
    overlayDebugUrl,
    overlayControlUrl,
    overlayControlStateUrl,
    // At the moment control panel is the same page as overlay-control.
    controlPanelUrl: overlayControlUrl,
  };
}
