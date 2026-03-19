import type { LocaleCode } from "./localeTypes";

export const UI_LOCALE_NAMESPACES = [
  "app",
  "common",
  "dev",
  "format",
  "game",
  "home",
  "host-menu",
  "lobby",
  "maps",
  "misc",
  "overlay-links",
  "reconnect",
  "room-settings",
  "rules",
  "special",
  "voting",
  "world",
] as const;

export type UiLocaleNamespace = (typeof UI_LOCALE_NAMESPACES)[number];
export type UiLocaleNamespaceJson = Record<string, unknown>;

type UiLocaleNamespaceImporter = () => Promise<{ default: UiLocaleNamespaceJson }>;
type NamespaceImportMap = Record<LocaleCode, Record<UiLocaleNamespace, UiLocaleNamespaceImporter>>;

const IMPORTERS: NamespaceImportMap = {
  ru: {
    app: () => import("../../../locales/ui/app/ru.json"),
    common: () => import("../../../locales/ui/common/ru.json"),
    dev: () => import("../../../locales/ui/dev/ru.json"),
    format: () => import("../../../locales/ui/format/ru.json"),
    game: () => import("../../../locales/ui/game/ru.json"),
    home: () => import("../../../locales/ui/home/ru.json"),
    "host-menu": () => import("../../../locales/ui/host-menu/ru.json"),
    lobby: () => import("../../../locales/ui/lobby/ru.json"),
    maps: () => import("../../../locales/ui/maps/ru.json"),
    misc: () => import("../../../locales/ui/misc/ru.json"),
    "overlay-links": () => import("../../../locales/ui/overlay-links/ru.json"),
    reconnect: () => import("../../../locales/ui/reconnect/ru.json"),
    "room-settings": () => import("../../../locales/ui/room-settings/ru.json"),
    rules: () => import("../../../locales/ui/rules/ru.json"),
    special: () => import("../../../locales/ui/special/ru.json"),
    voting: () => import("../../../locales/ui/voting/ru.json"),
    world: () => import("../../../locales/ui/world/ru.json"),
  },
  en: {
    app: () => import("../../../locales/ui/app/en.json"),
    common: () => import("../../../locales/ui/common/en.json"),
    dev: () => import("../../../locales/ui/dev/en.json"),
    format: () => import("../../../locales/ui/format/en.json"),
    game: () => import("../../../locales/ui/game/en.json"),
    home: () => import("../../../locales/ui/home/en.json"),
    "host-menu": () => import("../../../locales/ui/host-menu/en.json"),
    lobby: () => import("../../../locales/ui/lobby/en.json"),
    maps: () => import("../../../locales/ui/maps/en.json"),
    misc: () => import("../../../locales/ui/misc/en.json"),
    "overlay-links": () => import("../../../locales/ui/overlay-links/en.json"),
    reconnect: () => import("../../../locales/ui/reconnect/en.json"),
    "room-settings": () => import("../../../locales/ui/room-settings/en.json"),
    rules: () => import("../../../locales/ui/rules/en.json"),
    special: () => import("../../../locales/ui/special/en.json"),
    voting: () => import("../../../locales/ui/voting/en.json"),
    world: () => import("../../../locales/ui/world/en.json"),
  },
};

const cache = new Map<string, UiLocaleNamespaceJson>();
const pending = new Map<string, Promise<UiLocaleNamespaceJson>>();

const cacheKey = (locale: LocaleCode, namespace: UiLocaleNamespace): string => `${locale}:${namespace}`;

export const clearUiLocaleNamespaceCache = (): void => {
  cache.clear();
  pending.clear();
};

export const isUiLocaleNamespaceLoaded = (locale: LocaleCode, namespace: UiLocaleNamespace): boolean =>
  cache.has(cacheKey(locale, namespace));

export const getLoadedUiLocaleNamespace = (
  locale: LocaleCode,
  namespace: UiLocaleNamespace,
): UiLocaleNamespaceJson | null => cache.get(cacheKey(locale, namespace)) ?? null;

export async function loadUiLocaleNamespace(
  locale: LocaleCode,
  namespace: UiLocaleNamespace,
): Promise<UiLocaleNamespaceJson> {
  const key = cacheKey(locale, namespace);
  const existing = cache.get(key);
  if (existing) return existing;

  const inflight = pending.get(key);
  if (inflight) return inflight;

  const importer = IMPORTERS[locale]?.[namespace];
  if (!importer) {
    throw new Error(`[ui-locale] Unknown namespace: ${locale}/${namespace}`);
  }

  const task = importer()
    .then((mod) => {
      const dict = (mod.default ?? {}) as UiLocaleNamespaceJson;
      cache.set(key, dict);
      pending.delete(key);
      return dict;
    })
    .catch((error) => {
      pending.delete(key);
      throw error;
    });

  pending.set(key, task);
  return task;
}

export async function loadUiLocaleNamespaces(
  locale: LocaleCode,
  namespaces: readonly UiLocaleNamespace[],
): Promise<Record<UiLocaleNamespace, UiLocaleNamespaceJson>> {
  const unique = [...new Set(namespaces)] as UiLocaleNamespace[];
  const pairs = await Promise.all(unique.map(async (ns) => [ns, await loadUiLocaleNamespace(locale, ns)] as const));
  return Object.fromEntries(pairs) as Record<UiLocaleNamespace, UiLocaleNamespaceJson>;
}
