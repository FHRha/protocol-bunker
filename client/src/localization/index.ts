import type { LocaleCode, UiDictionary } from "./localeTypes";

export type { LocaleCode, UiDictionary } from "./localeTypes";
export {
  UI_LOCALE_NAMESPACES,
  clearUiLocaleNamespaceCache,
  getLoadedUiLocaleNamespace,
  isUiLocaleNamespaceLoaded,
  loadUiLocaleNamespace,
  loadUiLocaleNamespaces,
  type UiLocaleNamespace,
  type UiLocaleNamespaceJson,
} from "./uiLocaleNamespaceLoader";
export {
  areUiLocaleNamespacesReady,
  createUiLocaleNamespaceTranslator,
  ensureUiLocaleNamespaces,
  formatTemplate,
  type UiLocaleNamespaceOptions,
  type UiLocaleNamespaceTranslator,
  type UiTranslatorVars,
} from "./uiLocaleNamespaceRuntime";
export { useUiLocaleNamespace, type UseUiLocaleNamespaceOptions, type UseUiLocaleNamespaceResult } from "./useUiLocaleNamespace";
export { useUiLocaleNamespacesActivation, type UseUiLocaleNamespacesActivationResult } from "./useUiLocaleNamespacesActivation";
export { activateUiLocaleNamespaces, deactivateUiLocaleNamespaces, getActiveUiLocaleNamespaces } from "./uiLocaleActiveNamespaces";

const LOCALE_STORAGE_KEY = "bunker.locale";
const DEFAULT_LOCALE: LocaleCode = "ru";

let currentLocale: LocaleCode = DEFAULT_LOCALE;
if (typeof window !== "undefined") {
  const stored = String(window.localStorage.getItem(LOCALE_STORAGE_KEY) ?? "").toLowerCase();
  if (stored === "en" || stored === "ru") {
    currentLocale = stored;
  }
}

const listeners = new Set<(locale: LocaleCode) => void>();

export const getCurrentLocale = (): LocaleCode => currentLocale;

export const setCurrentLocale = (locale: LocaleCode): void => {
  const next: LocaleCode = locale === "en" ? "en" : "ru";
  currentLocale = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }
  for (const listener of listeners) {
    listener(next);
  }
};

export const subscribeLocale = (listener: (locale: LocaleCode) => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
