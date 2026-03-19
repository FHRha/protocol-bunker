import { useEffect, useMemo, useState } from "react";
import { getCurrentLocale, subscribeLocale } from "./index";
import type { LocaleCode } from "./localeTypes";
import type { UiLocaleNamespace } from "./uiLocaleNamespaceLoader";
import { activateUiLocaleNamespaces, deactivateUiLocaleNamespaces } from "./uiLocaleActiveNamespaces";
import { areUiLocaleNamespacesReady, ensureUiLocaleNamespaces } from "./uiLocaleNamespaceRuntime";

export type UseUiLocaleNamespacesActivationResult = {
  locale: LocaleCode;
  ready: boolean;
  reload: () => Promise<void>;
};

export function useUiLocaleNamespacesActivation(
  namespaces: readonly UiLocaleNamespace[],
): UseUiLocaleNamespacesActivationResult {
  const [locale, setLocale] = useState<LocaleCode>(getCurrentLocale());
  const stableNamespaces = useMemo(() => [...new Set(namespaces)] as UiLocaleNamespace[], [namespaces]);
  const [ready, setReady] = useState<boolean>(areUiLocaleNamespacesReady(locale, stableNamespaces));

  useEffect(() => subscribeLocale(setLocale), []);

  useEffect(() => {
    let cancelled = false;
    activateUiLocaleNamespaces(stableNamespaces);
    setReady(areUiLocaleNamespacesReady(locale, stableNamespaces));
    void ensureUiLocaleNamespaces(locale, stableNamespaces).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      deactivateUiLocaleNamespaces(stableNamespaces);
    };
  }, [locale, stableNamespaces]);

  return {
    locale,
    ready,
    reload: () => ensureUiLocaleNamespaces(locale, stableNamespaces),
  };
}
