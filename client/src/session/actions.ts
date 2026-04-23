import type { GameSettings } from "@bunker/shared";
import { IDENTITY_MODE } from "../config";
import type { BunkerClient } from "../wsClient";
import type { RulesUpdatePayload } from "./types";

type SessionActionDeps = {
  client: BunkerClient;
  clearAppErrors: () => void;
  ensureWsInteractive: () => boolean;
};

export function createSessionActions({ client, clearAppErrors, ensureWsInteractive }: SessionActionDeps) {
  const sendInteractive = (send: () => void) => {
    if (!ensureWsInteractive()) return false;
    clearAppErrors();
    send();
    return true;
  };

  return {
    start: () => sendInteractive(() => client.send({ type: "startGame", payload: {} })),
    revealCard: (cardId: string) =>
      sendInteractive(() => client.send({ type: "revealCard", payload: { cardId } })),
    vote: (targetPlayerId: string) =>
      sendInteractive(() => client.send({ type: "vote", payload: { targetPlayerId } })),
    applySpecial: (specialInstanceId: string, payload?: Record<string, unknown>) =>
      sendInteractive(() => client.send({ type: "applySpecial", payload: { specialInstanceId, payload } })),
    finalizeVoting: () => sendInteractive(() => client.send({ type: "finalizeVoting", payload: {} })),
    continueRound: () => sendInteractive(() => client.send({ type: "continueRound", payload: {} })),
    revealWorldThreat: (index: number) =>
      sendInteractive(() => client.send({ type: "revealWorldThreat", payload: { index } })),
    setBunkerOutcome: (outcome: "survived" | "failed") =>
      sendInteractive(() => {
        if (IDENTITY_MODE !== "prod") {
          console.log("[dev] setBunkerOutcome", outcome);
        }
        client.send({ type: "setBunkerOutcome", payload: { outcome } });
      }),
    devSkipRound: () => sendInteractive(() => client.send({ type: "devSkipRound", payload: {} })),
    devKickPlayer: (targetPlayerId: string) =>
      sendInteractive(() => client.send({ type: "devKickPlayer", payload: { targetPlayerId } })),
    updateSettings: (settings: GameSettings) =>
      sendInteractive(() => client.send({ type: "updateSettings", payload: settings })),
    updateRules: (payload: RulesUpdatePayload) =>
      sendInteractive(() => client.send({ type: "updateRules", payload })),
    kickFromLobby: (targetPlayerId: string) =>
      sendInteractive(() => client.send({ type: "kickFromLobby", payload: { targetPlayerId } })),
    requestHostTransfer: (targetPlayerId?: string) =>
      sendInteractive(() => {
        const normalizedTargetId = String(targetPlayerId ?? "").trim();
        client.send({
          type: "requestHostTransfer",
          payload: normalizedTargetId ? { targetPlayerId: normalizedTargetId } : {},
        });
      }),
    devAddPlayer: (name?: string) =>
      sendInteractive(() => client.send({ type: "devAddPlayer", payload: { name } })),
    devRemovePlayer: (targetPlayerId?: string) =>
      sendInteractive(() => client.send({ type: "devRemovePlayer", payload: { targetPlayerId } })),
  };
}
