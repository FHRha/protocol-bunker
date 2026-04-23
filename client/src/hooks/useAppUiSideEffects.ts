import { useEffect } from "react";
import { setCurrentLocale, type LocaleCode } from "../localization";

type UiStorageKeys = {
  theme: string;
  streamerMode: string;
  showRoomCode: string;
  toastPosition: string;
  uiScale: string;
  reduceMotion: string;
  confirmDangerousActions: string;
  confirmExitGame: string;
  compactMode: string;
  autoCopyRoomCode: string;
  showSpectatorLinks: string;
  showHints: string;
  toastDuration: string;
};

type AppUiSideEffectsInput = {
  keys: UiStorageKeys;
  appTitle: string;
  theme: string;
  streamerMode: boolean;
  showRoomCode: boolean;
  setShowRoomCode: (value: boolean) => void;
  toastPosition: string;
  uiScale: string;
  reduceMotion: boolean;
  confirmDangerousActions: boolean;
  confirmExitGame: boolean;
  toastDuration: string;
  compactMode: boolean;
  autoCopyRoomCode: boolean;
  showSpectatorLinks: boolean;
  showHints: boolean;
  locale: LocaleCode;
};

export function useAppUiSideEffects({
  keys,
  appTitle,
  theme,
  streamerMode,
  showRoomCode,
  setShowRoomCode,
  toastPosition,
  uiScale,
  reduceMotion,
  confirmDangerousActions,
  confirmExitGame,
  toastDuration,
  compactMode,
  autoCopyRoomCode,
  showSpectatorLinks,
  showHints,
  locale,
}: AppUiSideEffectsInput) {
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(keys.theme, theme);
  }, [keys.theme, theme]);

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  useEffect(() => {
    setCurrentLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem(keys.streamerMode, streamerMode ? "1" : "0");
    if (!streamerMode) {
      setShowRoomCode(true);
      return;
    }
    if (localStorage.getItem(keys.showRoomCode) === null) {
      setShowRoomCode(false);
    }
  }, [keys.showRoomCode, keys.streamerMode, setShowRoomCode, streamerMode]);

  useEffect(() => {
    localStorage.setItem(keys.showRoomCode, showRoomCode ? "1" : "0");
  }, [keys.showRoomCode, showRoomCode]);

  useEffect(() => {
    localStorage.setItem(keys.toastPosition, toastPosition);
  }, [keys.toastPosition, toastPosition]);

  useEffect(() => {
    localStorage.setItem(keys.uiScale, uiScale);
    document.documentElement.dataset.uiScale = uiScale;
  }, [keys.uiScale, uiScale]);

  useEffect(() => {
    localStorage.setItem(keys.reduceMotion, reduceMotion ? "1" : "0");
    document.documentElement.dataset.motion = reduceMotion ? "off" : "on";
  }, [keys.reduceMotion, reduceMotion]);

  useEffect(() => {
    localStorage.setItem(keys.confirmDangerousActions, confirmDangerousActions ? "1" : "0");
  }, [confirmDangerousActions, keys.confirmDangerousActions]);

  useEffect(() => {
    localStorage.setItem(keys.confirmExitGame, confirmExitGame ? "1" : "0");
  }, [confirmExitGame, keys.confirmExitGame]);

  useEffect(() => {
    localStorage.setItem(keys.toastDuration, toastDuration);
  }, [keys.toastDuration, toastDuration]);

  useEffect(() => {
    localStorage.setItem(keys.compactMode, compactMode ? "1" : "0");
  }, [compactMode, keys.compactMode]);

  useEffect(() => {
    localStorage.setItem(keys.autoCopyRoomCode, autoCopyRoomCode ? "1" : "0");
  }, [autoCopyRoomCode, keys.autoCopyRoomCode]);

  useEffect(() => {
    localStorage.setItem(keys.showSpectatorLinks, showSpectatorLinks ? "1" : "0");
  }, [keys.showSpectatorLinks, showSpectatorLinks]);

  useEffect(() => {
    localStorage.setItem(keys.showHints, showHints ? "1" : "0");
  }, [keys.showHints, showHints]);
}
