import type { ClientHelloPayload } from "@bunker/shared";
import type { LocaleCode } from "../localization";
import type { SessionIntent } from "./types";

type BuildHelloPayloadOptions = {
  intent: SessionIntent;
  locale: LocaleCode;
  sessionId?: string;
};

type BuildResumePayloadOptions = {
  roomCode?: string | null;
  sessionId?: string | null;
};

export function buildHelloPayload({
  intent,
  locale,
  sessionId,
}: BuildHelloPayloadOptions): ClientHelloPayload {
  if (intent.mode === "create") {
    return {
      name: intent.name,
      create: true,
      scenarioId: intent.scenarioId,
      locale: intent.locale,
      tabId: intent.tabId,
      sessionId,
    };
  }

  return {
    name: intent.name,
    roomCode: intent.roomCode,
    playerToken: intent.playerToken,
    tabId: intent.tabId,
    sessionId,
    locale,
  };
}

export function buildResumePayload({ roomCode, sessionId }: BuildResumePayloadOptions) {
  if (!roomCode || !sessionId) return null;
  return {
    roomCode: roomCode.toUpperCase(),
    sessionId,
  };
}
