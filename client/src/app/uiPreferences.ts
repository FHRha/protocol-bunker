export const UI_STORAGE_KEYS = {
  theme: "bunker.theme",
  streamerMode: "bunker.streamerMode",
  showRoomCode: "bunker.showRoomCode",
  toastPosition: "bunker.toastPosition",
  uiScale: "bunker.uiScale",
  reduceMotion: "bunker.reduceMotion",
  confirmDangerousActions: "bunker.confirmDangerousActions",
  confirmExitGame: "bunker.confirmExitGame",
  compactMode: "bunker.compactMode",
  autoCopyRoomCode: "bunker.autoCopyRoomCode",
  showSpectatorLinks: "bunker.showSpectatorLinks",
  showHints: "bunker.showHints",
  toastDuration: "bunker.toastDurationMs",
} as const;

export type ThemeMode =
  | "dark-mint"
  | "light-paper"
  | "cyber-amber"
  | "steel-blue"
  | "crimson-night";

export type ToastPosition = "top-right" | "top-left" | "bottom-right" | "bottom-left";
export type UiScale = "90" | "100" | "110";
export type ToastDuration = "3000" | "4000" | "6000";

export function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "dark-mint";
  const stored = localStorage.getItem(UI_STORAGE_KEYS.theme);
  if (
    stored === "dark-mint" ||
    stored === "light-paper" ||
    stored === "cyber-amber" ||
    stored === "steel-blue" ||
    stored === "crimson-night"
  ) {
    return stored;
  }
  if (stored === "dark") return "dark-mint";
  if (stored === "light") return "light-paper";
  return "dark-mint";
}

export function getInitialStreamerMode(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(UI_STORAGE_KEYS.streamerMode) !== "0";
}

export function getInitialShowRoomCode(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(UI_STORAGE_KEYS.showRoomCode);
  if (stored === "1") return true;
  if (stored === "0") return false;
  return localStorage.getItem(UI_STORAGE_KEYS.streamerMode) === "0";
}

export function getInitialToastPosition(): ToastPosition {
  if (typeof window === "undefined") return "top-right";
  const stored = localStorage.getItem(UI_STORAGE_KEYS.toastPosition);
  if (
    stored === "top-right" ||
    stored === "top-left" ||
    stored === "bottom-right" ||
    stored === "bottom-left"
  ) {
    return stored;
  }
  return "top-right";
}

export function getInitialUiScale(): UiScale {
  if (typeof window === "undefined") return "100";
  const stored = localStorage.getItem(UI_STORAGE_KEYS.uiScale);
  if (stored === "90" || stored === "100" || stored === "110") {
    return stored;
  }
  return "100";
}

export function getInitialReduceMotion(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(UI_STORAGE_KEYS.reduceMotion) === "1";
}

export function getInitialConfirmDangerousActions(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(UI_STORAGE_KEYS.confirmDangerousActions) !== "0";
}

export function getInitialConfirmExitGame(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(UI_STORAGE_KEYS.confirmExitGame) !== "0";
}

export function getInitialToastDuration(): ToastDuration {
  if (typeof window === "undefined") return "4000";
  const stored = localStorage.getItem(UI_STORAGE_KEYS.toastDuration);
  if (stored === "3000" || stored === "4000" || stored === "6000") return stored;
  return "4000";
}

export function getInitialCompactMode(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(UI_STORAGE_KEYS.compactMode);
  if (stored === "0") return false;
  return true;
}

export function getInitialAutoCopyRoomCode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(UI_STORAGE_KEYS.autoCopyRoomCode) === "1";
}

export function getInitialShowSpectatorLinks(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(UI_STORAGE_KEYS.showSpectatorLinks) !== "0";
}

export function getInitialShowHints(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(UI_STORAGE_KEYS.showHints) !== "0";
}
