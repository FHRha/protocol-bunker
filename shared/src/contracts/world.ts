import { z } from "zod";
import { PostGameOutcomeSchema, type PostGameOutcome, WorldCardKindSchema, type WorldCardKind } from "./primitives.js";

export interface WorldCard {
  kind: WorldCardKind;
  id: string;
  title: string;
  description: string;
  text?: string;
  imageId?: string;
}

export interface WorldFacedCard extends WorldCard {
  isRevealed: boolean;
  revealedAtRound?: number;
  revealedBy?: string;
}

export interface WorldState30 {
  disaster: WorldCard;
  bunker: WorldFacedCard[];
  threats: WorldFacedCard[];
  counts: {
    bunker: number;
    threats: number;
  };
}

export interface WorldEvent {
  type: "bunker_revealed";
  index: number;
  round: number;
}

export interface PostGameState {
  isActive: boolean;
  enteredAt: number;
  outcome?: PostGameOutcome;
  decidedBy?: string;
  decidedAt?: number;
}

export const WorldCardSchema = z.object({
  kind: WorldCardKindSchema,
  id: z.string(),
  title: z.string(),
  description: z.string(),
  text: z.string().optional(),
  imageId: z.string().optional(),
});

export const WorldFacedCardSchema = WorldCardSchema.extend({
  isRevealed: z.boolean(),
  revealedAtRound: z.number().int().nonnegative().optional(),
  revealedBy: z.string().optional(),
});

export const WorldState30Schema = z.object({
  disaster: WorldCardSchema,
  bunker: z.array(WorldFacedCardSchema),
  threats: z.array(WorldFacedCardSchema),
  counts: z.object({
    bunker: z.number().int().nonnegative(),
    threats: z.number().int().nonnegative(),
  }),
});

export const WorldEventSchema = z.object({
  type: z.literal("bunker_revealed"),
  index: z.number().int().nonnegative(),
  round: z.number().int().nonnegative(),
});

export const PostGameStateSchema = z.object({
  isActive: z.boolean(),
  enteredAt: z.number().int().nonnegative(),
  outcome: PostGameOutcomeSchema.optional(),
  decidedBy: z.string().optional(),
  decidedAt: z.number().int().nonnegative().optional(),
});
