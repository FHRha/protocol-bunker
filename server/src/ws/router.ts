import type { ClientMessage, ServerMessage } from "@bunker/shared";
import type { WebSocket } from "ws";
import { handleGameActionMessage, type GameActionDeps } from "../actions/game.js";
import {
  handleKickFromLobbyMessage,
  handleRequestHostTransferMessage,
  handleStartGameMessage,
  handleUpdateLocaleMessage,
  handleUpdateRulesMessage,
  handleUpdateSettingsMessage,
  type LobbyActionDeps,
} from "../actions/lobby.js";
import {
  handleHelloMessage,
  handleOverlaySubscribeMessage,
  handleResumeMessage,
  type SessionHandlerDeps,
} from "./handlers/session.js";

export interface ClientMessageRouterDeps {
  session: SessionHandlerDeps;
  lobby: LobbyActionDeps;
  game: GameActionDeps;
  send: (ws: WebSocket, message: ServerMessage) => void;
  sendLocalizedError: (
    ws: WebSocket,
    options: {
      key: string;
    }
  ) => void;
}

export function routeClientMessage(ws: WebSocket, message: ClientMessage, deps: ClientMessageRouterDeps): void {
  switch (message.type) {
    case "hello": {
      handleHelloMessage(ws, message, deps.session);
      return;
    }
    case "resume": {
      handleResumeMessage(ws, message, deps.session);
      return;
    }
    case "overlaySubscribe": {
      handleOverlaySubscribeMessage(ws, message, deps.session);
      return;
    }
    case "startGame": {
      handleStartGameMessage(ws, message, deps.lobby);
      return;
    }
    case "updateLocale": {
      handleUpdateLocaleMessage(ws, message, deps.lobby);
      return;
    }
    case "updateSettings": {
      handleUpdateSettingsMessage(ws, message, deps.lobby);
      return;
    }
    case "updateRules": {
      handleUpdateRulesMessage(ws, message, deps.lobby);
      return;
    }
    case "requestHostTransfer": {
      handleRequestHostTransferMessage(ws, message, deps.lobby);
      return;
    }
    case "ping": {
      deps.send(ws, { type: "pong", payload: {} });
      return;
    }
    case "kickFromLobby": {
      handleKickFromLobbyMessage(ws, message, deps.lobby);
      return;
    }
    case "revealCard":
    case "vote":
    case "finalizeVoting":
    case "applySpecial":
    case "revealWorldThreat":
    case "setBunkerOutcome":
    case "continueRound":
    case "devSkipRound":
    case "devKickPlayer":
    case "devAddPlayer":
    case "devRemovePlayer": {
      handleGameActionMessage(ws, message, deps.game);
      return;
    }
    default: {
      deps.sendLocalizedError(ws, {
        key: "error.unknownMessage",
      });
    }
  }
}
