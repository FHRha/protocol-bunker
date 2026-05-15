import { z } from "zod";
import {
  CardLocaleSchema,
  HostChangeReasonSchema,
  PostGameOutcomeSchema,
  RoleSchema,
  RulesetModeSchema,
} from "./primitives.js";
import { GameSettingsSchema, ManualRulesConfigSchema } from "./settings.js";
import { OverlayStateSchema } from "./overlay.js";
import {
  GameEventSchema,
  GameViewSchema,
  RoomStateSchema,
  StatePatchPayloadSchema,
} from "./state.js";

export const ClientHelloSchema = z.object({
  name: z.string().min(1),
  roomCode: z.string().min(1).optional(),
  create: z.boolean().optional(),
  scenarioId: z.string().min(1).optional(),
  locale: CardLocaleSchema.optional(),
  playerToken: z.string().min(1).optional(),
  tabId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("hello"),
    payload: ClientHelloSchema,
  }),
  z.object({
    type: z.literal("resume"),
    payload: z.object({
      roomCode: z.string().min(1),
      sessionId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("startGame"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("ping"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("revealCard"),
    payload: z.object({ cardId: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("vote"),
    payload: z.object({ targetPlayerId: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("finalizeVoting"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("applySpecial"),
    payload: z.object({
      specialInstanceId: z.string().min(1),
      payload: z.record(z.any()).optional(),
    }),
  }),
  z.object({
    type: z.literal("revealWorldThreat"),
    payload: z.object({
      index: z.number().int().min(0),
    }),
  }),
  z.object({
    type: z.literal("setBunkerOutcome"),
    payload: z.object({
      outcome: PostGameOutcomeSchema,
    }),
  }),
  z.object({
    type: z.literal("devSkipRound"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("devKickPlayer"),
    payload: z.object({
      targetPlayerId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("continueRound"),
    payload: z.object({}),
  }),
  z.object({
    type: z.literal("sendMatchMessage"),
    payload: z.object({
      text: z.string().trim().min(1).max(500),
    }),
  }),
  z.object({
    type: z.literal("kickFromLobby"),
    payload: z.object({
      targetPlayerId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("updateSettings"),
    payload: GameSettingsSchema,
  }),
  z.object({
    type: z.literal("updateAiAccessKey"),
    payload: z.object({
      key: z.string().max(512),
    }),
  }),
  z.object({
    type: z.literal("updateLocale"),
    payload: z.object({
      locale: CardLocaleSchema,
    }),
  }),
  z.object({
    type: z.literal("updateRules"),
    payload: z.object({
      mode: RulesetModeSchema,
      presetPlayerCount: z.number().int().min(4).max(16).optional(),
      manualConfig: ManualRulesConfigSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal("devAddPlayer"),
    payload: z.object({
      name: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("devRemovePlayer"),
    payload: z.object({
      targetPlayerId: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("requestHostTransfer"),
    payload: z.object({
      targetPlayerId: z.string().min(1).optional(),
    }),
  }),
  z.object({
    type: z.literal("overlaySubscribe"),
    payload: z.object({
      roomCode: z.string().min(1),
      token: z.string().min(1),
    }),
  }),
]);

export const ServerMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("roomState"),
    payload: RoomStateSchema,
  }),
  z.object({
    type: z.literal("gameView"),
    payload: GameViewSchema,
  }),
  z.object({
    type: z.literal("statePatch"),
    payload: StatePatchPayloadSchema,
  }),
  z.object({
    type: z.literal("gameEvent"),
    payload: GameEventSchema,
  }),
  z.object({
    type: z.literal("error"),
    payload: z.object({
      message: z.string(),
      code: z.string().optional(),
      maxPlayers: z.number().int().min(2).max(64).optional(),
    }),
  }),
  z.object({
    type: z.literal("helloAck"),
    payload: z.object({ playerId: z.string(), playerToken: z.string() }),
  }),
  z.object({
    type: z.literal("hostChanged"),
    payload: z.object({
      newHostId: z.string(),
      reason: HostChangeReasonSchema,
    }),
  }),
  z.object({
    type: z.literal("pong"),
    payload: z.object({}).optional(),
  }),
  z.object({
    type: z.literal("overlayState"),
    payload: z.object({
      ok: z.boolean(),
      unauthorized: z.boolean().optional(),
      roomCode: z.string().optional(),
      state: OverlayStateSchema.optional(),
      presenter: z.any().optional(),
      presenterModeEnabled: z.boolean().optional(),
      role: RoleSchema.optional(),
      message: z.string().optional(),
    }),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ClientHelloPayload = z.infer<typeof ClientHelloSchema>;
