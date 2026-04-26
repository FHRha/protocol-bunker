import { z } from "zod";
import {
  AutomationModeSchema,
  ContinuePermissionSchema,
  FinalThreatRevealSchema,
  GameTimerKindSchema,
  RevealTimeoutActionSchema,
  RulesetModeSchema,
  SpecialUsageModeSchema,
  type AutomationMode,
  type ContinuePermission,
  type FinalThreatReveal,
  type GameTimerKind,
  type RevealTimeoutAction,
  type RulesetMode,
  type SpecialUsageMode,
} from "./primitives.js";

export interface GameTimerState {
  kind: GameTimerKind;
  endsAt: number;
}

export interface ManualRulesConfig {
  bunkerSlots: number;
  votesByRound: number[];
  targetReveals: number;
  seedTemplatePlayers?: number;
}

export interface GameRuleset {
  playerCount: number;
  votesPerRound: number[];
  totalExiles: number;
  bunkerSeats: number;
  rulesetMode: RulesetMode;
  manualConfig?: ManualRulesConfig;
}

export interface GameSettings {
  enableRevealDiscussionTimer: boolean;
  revealDiscussionSeconds: number;
  enablePreVoteDiscussionTimer: boolean;
  preVoteDiscussionSeconds: number;
  enablePostVoteDiscussionTimer: boolean;
  postVoteDiscussionSeconds: number;
  automationMode: AutomationMode;
  enablePresenterMode: boolean;
  continuePermission: ContinuePermission;
  revealTimeoutAction: RevealTimeoutAction;
  revealsBeforeVoting: number;
  specialUsage: SpecialUsageMode;
  maxPlayers: number;
  finalThreatReveal: FinalThreatReveal;
  forcedDisasterId: string;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  description?: string;
  devOnly?: boolean;
}

export const GameTimerStateSchema = z.object({
  kind: GameTimerKindSchema,
  endsAt: z.number().int().nonnegative(),
});

export const ManualRulesConfigSchema = z.object({
  bunkerSlots: z.number().int().min(1).max(16),
  votesByRound: z.array(z.number().int().min(0).max(9)).min(1).max(64),
  targetReveals: z.number().int().min(5).max(7).default(7),
  seedTemplatePlayers: z.number().int().min(4).max(16).optional(),
});

export const GameRulesetSchema = z.object({
  playerCount: z.number().int().min(4).max(16),
  votesPerRound: z.array(z.number().int().min(0).max(9)).min(1).max(64),
  totalExiles: z.number().int().min(0),
  bunkerSeats: z.number().int().min(1),
  rulesetMode: RulesetModeSchema,
  manualConfig: ManualRulesConfigSchema.optional(),
});

export const GameSettingsSchema = z.object({
  enableRevealDiscussionTimer: z.boolean(),
  revealDiscussionSeconds: z.number().int().min(5).max(600),
  enablePreVoteDiscussionTimer: z.boolean(),
  preVoteDiscussionSeconds: z.number().int().min(5).max(600),
  enablePostVoteDiscussionTimer: z.boolean(),
  postVoteDiscussionSeconds: z.number().int().min(5).max(600),
  automationMode: AutomationModeSchema,
  enablePresenterMode: z.boolean(),
  continuePermission: ContinuePermissionSchema,
  revealTimeoutAction: RevealTimeoutActionSchema,
  revealsBeforeVoting: z.number().int().min(1),
  specialUsage: SpecialUsageModeSchema,
  maxPlayers: z.number().int().min(2),
  finalThreatReveal: FinalThreatRevealSchema,
  forcedDisasterId: z.string().min(1).max(256),
});

export const ScenarioMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  devOnly: z.boolean().optional(),
});
