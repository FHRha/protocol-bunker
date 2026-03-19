import { useUiLocaleNamespace } from "./useUiLocaleNamespace";

export function ExampleLobbyHeader() {
  const commonLocale = useUiLocaleNamespace("common");
  const lobbyLocale = useUiLocaleNamespace("lobby", {
    fallbacks: ["common", "format", "maps"],
  });

  if (!lobbyLocale.ready) {
    return <div>{commonLocale.t("loading", undefined) || "..."}</div>;
  }

  return (
    <section>
      <h2>{lobbyLocale.t("playersTitle")}</h2>
      <button>{commonLocale.t("copyButton")}</button>
    </section>
  );
}
