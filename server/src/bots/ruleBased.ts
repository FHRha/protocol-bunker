import { getTargetCandidates, type CardInHand, type GameView, type PublicPlayerView, type ScenarioActionResult, type SpecialConditionInstance } from "@bunker/shared";
import type { Room } from "../core/types.js";
import {
  getHiddenRevealCandidates,
  pickRequiredRevealCard,
  getRevealCategoryKey,
  getRevealedOwnCount,
} from "./revealChoice.js";
import { RULE_BOT_DISASTER_DECK_HINTS, RULE_BOT_REVEAL_DECK_PRIORITY } from "./ruleBasedConfig.js";

export interface RuleBasedBotDecision {
  botPlayerId: string;
  action: "revealCard" | "continueRound" | "vote" | "applySpecial";
  explanation: string;
  explanationKey?: string;
  explanationVars?: Record<string, string | number>;
  stateChanged: boolean;
}

export interface RunRuleBasedBotsResult {
  stateChanged: boolean;
  decisions: RuleBasedBotDecision[];
}

export interface RunRuleBasedBotStepResult {
  stateChanged: boolean;
  decision?: RuleBasedBotDecision;
}

const MAX_BOT_ACTIONS_PER_PASS = 64;
const REVEAL_TEXT_KEYS = [
  "match.bot.ruleBased.reveal.profession",
  "match.bot.ruleBased.reveal.survival",
  "match.bot.ruleBased.reveal.info",
] as const;
const VOTE_TEXT_KEYS = [
  "match.bot.ruleBased.vote.risk",
  "match.bot.ruleBased.vote.lowUtility",
  "match.bot.ruleBased.vote.openInfo",
] as const;
const SPECIAL_TEXT_KEYS = [
  "match.bot.ruleBased.special.timing",
  "match.bot.ruleBased.special.pressure",
  "match.bot.ruleBased.special.defense",
] as const;
const SPECIAL_TARGET_TEXT_KEYS = [
  "match.bot.ruleBased.special.timing.target",
  "match.bot.ruleBased.special.pressure.target",
  "match.bot.ruleBased.special.defense.target",
] as const;
const SPECIAL_BASE_USE_CHANCE = 0.22;
const SPECIAL_REPEAT_DECAY = 0.45;

function normalizeWords(value: string): Set<string> {
  const normalized = value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);
  return new Set(normalized);
}

function includesHintWord(words: Set<string>, hint: string): boolean {
  const normalizedHint = hint.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  for (const word of words) {
    if (word.includes(normalizedHint) || normalizedHint.includes(word)) return true;
  }
  return false;
}

function getDeckKey(card: CardInHand): string {
  return card.deck === "facts" ? "fact" : card.deck;
}

function getDeckKeyForView(card: CardInHand, view: GameView): string {
  const category = getRevealCategoryKey(card, view);
  return category === "facts" || category === "facts1" || category === "facts2" ? "fact" : category;
}

function buildVisibleWorldWords(view: GameView): Set<string> {
  const parts = [
    view.world?.disaster.title,
    view.world?.disaster.description,
    view.world?.disaster.text,
    ...(view.world?.threats ?? [])
      .filter((threat) => threat.isRevealed)
      .flatMap((threat) => [threat.title, threat.description, threat.text]),
    ...(view.world?.bunker ?? [])
      .filter((bunkerCard) => bunkerCard.isRevealed)
      .flatMap((bunkerCard) => [bunkerCard.title, bunkerCard.description, bunkerCard.text]),
  ];
  return normalizeWords(parts.filter(Boolean).join(" "));
}

function getDisasterDeckBonus(card: CardInHand, worldWords: Set<string>): number {
  const deckKey = getDeckKey(card);
  let bonus = 0;
  for (const hint of RULE_BOT_DISASTER_DECK_HINTS) {
    if (!hint.keywords.some((keyword) => includesHintWord(worldWords, keyword))) continue;
    bonus += hint.deckWeights[deckKey] ?? 0;
  }
  return bonus;
}

function getKeywordOverlapScore(card: CardInHand, worldWords: Set<string>): number {
  if (worldWords.size === 0) return 0;
  const cardWords = normalizeWords([card.labelShort, card.id, card.deck].filter(Boolean).join(" "));
  let overlap = 0;
  for (const word of cardWords) {
    if (worldWords.has(word) || includesHintWord(worldWords, word)) {
      overlap += 1;
    }
  }
  return Math.min(overlap, 4) * 2;
}

function getRevealScore(card: CardInHand, view: GameView): number {
  const deckKey = getDeckKeyForView(card, view);
  const deckIndex = RULE_BOT_REVEAL_DECK_PRIORITY.findIndex((deck) => deck === deckKey);
  const base = deckIndex >= 0 ? RULE_BOT_REVEAL_DECK_PRIORITY.length - deckIndex : 0;
  const worldWords = buildVisibleWorldWords(view);
  const specialPenalty = deckKey === "special" ? getSpecialRevealPenalty(view) : 0;
  const commonDeckPenalty = getVisibleDeckRevealCount(card, view) * 1.3;
  return base + getDisasterDeckBonus(card, worldWords) + getKeywordOverlapScore(card, worldWords) - specialPenalty - commonDeckPenalty;
}

function getVisibleDeckRevealCount(card: CardInHand, view: GameView): number {
  const deckKey = getDeckKeyForView(card, view);
  return view.public.players.reduce((count, player) => {
    const hasDeck = player.categories.some((slot) => slot.status === "revealed" && slot.category === deckKey);
    return count + (hasDeck ? 1 : 0);
  }, 0);
}

function pickWeighted<T>(items: T[], weight: (item: T) => number): T | null {
  if (items.length === 0) return null;
  const weighted = items.map((item) => ({ item, weight: Math.max(1, weight(item)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = Math.random() * total;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item;
  }
  return weighted[weighted.length - 1]?.item ?? null;
}

function getCardLabel(card: CardInHand): string {
  return String(card.labelShort || card.id || card.deck);
}

function getSpecialRevealPenalty(view: GameView): number {
  if (view.round <= 1) return 100;
  const revealedOwn = getRevealedOwnCount(view);
  if (revealedOwn >= 4) return 0;
  if (revealedOwn >= 3) return 2;
  return 5;
}

function normalizeCategoryKey(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "fact" || normalized === "facts" || normalized === "факт" || normalized === "факты") return "facts";
  return normalized;
}

function categoryMatches(actual: string, expected: string): boolean {
  const actualKey = normalizeCategoryKey(actual);
  const expectedKey = normalizeCategoryKey(expected);
  if (actualKey === expectedKey) return true;
  return expectedKey === "facts" && (actualKey === "facts1" || actualKey === "facts2");
}

function countRevealedCategoryCards(view: GameView, category: string): number {
  return view.public.players.reduce((count, player) => {
    if (player.status !== "alive") return count;
    const slotCount = (player.categories ?? [])
      .filter((slot) => slot.status === "revealed" && categoryMatches(slot.category, category))
      .reduce((sum, slot) => sum + slot.cards.filter((card) => !card.hidden).length, 0);
    return count + slotCount;
  }, 0);
}

function countRevealedSpecialCards(view: GameView): number {
  return view.public.players.reduce((count, player) => {
    return (
      count +
      (player.categories ?? [])
        .filter((slot) => slot.status === "revealed" && slot.category === "special")
        .reduce((sum, slot) => sum + slot.cards.filter((card) => !card.hidden).length, 0)
    );
  }, 0);
}

function passesSpecialBoardRequirements(special: SpecialConditionInstance, view: GameView): boolean {
  const effectType = String(special.effect?.type ?? "");
  const category = String(special.effect?.params?.category ?? "");
  if (effectType === "forceRevealCategoryForAll") {
    if (view.phase !== "reveal" && view.phase !== "reveal_discussion") return false;
    if (view.public.roundRules?.forcedRevealCategory) return false;
    return true;
  }
  if (effectType === "redealAllRevealed") {
    return Boolean(category) && countRevealedCategoryCards(view, category) >= 2;
  }
  if (
    effectType === "swapRevealedWithNeighbor" ||
    effectType === "replaceRevealedCard" ||
    effectType === "discardRevealedAndDealHidden"
  ) {
    return Boolean(category) && countRevealedCategoryCards(view, category) > 0;
  }
  return true;
}

function pickRevealCard(view: GameView): CardInHand | null {
  const requiredCard = pickRequiredRevealCard(view);
  if (requiredCard) return requiredCard;
  const hiddenCards = getHiddenRevealCandidates(view);
  if (hiddenCards.length === 0) return null;
  const eligibleCards = view.round <= 1 ? hiddenCards.filter((card) => getDeckKeyForView(card, view) !== "special") : hiddenCards;
  return pickWeighted(eligibleCards.length > 0 ? eligibleCards : hiddenCards, (card) => getRevealScore(card, view) * 2 + Math.random() * 9);
}

function getPlayerVoteScore(player: PublicPlayerView, view: GameView): number {
  const worldWords = buildVisibleWorldWords(view);
  const revealedCards = player.categories
    .filter((slot) => slot.status === "revealed")
    .flatMap((slot) => slot.cards.map((card) => ({ ...card, category: slot.category })));
  let score = 2 + player.revealedCount * 0.8;
  for (const card of revealedCards) {
    const words = normalizeWords([card.labelShort, card.category].filter(Boolean).join(" "));
    for (const word of words) {
      if (worldWords.has(word) || includesHintWord(worldWords, word)) {
        score += 2.2;
      }
    }
    if (card.category === "health") score += 0.8;
    if (card.category === "profession") score -= 0.5;
    if (card.category === "baggage") score -= 0.2;
  }
  if (player.isBot) score *= 0.75;
  return Math.max(1, score + Math.random() * 3);
}

function pickVoteTarget(view: GameView): PublicPlayerView | null {
  const disallowed = new Set(view.public.disallowedVoteTargetIdsForYou ?? []);
  const activeVoteCandidates = new Set(view.public.voteCandidateIds ?? []);
  const candidates = view.public.players.filter((player) => {
    if (activeVoteCandidates.size > 0 && !activeVoteCandidates.has(player.playerId)) return false;
    return player.playerId !== view.you.playerId && player.status === "alive" && !disallowed.has(player.playerId);
  });
  const fallbackCandidates =
    candidates.length > 0 || activeVoteCandidates.size > 0
      ? candidates
      : view.public.players.filter((player) => {
          return player.playerId !== view.you.playerId && player.status === "alive" && !disallowed.has(player.playerId);
        });
  if (fallbackCandidates.length === 0) return null;
  return pickWeighted(fallbackCandidates, (player) => getPlayerVoteScore(player, view));
}

function isSpecialUsableNow(special: SpecialConditionInstance, view: GameView): boolean {
  if (special.used || !special.implemented || special.pendingActivation) return false;
  if (special.trigger === "secret_onEliminate" || special.trigger === "onOwnerEliminated") return false;
  if (special.trigger === "onVote" && view.phase !== "voting") return false;
  if (special.effect?.type === "forceRevote" && view.public.votePhase !== "voteSpecialWindow") return false;
  if (!passesSpecialBoardRequirements(special, view)) return false;
  const categoryKey = String(special.effect?.params?.category ?? "");
  const needsCardChoice =
    categoryKey &&
    (special.effect.type === "swapRevealedWithNeighbor" ||
      special.effect.type === "replaceRevealedCard" ||
      special.effect.type === "discardRevealedAndDealHidden");
  if (needsCardChoice) return false;
  return view.phase === "voting" || view.phase === "reveal_discussion";
}

function buildAlivePlayerOrder(view: GameView): string[] {
  return view.public.players.filter((player) => player.status === "alive").map((player) => player.playerId);
}

function pickSpecialPayload(special: SpecialConditionInstance, view: GameView): Record<string, unknown> | null {
  const choiceKind = special.choiceKind ?? (special.needsChoice ? "player" : "none");
  if (choiceKind === "none") return {};
  if (choiceKind === "category" || choiceKind === "bunker" || choiceKind === "special") return null;
  const scope = special.targetScope;
  if (!scope) return null;
  if (scope === "self") return { targetPlayerId: view.you.playerId };
  const aliveOrder = buildAlivePlayerOrder(view);
  const aliveSet = new Set(aliveOrder);
  let candidateIds = getTargetCandidates(scope, view.you.playerId, aliveOrder, aliveSet);
  if (!special.allowSelfTarget && scope !== "any_including_self") {
    candidateIds = candidateIds.filter((id) => id !== view.you.playerId);
  }
  const target = pickWeighted(
    candidateIds
      .map((id) => view.public.players.find((player) => player.playerId === id))
      .filter((player): player is PublicPlayerView => player !== undefined && player.status === "alive"),
    (player) => getPlayerVoteScore(player, view)
  );
  return target ? { targetPlayerId: target.playerId } : null;
}

function pickSpecialToApply(view: GameView): { special: SpecialConditionInstance; payload: Record<string, unknown> } | null {
  const revealedOwn = getRevealedOwnCount(view);
  if (revealedOwn < 3 && view.phase !== "voting") return null;
  const revealedSpecialCount = countRevealedSpecialCards(view);
  if (Math.random() > SPECIAL_BASE_USE_CHANCE * SPECIAL_REPEAT_DECAY ** revealedSpecialCount) return null;
  const candidates = view.you.specialConditions
    .filter((special) => isSpecialUsableNow(special, view))
    .map((special) => ({ special, payload: pickSpecialPayload(special, view) }))
    .filter((entry): entry is { special: SpecialConditionInstance; payload: Record<string, unknown> } => Boolean(entry.payload));
  if (candidates.length === 0) return null;
  const pressure = view.phase === "voting" ? 5 : 1;
  return pickWeighted(candidates, (entry) => pressure + (entry.special.revealedPublic ? 1 : 3) + Math.random() * 2);
}

function pickTextKey(keys: readonly string[], seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return keys[hash % keys.length] ?? keys[0];
}

function getSelfPublicStatus(view: GameView): PublicPlayerView["status"] | undefined {
  return view.public.players.find((player) => player.playerId === view.you.playerId)?.status;
}

function getTargetNameFromPayload(view: GameView, payload: Record<string, unknown>): string | undefined {
  const targetId = typeof payload.targetPlayerId === "string" ? payload.targetPlayerId : undefined;
  if (!targetId) return undefined;
  return view.public.players.find((player) => player.playerId === targetId)?.name;
}

function asChanged(result: ScenarioActionResult): boolean {
  return !result.error && Boolean(result.stateChanged);
}

export function runRuleBasedBots(room: Room): RunRuleBasedBotsResult {
  return runRuleBasedBotsForLimit(room, MAX_BOT_ACTIONS_PER_PASS);
}

export function runRuleBasedBotStep(room: Room): RunRuleBasedBotStepResult {
  const result = runRuleBasedBotsForLimit(room, 1);
  return {
    stateChanged: result.stateChanged,
    decision: result.decisions[0],
  };
}

function runRuleBasedBotsForLimit(room: Room, maxActions: number): RunRuleBasedBotsResult {
  if (!room.session || room.phase !== "game") {
    return { stateChanged: false, decisions: [] };
  }

  const decisions: RuleBasedBotDecision[] = [];
  let stateChanged = false;

  for (let step = 0; step < maxActions; step += 1) {
    const decision = runNextRuleBasedBotAction(room);
    if (!decision) break;
    decisions.push(decision);
    stateChanged = stateChanged || decision.stateChanged;
  }

  return { stateChanged, decisions };
}

function runNextRuleBasedBotAction(room: Room): RuleBasedBotDecision | null {
  if (!room.session || room.phase !== "game") return null;

  const bots = Array.from(room.players.values()).filter(
    (player) => player.isBot && player.botType === "rule_based" && !player.leftBunker
  );

  for (const bot of bots) {
    const view = room.session.getGameView(bot.playerId);
    if (getSelfPublicStatus(view) !== "alive") continue;

    if (view.phase === "reveal" && view.public.currentTurnPlayerId === bot.playerId) {
      const card = pickRevealCard(view);
      if (!card?.instanceId) continue;
      const result = room.session.handleAction(bot.playerId, {
        type: "revealCard",
        payload: { cardId: card.instanceId },
      });
      if (result.error) continue;
      return {
        botPlayerId: bot.playerId,
        action: "revealCard",
        explanation: "",
        explanationKey: pickTextKey(REVEAL_TEXT_KEYS, `${bot.playerId}:${card.instanceId}:${view.round}`),
        explanationVars: {
          card: getCardLabel(card),
          cardId: card.id,
          category: card.deck,
        },
        stateChanged: asChanged(result),
      };
    }

    const specialPlan = pickSpecialToApply(view);
    if (specialPlan) {
      const result = room.session.handleAction(bot.playerId, {
        type: "applySpecial",
        payload: {
          specialInstanceId: specialPlan.special.instanceId,
          payload: specialPlan.payload,
        },
      });
      if (result.error) continue;
      const targetName = getTargetNameFromPayload(view, specialPlan.payload);
      const specialTextKeys = targetName ? SPECIAL_TARGET_TEXT_KEYS : SPECIAL_TEXT_KEYS;
      return {
        botPlayerId: bot.playerId,
        action: "applySpecial",
        explanation: "",
        explanationKey: pickTextKey(specialTextKeys, `${bot.playerId}:${specialPlan.special.instanceId}:${view.round}`),
        explanationVars: {
          special: specialPlan.special.title,
          target: targetName ?? "",
        },
        stateChanged: asChanged(result),
      };
    }

    if (view.phase === "reveal_discussion" && view.public.canContinue) {
      const result = room.session.handleAction(bot.playerId, {
        type: "continueRound",
        payload: {},
      });
      if (result.error) continue;
      return {
        botPlayerId: bot.playerId,
        action: "continueRound",
        explanation: "",
        explanationKey: "match.bot.ruleBased.continue",
        stateChanged: asChanged(result),
      };
    }

    if (view.phase === "voting" && view.public.votePhase === "voting" && !view.public.voting?.hasVoted) {
      const targetPlayerId = pickVoteTarget(view);
      if (!targetPlayerId) continue;
      const result = room.session.handleAction(bot.playerId, {
        type: "vote",
        payload: { targetPlayerId: targetPlayerId.playerId },
      });
      if (result.error) continue;
      return {
        botPlayerId: bot.playerId,
        action: "vote",
        explanation: "",
        explanationKey: pickTextKey(VOTE_TEXT_KEYS, `${bot.playerId}:${targetPlayerId.playerId}:${view.round}`),
        explanationVars: { target: targetPlayerId.name, targetId: targetPlayerId.playerId },
        stateChanged: asChanged(result),
      };
    }
  }

  return null;
}
