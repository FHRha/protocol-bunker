import { z } from "zod";

export const ROOM_PHASE_VALUES = ["lobby", "game"] as const;
export type RoomPhase = (typeof ROOM_PHASE_VALUES)[number];
export const RoomPhaseSchema = z.enum(ROOM_PHASE_VALUES);

export const SCENARIO_PHASE_VALUES = ["reveal", "reveal_discussion", "voting", "resolution", "ended"] as const;
export type ScenarioPhase = (typeof SCENARIO_PHASE_VALUES)[number];
export const ScenarioPhaseSchema = z.enum(SCENARIO_PHASE_VALUES);

export const VOTE_PHASE_VALUES = ["voting", "voteSpecialWindow", "voteResolve"] as const;
export type VotePhase = (typeof VOTE_PHASE_VALUES)[number];
export const VotePhaseSchema = z.enum(VOTE_PHASE_VALUES);

export const PLAYER_STATUS_VALUES = ["alive", "eliminated", "left_bunker"] as const;
export type PlayerStatus = (typeof PLAYER_STATUS_VALUES)[number];
export const PlayerStatusSchema = z.enum(PLAYER_STATUS_VALUES);

export const GAME_EVENT_KIND_VALUES = [
  "roundStart",
  "votingStart",
  "elimination",
  "gameEnd",
  "info",
  "playerDisconnected",
  "playerReconnected",
  "playerLeftBunker",
] as const;
export type GameEventKind = (typeof GAME_EVENT_KIND_VALUES)[number];
export const GameEventKindSchema = z.enum(GAME_EVENT_KIND_VALUES);

export const SPECIAL_CONDITION_TRIGGER_VALUES = [
  "active",
  "onVote",
  "onOwnerEliminated",
  "onRevealOrActive",
  "secret_onEliminate",
] as const;
export type SpecialConditionTrigger = (typeof SPECIAL_CONDITION_TRIGGER_VALUES)[number];
export const SpecialConditionTriggerSchema = z.enum(SPECIAL_CONDITION_TRIGGER_VALUES);

export const GAME_TIMER_KIND_VALUES = ["reveal_discussion", "pre_vote", "post_vote"] as const;
export type GameTimerKind = (typeof GAME_TIMER_KIND_VALUES)[number];
export const GameTimerKindSchema = z.enum(GAME_TIMER_KIND_VALUES);

export const CONTINUE_PERMISSION_VALUES = ["host_only", "revealer_only", "anyone"] as const;
export type ContinuePermission = (typeof CONTINUE_PERMISSION_VALUES)[number];
export const ContinuePermissionSchema = z.enum(CONTINUE_PERMISSION_VALUES);

export const REVEAL_TIMEOUT_ACTION_VALUES = ["random_card", "skip_player"] as const;
export type RevealTimeoutAction = (typeof REVEAL_TIMEOUT_ACTION_VALUES)[number];
export const RevealTimeoutActionSchema = z.enum(REVEAL_TIMEOUT_ACTION_VALUES);

export const SPECIAL_USAGE_MODE_VALUES = ["anytime", "only_during_voting"] as const;
export type SpecialUsageMode = (typeof SPECIAL_USAGE_MODE_VALUES)[number];
export const SpecialUsageModeSchema = z.enum(SPECIAL_USAGE_MODE_VALUES);

export const FINAL_THREAT_REVEAL_VALUES = ["host", "anyone"] as const;
export type FinalThreatReveal = (typeof FINAL_THREAT_REVEAL_VALUES)[number];
export const FinalThreatRevealSchema = z.enum(FINAL_THREAT_REVEAL_VALUES);

export const AUTOMATION_MODE_VALUES = ["auto", "semi", "manual"] as const;
export type AutomationMode = (typeof AUTOMATION_MODE_VALUES)[number];
export const AutomationModeSchema = z.enum(AUTOMATION_MODE_VALUES);

export const CARD_LOCALE_VALUES = ["ru", "en"] as const;
export type CardLocale = (typeof CARD_LOCALE_VALUES)[number];
export const CardLocaleSchema = z.enum(CARD_LOCALE_VALUES);

export const SPECIAL_TARGET_SCOPE_VALUES = ["neighbors", "any_alive", "self", "any_including_self"] as const;
export type SpecialTargetScope = (typeof SPECIAL_TARGET_SCOPE_VALUES)[number];
export const SpecialTargetScopeSchema = z.enum(SPECIAL_TARGET_SCOPE_VALUES);

export const WORLD_CARD_KIND_VALUES = ["bunker", "disaster", "threat"] as const;
export type WorldCardKind = (typeof WORLD_CARD_KIND_VALUES)[number];
export const WorldCardKindSchema = z.enum(WORLD_CARD_KIND_VALUES);

export const POST_GAME_OUTCOME_VALUES = ["survived", "failed"] as const;
export type PostGameOutcome = (typeof POST_GAME_OUTCOME_VALUES)[number];
export const PostGameOutcomeSchema = z.enum(POST_GAME_OUTCOME_VALUES);

export const HOST_CHANGE_REASON_VALUES = ["disconnect_timeout", "left_bunker", "eliminated", "manual"] as const;
export type HostChangeReason = (typeof HOST_CHANGE_REASON_VALUES)[number];
export const HostChangeReasonSchema = z.enum(HOST_CHANGE_REASON_VALUES);

export const RULESET_MODE_VALUES = ["auto", "preset", "manual"] as const;
export type RulesetMode = (typeof RULESET_MODE_VALUES)[number];
export const RulesetModeSchema = z.enum(RULESET_MODE_VALUES);

export const ROLE_VALUES = ["VIEW", "PLAYER", "CONTROL"] as const;
export type Role = (typeof ROLE_VALUES)[number];
export const RoleSchema = z.enum(ROLE_VALUES);
