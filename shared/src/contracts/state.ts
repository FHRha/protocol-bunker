import { z } from "zod";
import { GameRulesetSchema, GameSettingsSchema, GameTimerStateSchema, ScenarioMetaSchema } from "./settings.js";
import {
  GameEventKindSchema,
  PlayerStatusSchema,
  RoomPhaseSchema,
  ScenarioPhaseSchema,
  SpecialConditionTriggerSchema,
  SpecialTargetScopeSchema,
  VotePhaseSchema,
} from "./primitives.js";
import { PostGameStateSchema, WorldEventSchema, WorldState30Schema } from "./world.js";
import type {
  GameEventKind,
  PlayerStatus,
  RoomPhase,
  ScenarioPhase,
  SpecialConditionTrigger,
  SpecialTargetScope,
  VotePhase,
} from "./primitives.js";
import type { GameRuleset, GameSettings, GameTimerState, ScenarioMeta } from "./settings.js";
import type { PostGameState, WorldEvent, WorldState30 } from "./world.js";

export const SpecialChoiceKindValues = [
  "player",
  "neighbor",
  "category",
  "bunker",
  "special",
  "none",
] as const;
export type SpecialChoiceKind = (typeof SpecialChoiceKindValues)[number];
export const SpecialChoiceKindSchema = z.enum(SpecialChoiceKindValues);

export const CategoryRevealStatusValues = ["hidden", "revealed"] as const;
export type CategoryRevealStatus = (typeof CategoryRevealStatusValues)[number];
export const CategoryRevealStatusSchema = z.enum(CategoryRevealStatusValues);

export const VoteReasonCodeValues = [
  "VOTE_BLOCKED",
  "VOTE_FORCED_SELF",
  "VOTE_SPENT",
  "VOTE_TARGET_DISALLOWED",
  "VOTE_TARGET_UNAVAILABLE",
  "VOTE_BANNED_AGAINST_TARGET",
] as const;
export type VoteReasonCode = (typeof VoteReasonCodeValues)[number];
export const VoteReasonCodeSchema = z.enum(VoteReasonCodeValues);

export const VotePublicStatusValues = ["voted", "not_voted", "invalid"] as const;
export type VotePublicStatus = (typeof VotePublicStatusValues)[number];
export const VotePublicStatusSchema = z.enum(VotePublicStatusValues);

export interface CardRef {
  id: string;
  deck: string;
  instanceId?: string;
  labelShort?: string;
  imgUrl?: string;
  secret?: boolean;
  missing?: boolean;
}

export interface CardInHand extends CardRef {
  revealed: boolean;
}

export interface SpecialConditionEffect {
  type: string;
  params?: Record<string, unknown>;
}

export interface SpecialConditionInstance {
  instanceId: string;
  id: string;
  title: string;
  text: string;
  trigger: SpecialConditionTrigger;
  effect: SpecialConditionEffect;
  implemented: boolean;
  revealedPublic: boolean;
  used: boolean;
  imgUrl?: string;
  needsChoice?: boolean;
  choiceKind?: SpecialChoiceKind;
  pendingActivation?: boolean;
  allowSelfTarget?: boolean;
  targetScope?: SpecialTargetScope;
}

export interface PublicSpecialConditionView {
  instanceId: string;
  title: string;
  imgUrl?: string;
}

export interface PublicCategoryCard {
  labelShort: string;
  imgUrl?: string;
  instanceId?: string;
  hidden?: boolean;
  backCategory?: string;
}

export interface YouCategoryCard {
  instanceId: string;
  labelShort: string;
  revealed: boolean;
  imgUrl?: string;
}

export interface PlayerSummary {
  playerId: string;
  name: string;
  connected: boolean;
  disconnectedAt?: number;
  totalAbsentMs?: number;
  currentOfflineMs?: number;
  kickRemainingMs?: number;
  leftBunker?: boolean;
}

export interface DisasterOption {
  id: string;
  title: string;
}

export interface RoomState {
  revision?: number;
  roomCode: string;
  players: PlayerSummary[];
  hostId: string;
  controlId: string;
  phase: RoomPhase;
  scenarioMeta: ScenarioMeta;
  settings: GameSettings;
  ruleset: GameRuleset;
  rulesOverriddenByHost: boolean;
  rulesPresetCount?: number;
  world?: WorldState30;
  isDev?: boolean;
  disasterOptions?: DisasterOption[];
}

export interface StatePatchPayload {
  roomState?: Partial<RoomState>;
  gameView?: Partial<GameView>;
  roomStateRevision?: number;
  gameViewRevision?: number;
}

export interface PublicCategorySlot {
  category: string;
  status: CategoryRevealStatus;
  cards: PublicCategoryCard[];
}

export interface YouCategorySlot {
  category: string;
  cards: YouCategoryCard[];
}

export interface PublicPlayerView {
  playerId: string;
  name: string;
  status: PlayerStatus;
  connected: boolean;
  disconnectedAt?: number;
  totalAbsentMs?: number;
  currentOfflineMs?: number;
  kickRemainingMs?: number;
  leftBunker?: boolean;
  revealedCards: CardRef[];
  revealedCount: number;
  totalCards: number;
  specialRevealed: boolean;
  categories: PublicCategorySlot[];
}

export interface VotingView {
  hasVoted: boolean;
}

export interface VotingProgress {
  voted: number;
  total: number;
}

export type LocalizedVars = Record<string, string | number>;

export interface ThreatModifierView {
  delta: number;
  reasons: string[];
  reasonCardIds?: string[];
  baseCount: number;
  finalCount: number;
}

export interface VotePublic {
  voterId: string;
  voterName: string;
  targetId?: string;
  targetName?: string;
  status: VotePublicStatus;
  reason?: string;
  reasonKey?: string;
  reasonVars?: LocalizedVars;
  reasonCode?: VoteReasonCode;
  weight?: number;
  submittedAt?: number;
}

export interface GameEvent {
  id: string;
  kind: GameEventKind;
  message: string;
  messageKey?: string;
  messageVars?: LocalizedVars;
  createdAt: number;
}

export interface RoundRulesView {
  noTalkUntilVoting?: boolean;
  forcedRevealCategory?: string;
}

export interface GameView {
  revision?: number;
  phase: ScenarioPhase;
  round: number;
  categoryOrder: string[];
  lastStageText?: string;
  lastStageTextKey?: string;
  lastStageTextVars?: LocalizedVars;
  ruleset: GameRuleset;
  world?: WorldState30;
  worldEvent?: WorldEvent;
  postGame?: PostGameState;
  you: {
    playerId: string;
    name: string;
    hand: CardInHand[];
    categories: YouCategorySlot[];
    specialConditions: SpecialConditionInstance[];
  };
  public: {
    players: PublicPlayerView[];
    revealedThisRound: string[];
    roundRevealedCount?: number;
    roundTotalAlive?: number;
    currentTurnPlayerId?: string | null;
    votesRemainingInRound?: number;
    votesTotalThisRound?: number;
    revealLimit?: number;
    voting?: VotingView;
    votePhase?: VotePhase | null;
    votesPublic?: VotePublic[];
    votingProgress?: VotingProgress;
    disallowedVoteTargetIdsForYou?: string[];
    threatModifier?: ThreatModifierView;
    canOpenVotingModal?: boolean;
    canContinue?: boolean;
    activeTimer?: GameTimerState | null;
    voteModalOpen?: boolean;
    lastEliminated?: string;
    winners?: string[];
    resolutionNote?: string;
    resolutionNoteKey?: string;
    resolutionNoteVars?: LocalizedVars;
    roundRules?: RoundRulesView;
  };
}

export const PlayerSummarySchema = z.object({
  playerId: z.string(),
  name: z.string(),
  connected: z.boolean(),
  disconnectedAt: z.number().int().nonnegative().optional(),
  totalAbsentMs: z.number().int().nonnegative().optional(),
  currentOfflineMs: z.number().int().nonnegative().optional(),
  kickRemainingMs: z.number().int().nonnegative().optional(),
  leftBunker: z.boolean().optional(),
});

export const CardRefSchema = z.object({
  id: z.string(),
  deck: z.string(),
  instanceId: z.string().optional(),
  labelShort: z.string().optional(),
  imgUrl: z.string().optional(),
  secret: z.boolean().optional(),
  missing: z.boolean().optional(),
});

export const CardInHandSchema = CardRefSchema.extend({
  revealed: z.boolean(),
});

export const SpecialConditionEffectSchema = z.object({
  type: z.string(),
  params: z.record(z.any()).optional(),
});

export const SpecialConditionInstanceSchema = z.object({
  instanceId: z.string(),
  id: z.string(),
  title: z.string(),
  text: z.string(),
  trigger: SpecialConditionTriggerSchema,
  effect: SpecialConditionEffectSchema,
  implemented: z.boolean(),
  revealedPublic: z.boolean(),
  used: z.boolean(),
  imgUrl: z.string().optional(),
  needsChoice: z.boolean().optional(),
  choiceKind: SpecialChoiceKindSchema.optional(),
  pendingActivation: z.boolean().optional(),
  allowSelfTarget: z.boolean().optional(),
  targetScope: SpecialTargetScopeSchema.optional(),
});

export const PublicSpecialConditionViewSchema = z.object({
  instanceId: z.string(),
  title: z.string(),
  imgUrl: z.string().optional(),
});

export const PublicCategoryCardSchema = z.object({
  labelShort: z.string(),
  imgUrl: z.string().optional(),
  instanceId: z.string().optional(),
  hidden: z.boolean().optional(),
  backCategory: z.string().optional(),
});

export const YouCategoryCardSchema = z.object({
  instanceId: z.string(),
  labelShort: z.string(),
  revealed: z.boolean(),
  imgUrl: z.string().optional(),
});

export const PublicCategorySlotSchema = z.object({
  category: z.string(),
  status: CategoryRevealStatusSchema,
  cards: z.array(PublicCategoryCardSchema),
});

export const YouCategorySlotSchema = z.object({
  category: z.string(),
  cards: z.array(YouCategoryCardSchema),
});

export const DisasterOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
});

export const PublicPlayerViewSchema = z.object({
  playerId: z.string(),
  name: z.string(),
  status: PlayerStatusSchema,
  connected: z.boolean(),
  disconnectedAt: z.number().int().nonnegative().optional(),
  totalAbsentMs: z.number().int().nonnegative().optional(),
  currentOfflineMs: z.number().int().nonnegative().optional(),
  kickRemainingMs: z.number().int().nonnegative().optional(),
  leftBunker: z.boolean().optional(),
  revealedCards: z.array(CardRefSchema),
  revealedCount: z.number().int().nonnegative(),
  totalCards: z.number().int().nonnegative(),
  specialRevealed: z.boolean(),
  categories: z.array(PublicCategorySlotSchema),
});

export const RoomStateSchema = z.object({
  revision: z.number().int().nonnegative().optional(),
  roomCode: z.string(),
  players: z.array(PlayerSummarySchema),
  hostId: z.string(),
  controlId: z.string(),
  phase: RoomPhaseSchema,
  scenarioMeta: ScenarioMetaSchema,
  settings: GameSettingsSchema,
  ruleset: GameRulesetSchema,
  rulesOverriddenByHost: z.boolean(),
  rulesPresetCount: z.number().int().min(4).max(16).optional(),
  world: WorldState30Schema.optional(),
  isDev: z.boolean().optional(),
  disasterOptions: z.array(DisasterOptionSchema).optional(),
});

export const VotingViewSchema = z.object({
  hasVoted: z.boolean(),
});

export const VotingProgressSchema = z.object({
  voted: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export const LocalizedVarsSchema = z.record(z.union([z.string(), z.number()]));

export const ThreatModifierViewSchema = z.object({
  delta: z.number().int(),
  reasons: z.array(z.string()),
  reasonCardIds: z.array(z.string()).optional(),
  baseCount: z.number().int().nonnegative(),
  finalCount: z.number().int().nonnegative(),
});

export const VotePublicSchema = z.object({
  voterId: z.string(),
  voterName: z.string(),
  targetId: z.string().optional(),
  targetName: z.string().optional(),
  status: VotePublicStatusSchema,
  reason: z.string().optional(),
  reasonKey: z.string().optional(),
  reasonVars: LocalizedVarsSchema.optional(),
  reasonCode: VoteReasonCodeSchema.optional(),
  weight: z.number().optional(),
  submittedAt: z.number().int().nonnegative().optional(),
});

export const GameEventSchema = z.object({
  id: z.string(),
  kind: GameEventKindSchema,
  message: z.string(),
  messageKey: z.string().optional(),
  messageVars: LocalizedVarsSchema.optional(),
  createdAt: z.number().int().nonnegative(),
});

export const RoundRulesViewSchema = z.object({
  noTalkUntilVoting: z.boolean().optional(),
  forcedRevealCategory: z.string().optional(),
});

export const GameViewSchema = z.object({
  revision: z.number().int().nonnegative().optional(),
  phase: ScenarioPhaseSchema,
  round: z.number().int().nonnegative(),
  categoryOrder: z.array(z.string()),
  lastStageText: z.string().optional(),
  lastStageTextKey: z.string().optional(),
  lastStageTextVars: LocalizedVarsSchema.optional(),
  ruleset: GameRulesetSchema,
  world: WorldState30Schema.optional(),
  worldEvent: WorldEventSchema.optional(),
  postGame: PostGameStateSchema.optional(),
  you: z.object({
    playerId: z.string(),
    name: z.string(),
    hand: z.array(CardInHandSchema),
    categories: z.array(YouCategorySlotSchema),
    specialConditions: z.array(SpecialConditionInstanceSchema),
  }),
  public: z.object({
    players: z.array(PublicPlayerViewSchema),
    revealedThisRound: z.array(z.string()),
    roundRevealedCount: z.number().int().nonnegative().optional(),
    roundTotalAlive: z.number().int().nonnegative().optional(),
    currentTurnPlayerId: z.string().nullable().optional(),
    votesRemainingInRound: z.number().int().min(0).optional(),
    votesTotalThisRound: z.number().int().min(0).optional(),
    revealLimit: z.number().int().min(1).optional(),
    voting: VotingViewSchema.optional(),
    votePhase: VotePhaseSchema.nullable().optional(),
    votesPublic: z.array(VotePublicSchema).optional(),
    votingProgress: VotingProgressSchema.optional(),
    disallowedVoteTargetIdsForYou: z.array(z.string()).optional(),
    threatModifier: ThreatModifierViewSchema.optional(),
    canOpenVotingModal: z.boolean().optional(),
    canContinue: z.boolean().optional(),
    activeTimer: GameTimerStateSchema.nullable().optional(),
    voteModalOpen: z.boolean().optional(),
    lastEliminated: z.string().optional(),
    winners: z.array(z.string()).optional(),
    resolutionNote: z.string().optional(),
    resolutionNoteKey: z.string().optional(),
    resolutionNoteVars: LocalizedVarsSchema.optional(),
    roundRules: RoundRulesViewSchema.optional(),
  }),
});

export const StatePatchPayloadSchema = z.object({
  roomState: RoomStateSchema.partial().optional(),
  gameView: GameViewSchema.partial().optional(),
  roomStateRevision: z.number().int().nonnegative().optional(),
  gameViewRevision: z.number().int().nonnegative().optional(),
});
