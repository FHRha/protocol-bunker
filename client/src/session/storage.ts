export const SESSION_ID_KEY = "bunker.sessionId";

export function getOrCreateSessionId(useSessionStorage: boolean): string {
  const storage = useSessionStorage ? window.sessionStorage : window.localStorage;
  const existing = storage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const generated =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  storage.setItem(SESSION_ID_KEY, generated);
  return generated;
}
