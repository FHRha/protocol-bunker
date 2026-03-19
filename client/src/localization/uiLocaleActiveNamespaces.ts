import type { UiLocaleNamespace } from "./uiLocaleNamespaceLoader";

const activeCounts = new Map<UiLocaleNamespace, number>();
const activeOrder: UiLocaleNamespace[] = [];

export const activateUiLocaleNamespaces = (namespaces: readonly UiLocaleNamespace[]): void => {
  for (const namespace of namespaces) {
    const current = activeCounts.get(namespace) ?? 0;
    activeCounts.set(namespace, current + 1);
    if (current === 0) {
      activeOrder.push(namespace);
    }
  }
};

export const deactivateUiLocaleNamespaces = (namespaces: readonly UiLocaleNamespace[]): void => {
  for (const namespace of namespaces) {
    const current = activeCounts.get(namespace) ?? 0;
    if (current <= 1) {
      activeCounts.delete(namespace);
      const index = activeOrder.indexOf(namespace);
      if (index >= 0) activeOrder.splice(index, 1);
    } else {
      activeCounts.set(namespace, current - 1);
    }
  }
};

export const getActiveUiLocaleNamespaces = (): UiLocaleNamespace[] => [...activeOrder];
