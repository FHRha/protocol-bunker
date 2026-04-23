import type { ManualRulesConfig } from "@bunker/shared";
import type { LocaleCode } from "../localization";

export type RulesUpdatePayload = {
  mode: "auto" | "manual";
  presetPlayerCount?: number;
  manualConfig?: ManualRulesConfig;
};

export type SessionIntent =
  | { mode: "create"; name: string; scenarioId: string; locale: LocaleCode; tabId?: string }
  | { mode: "join"; name: string; roomCode: string; playerToken?: string; tabId?: string }
  | { mode: "reconnect"; name: string; roomCode: string; playerToken?: string; tabId?: string };
