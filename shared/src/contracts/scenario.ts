import type { PostGameOutcome, SpecialTargetScope } from "./primitives.js";
import type { GameRuleset, GameSettings, ScenarioMeta } from "./settings.js";
import type { GameEvent, GameView } from "./state.js";

export interface AssetCard {
  id: string;
  deck: string;
  labelShort: string;
  deckId?: string;
  cardId?: string;
  locale?: string;
}

export interface AssetCatalog {
  decks: Record<string, AssetCard[]>;
}

export interface ScenarioPlayer {
  playerId: string;
  name: string;
}

export interface ScenarioContext {
  roomCode: string;
  createdAt: number;
  rng: () => number;
  assets: AssetCatalog;
  players: ScenarioPlayer[];
  settings: GameSettings;
  hostId: string;
  ruleset?: GameRuleset;
  onStateChange?: () => void;
  onEvent?: (event: GameEvent) => void;
}

export type ScenarioAction =
  | { type: "revealCard"; payload: { cardId: string } }
  | { type: "vote"; payload: { targetPlayerId: string } }
  | { type: "finalizeVoting"; payload: {} }
  | {
      type: "applySpecial";
      payload: { specialInstanceId: string; payload?: Record<string, unknown> };
    }
  | { type: "revealWorldThreat"; payload: { index: number } }
  | { type: "setBunkerOutcome"; payload: { outcome: PostGameOutcome } }
  | { type: "devSkipRound"; payload: {} }
  | { type: "devKickPlayer"; payload: { targetPlayerId: string } }
  | { type: "markLeftBunker"; payload: { targetPlayerId: string } }
  | { type: "continueRound"; payload: {} }
  | { type: "devAddPlayer"; payload: { name?: string } }
  | { type: "devRemovePlayer"; payload: { targetPlayerId?: string } }
  | {
      type: "adminReplacePlayerCard";
      payload: {
        targetPlayerId: string;
        cardInstanceId: string;
        targetArea?: "hand" | "special";
        replacementMode: "random" | "specific";
        replacementCardId?: string;
      };
    }
  | {
      type: "adminSetWorldCardReveal";
      payload: {
        kind: "bunker" | "threat";
        index: number;
        revealed: boolean;
      };
    }
  | {
      type: "adminReplaceWorldCard";
      payload: {
        kind: "bunker" | "threat" | "disaster";
        index?: number;
        replacementMode: "random" | "specific";
        replacementCardId?: string;
      };
    }
  | {
      type: "adminSetWorldCount";
      payload: {
        kind: "bunker" | "threat";
        count: number;
      };
    }
  | {
      type: "adminApplySpecial";
      payload: {
        actorPlayerId: string;
        specialInstanceId?: string;
        specialId?: string;
        payload?: Record<string, unknown>;
      };
    };

export interface ScenarioActionResult {
  error?: string;
  errorKey?: string;
  errorVars?: Record<string, string | number>;
  stateChanged?: boolean;
}

export interface ControlSpecialCatalogEntry {
  id: string;
  title: string;
  text: string;
  implemented?: boolean;
  choiceKind?: "player" | "neighbor" | "category" | "bunker" | "special" | "none";
  targetScope?: SpecialTargetScope;
  allowSelfTarget?: boolean;
  effectType?: string;
  requires?: string[];
}

export interface ScenarioSession {
  getGameView(playerId: string): GameView;
  handleAction(playerId: string, action: ScenarioAction): ScenarioActionResult;
  getSpecialCatalog?(): ControlSpecialCatalogEntry[];
}

export interface ScenarioModule {
  meta: ScenarioMeta;
  createSession(ctx: ScenarioContext): ScenarioSession;
}
