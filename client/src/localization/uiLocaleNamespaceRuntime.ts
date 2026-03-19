import type { LocaleCode } from "./localeTypes";
import {
  getLoadedUiLocaleNamespace,
  isUiLocaleNamespaceLoaded,
  loadUiLocaleNamespaces,
  type UiLocaleNamespace,
} from "./uiLocaleNamespaceLoader";

export type UiTranslatorVars = Record<string, unknown>;

export type UiLocaleNamespaceOptions = {
  locale: LocaleCode;
  primary: UiLocaleNamespace;
  fallbacks?: readonly UiLocaleNamespace[];
};

const MISSING_PREFIX = "[missing:";

export const formatTemplate = (template: string, vars?: UiTranslatorVars): string => {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, key: string) => {
    const value = vars[key];
    return typeof value === "undefined" ? `{${key}}` : String(value);
  });
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const getNestedValue = (source: Record<string, unknown>, path: string): unknown => {
  if (path in source) return source[path];
  const segments = path.split(".").filter(Boolean);
  if (segments.length <= 1) return source[path];

  let current: unknown = source;
  for (const segment of segments) {
    const record = asRecord(current);
    if (!record || !(segment in record)) return undefined;
    current = record[segment];
  }
  return current;
};

const lookupLoadedValue = (
  locale: LocaleCode,
  namespaces: readonly UiLocaleNamespace[],
  key: string,
): unknown => {
  for (const namespace of namespaces) {
    const loaded = getLoadedUiLocaleNamespace(locale, namespace);
    if (!loaded) continue;
    const value = getNestedValue(loaded, key);
    if (typeof value !== "undefined") return value;
  }
  return undefined;
};

export const areUiLocaleNamespacesReady = (
  locale: LocaleCode,
  namespaces: readonly UiLocaleNamespace[],
): boolean => namespaces.every((ns) => isUiLocaleNamespaceLoaded(locale, ns));

export const ensureUiLocaleNamespaces = async (
  locale: LocaleCode,
  namespaces: readonly UiLocaleNamespace[],
): Promise<void> => {
  await loadUiLocaleNamespaces(locale, namespaces);
};

export const createUiLocaleNamespaceTranslator = (options: UiLocaleNamespaceOptions) => {
  const namespaces = [options.primary, ...(options.fallbacks ?? [])] as UiLocaleNamespace[];

  const getRaw = (key: string): unknown => lookupLoadedValue(options.locale, namespaces, key);

  const t = (key: string, vars?: UiTranslatorVars): string => {
    const raw = getRaw(key);
    if (typeof raw === "string") return formatTemplate(raw, vars);
    if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
    if (typeof raw === "undefined") return `${MISSING_PREFIX}${options.primary}.${key}]`;
    return JSON.stringify(raw);
  };

  const getObject = <T extends Record<string, unknown> = Record<string, unknown>>(key: string): T | null => {
    const raw = getRaw(key);
    const record = asRecord(raw);
    return record as T | null;
  };

  const has = (key: string): boolean => typeof getRaw(key) !== "undefined";

  return {
    t,
    has,
    getRaw,
    getObject,
    namespaces,
  };
};

export type UiLocaleNamespaceTranslator = ReturnType<typeof createUiLocaleNamespaceTranslator>;
