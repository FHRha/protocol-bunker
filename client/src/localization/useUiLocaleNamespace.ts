import { useEffect, useMemo, useState } from "react";
import { getCurrentLocale, subscribeLocale } from "./index";
import type { LocaleCode } from "./localeTypes";
import type { UiLocaleNamespace } from "./uiLocaleNamespaceLoader";
import {
  areUiLocaleNamespacesReady,
  createUiLocaleNamespaceTranslator,
  ensureUiLocaleNamespaces,
  type UiLocaleNamespaceTranslator,
} from "./uiLocaleNamespaceRuntime";

export type UseUiLocaleNamespaceOptions = {
  fallbacks?: readonly UiLocaleNamespace[];
  eager?: boolean;
};

export type UseUiLocaleNamespaceResult = UiLocaleNamespaceTranslator & {
  locale: LocaleCode;
  ready: boolean;
  reload: () => Promise<void>;
};

export function useUiLocaleNamespace(
  primary: UiLocaleNamespace,
  options: UseUiLocaleNamespaceOptions = {},
): UseUiLocaleNamespaceResult {
  const [locale, setLocale] = useState<LocaleCode>(getCurrentLocale());
  const namespaces = useMemo(
    () => [primary, ...(options.fallbacks ?? [])] as UiLocaleNamespace[],
    [primary, options.fallbacks],
  );
  const [ready, setReady] = useState<boolean>(
    areUiLocaleNamespacesReady(locale, namespaces),
  );

  useEffect(() => subscribeLocale(setLocale), []);

  useEffect(() => {
    let cancelled = false;
    if (options.eager === false && areUiLocaleNamespacesReady(locale, namespaces)) {
      setReady(true);
      return;
    }
    setReady(areUiLocaleNamespacesReady(locale, namespaces));
    void ensureUiLocaleNamespaces(locale, namespaces).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [locale, namespaces, options.eager]);

  const translator = useMemo(
    () =>
      createUiLocaleNamespaceTranslator({
        locale,
        primary,
        fallbacks: options.fallbacks,
      }),
    [locale, primary, options.fallbacks],
  );

  return {
    locale,
    ready,
    reload: () => ensureUiLocaleNamespaces(locale, namespaces),
    ...translator,
  };
}
