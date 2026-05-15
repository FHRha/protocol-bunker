import type { GameView, MatchMessage } from "@bunker/shared";
import type { Room } from "../core/types.js";

const MAX_MATCH_MESSAGES = 80;

function createMatchMessageId(room: Room): string {
  return `${room.code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function appendMatchMessage(room: Room, message: Omit<MatchMessage, "id" | "createdAt">): MatchMessage {
  const entry: MatchMessage = {
    id: createMatchMessageId(room),
    createdAt: Date.now(),
    ...message,
  };
  room.matchMessages = [...room.matchMessages, entry].slice(-MAX_MATCH_MESSAGES);
  return entry;
}

export function removeMatchMessage(room: Room, messageId: string): boolean {
  const nextMessages = room.matchMessages.filter((message) => message.id !== messageId);
  if (nextMessages.length === room.matchMessages.length) return false;
  room.matchMessages = nextMessages;
  return true;
}

export function clearMatchMessages(room: Room): void {
  room.matchMessages = [];
  room.lastMatchSystemSignature = undefined;
}

function getPlayerName(view: GameView, playerId?: string | null): string {
  if (!playerId) return "";
  return view.public.players.find((player) => player.playerId === playerId)?.name ?? "";
}

function buildSystemMessage(view: GameView): Pick<MatchMessage, "text" | "textKey" | "textVars"> {
  const turnName = getPlayerName(view, view.public.currentTurnPlayerId);
  if (view.phase === "reveal" && turnName) {
    return {
      text: "",
      textKey: "match.system.revealTurn",
      textVars: { round: view.round, name: turnName },
    };
  }
  if (view.phase === "reveal_discussion" && turnName) {
    return {
      text: "",
      textKey: "match.system.revealDiscussion",
      textVars: { round: view.round, name: turnName },
    };
  }
  if (view.phase === "voting") {
    return {
      text: "",
      textKey: "match.system.voting",
      textVars: { round: view.round },
    };
  }
  if (view.phase === "resolution") {
    return {
      text: "",
      textKey: "match.system.resolution",
      textVars: { round: view.round },
    };
  }
  if (view.phase === "ended") {
    return {
      text: "",
      textKey: "match.system.ended",
    };
  }
  return {
    text: "",
    textKey: "match.system.phase",
    textVars: { round: view.round, phase: view.phase },
  };
}

export function appendSystemMatchMessageForView(room: Room, view: GameView): MatchMessage | null {
  const signature = [
    view.round,
    view.phase,
    view.public.currentTurnPlayerId ?? "",
    view.public.votePhase ?? "",
    view.public.lastEliminated ?? "",
    view.public.winners?.join(",") ?? "",
  ].join(":");
  if (room.lastMatchSystemSignature === signature) return null;
  room.lastMatchSystemSignature = signature;
  return appendMatchMessage(room, {
    kind: "system",
    sourceName: "",
    sourceNameKey: "match.source.system",
    ...buildSystemMessage(view),
  });
}
