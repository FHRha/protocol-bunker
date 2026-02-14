
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AssetCard,
  CardInHand,
  CardRef,
  GameEventKind,
  PublicCategorySlot,
  ScenarioAction,
  ScenarioActionResult,
  ScenarioContext,
  ScenarioModule,
  ScenarioPhase,
  ScenarioSession,
  PlayerStatus,
  YouCategorySlot,
  SpecialConditionInstance,
  SpecialConditionTrigger,
  VotePhase,
  GameTimerKind,
  GameRuleset,
  SpecialTargetScope,
  WorldState30,
  WorldFacedCard,
  WorldEvent,
  PostGameOutcome,
} from "@bunker/shared";
import { computeNeighbors, computeTargetScope, getTargetCandidates } from "@bunker/shared";
import { getRulesetForPlayerCount } from "@bunker/shared";
import { rollWorldFromAssets } from "./world_deck.js";
import { getThreatDeltaFromBunkerCards } from "./threat_modifier.js";

const CORE_DECKS = ["Профессия", "Здоровье", "Хобби", "Багаж", "Биология"] as const;
const FACTS_DECK = "Факты";
const FACTS_SLOTS = ["facts1", "facts2"] as const;
const FACTS_LABELS: Record<(typeof FACTS_SLOTS)[number], string> = {
  facts1: "Факт №1",
  facts2: "Факт №2",
};
const MAIN_DECKS = [...CORE_DECKS, FACTS_DECK] as const;
const SPECIAL_CATEGORY = "Особые условия";
const CATEGORY_ORDER = [
  "Профессия",
  "Здоровье",
  "Хобби",
  "Багаж",
  FACTS_LABELS.facts1,
  FACTS_LABELS.facts2,
  "Биология",
  SPECIAL_CATEGORY,
];
const RESOLUTION_DELAY_MS = 2000;

const CATEGORY_KEY_TO_DECK: Record<string, string> = {
  profession: "Профессия",
  health: "Здоровье",
  hobby: "Хобби",
  baggage: "Багаж",
  facts: "Факты",
  facts1: "Факты",
  facts2: "Факты",
  biology: "Биология",
};

const CATEGORY_KEY_TO_SLOT: Record<string, (typeof FACTS_SLOTS)[number] | undefined> = {
  facts1: "facts1",
  facts2: "facts2",
};

const CATEGORY_LABEL_TO_DECK: Record<string, { deck: string; slotKey?: (typeof FACTS_SLOTS)[number] }> = {
  "Профессия": { deck: "Профессия" },
  "Здоровье": { deck: "Здоровье" },
  "Хобби": { deck: "Хобби" },
  "Багаж": { deck: "Багаж" },
  "Биология": { deck: "Биология" },
  "Факт №1": { deck: FACTS_DECK, slotKey: "facts1" },
  "Факт №2": { deck: FACTS_DECK, slotKey: "facts2" },
};

interface SpecialConditionDefinition {
  id: string;
  title: string;
  text: string;
  file?: string;
  trigger: SpecialConditionTrigger;
  effect: { type: string; params?: Record<string, unknown> };
  implemented: boolean;
  requires?: string[];
  uiTargeting?: string;
}

interface SpecialConditionState {
  instanceId: string;
  definition: SpecialConditionDefinition;
  revealedPublic: boolean;
  used: boolean;
}

interface CardState {
  instanceId: string;
  id: string;
  deck: string;
  slotKey?: string;
  labelShort: string;
  revealed: boolean;
  missing?: boolean;
}

interface PlayerState {
  playerId: string;
  name: string;
  status: PlayerStatus;
  hand: CardState[];
  revealedThisRound: boolean;
  specialConditions: SpecialConditionState[];
  bannedAgainst: Set<string>;
  forcedWastedVoteNext: boolean;
}

interface VotingState {
  votes: Map<string, VoteRecord>;
  baseVotes: Map<string, VoteRecord> | null;
  candidates: Set<string>;
  autoWastedVoters: Set<string>;
  disabledVoters: Set<string>;
  voteWeights: Map<string, number>;
  doubleAgainstTarget?: string;
  tieBreakUsed: boolean;
  revoteDisallowTargets: Set<string>;
}

interface VoteRecord {
  targetId?: string;
  submittedAt: number;
  isValid: boolean;
  reasonInvalid?: string;
}

interface RoundRules {
  noTalkUntilVoting?: boolean;
  forcedRevealCategory?: string;
}

interface PostGameState {
  isActive: boolean;
  enteredAt: number;
  outcome?: PostGameOutcome;
  decidedBy?: string;
  decidedAt?: number;
}

const SPECIAL_CONDITIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "classic",
  "SPECIAL_CONDITIONS.json"
);

const loadSpecialDefinitions = (): SpecialConditionDefinition[] => {
  const raw = JSON.parse(fs.readFileSync(SPECIAL_CONDITIONS_PATH, "utf8")) as SpecialConditionDefinition[];
  return raw.map((item) => ({
    ...item,
    id: item.id || item.file || item.title,
    implemented: Boolean(item.implemented),
  }));
};

const SPECIAL_DEFINITIONS = loadSpecialDefinitions();
const IMPLEMENTED_SPECIALS = SPECIAL_DEFINITIONS.filter((item) => item.implemented);

const buildSpecialImgUrl = (file?: string) => (file ? `/assets/decks/${file}` : undefined);

const resolveChoiceKindFromTargeting = (definition: SpecialConditionDefinition): "player" | "neighbor" | "category" | "none" => {
  const targeting = (definition.uiTargeting ?? "").toLowerCase();
  if (
    targeting.includes("neighbor") ||
    targeting.includes("сосед") ||
    targeting.includes("left") ||
    targeting.includes("right") ||
    targeting.includes("слева") ||
    targeting.includes("справа")
  ) {
    return "neighbor";
  }
  if (targeting.includes("category") || targeting.includes("категор")) return "category";
  const scope = computeTargetScope(definition.uiTargeting, definition.text);
  if (!scope) return "none";
  return "player";
};

const resolveChoiceKind = (definition: SpecialConditionDefinition): "player" | "neighbor" | "category" | "none" =>
  resolveChoiceKindFromTargeting(definition);

const resolveTargetScope = (definition: SpecialConditionDefinition): SpecialTargetScope | null => {
  if (resolveChoiceKindFromTargeting(definition) === "category") return null;
  return computeTargetScope(definition.uiTargeting, definition.text);
};

const allowsSelfTarget = (definition: SpecialConditionDefinition): boolean => {
  const scope = resolveTargetScope(definition);
  return scope === "self" || scope === "any_including_self";
};

function drawCardFromDeck(deckName: string, deckPools: Map<string, AssetCard[]>, rng: () => number): AssetCard | null {
  const pool = deckPools.get(deckName) ?? [];
  if (pool.length === 0) {
    return null;
  }
  const index = Math.floor(rng() * pool.length);
  const [card] = pool.splice(index, 1);
  return card;
}

function buildMissingCard(deckName: string, instanceId: string, slotKey?: string): CardState {
  return {
    instanceId,
    id: "",
    deck: deckName,
    slotKey,
    labelShort: "Нет карты",
    revealed: false,
    missing: true,
  };
}

function buildMissingSpecialDefinition(): SpecialConditionDefinition {
  return {
    id: "missing-special",
    title: "Нет доступного условия",
    text: "Колода особых условий пуста.",
    trigger: "active",
    effect: { type: "none" },
    implemented: false,
  };
}

export const scenario: ScenarioModule = {
  meta: {
    id: "classic",
    name: "Classic Bunker",
    description: "Базовый сценарий: раунды, голосование и особые условия.",
  },
  createSession(ctx: ScenarioContext): ScenarioSession {
    const deckPools = new Map<string, AssetCard[]>();
    for (const deckName of MAIN_DECKS) {
      deckPools.set(deckName, [...(ctx.assets.decks[deckName] ?? [])]);
    }
    const specialPool = [...IMPLEMENTED_SPECIALS];

    let cardCounter = 0;
    let specialCounter = 0;
    let eventCounter = 0;
    const rng = ctx.rng;
    const settings = ctx.settings;
    const ruleset: GameRuleset = ctx.ruleset ?? getRulesetForPlayerCount(ctx.players.length);
    const continuePermission = settings.continuePermission;
    const players = new Map<string, PlayerState>();
    const playerOrder = ctx.players.map((player) => player.playerId);

    let phase: ScenarioPhase = "reveal";
    let round = 0;
    let votesRemainingInRound = 0;
    let eliminationsThisRound = 0;
    let totalExiles = 0;
    let votingState: VotingState | null = null;
    let votePhase: VotePhase | null = null;
    let lastEliminated: string | undefined;
    let resolutionNote: string | undefined;
    let winners: string[] | undefined;
    let resolutionTimer: ReturnType<typeof setTimeout> | undefined;
    let voteWindowTimer: ReturnType<typeof setTimeout> | undefined;
    let discussionTimer: ReturnType<typeof setTimeout> | undefined;
    let activeTimer: { kind: GameTimerKind; endsAt: number } | null = null;
    let lastStageText: string | undefined;
    let roundRules: RoundRules = {};
    let firstHealthRevealPlayerId: string | undefined;
    let currentTurnPlayerId: string | null = null;
    let lastRevealerId: string | null = null;
    const finalThreats: string[] = [];
    const world: WorldState30 = rollWorldFromAssets(ctx.assets, rng, ctx.players.length);
    let worldEvent: WorldEvent | null = null;
    let postGame: PostGameState | null = null;

    const makeCardInstanceId = (playerId: string) => {
      cardCounter += 1;
      return `${playerId}-${cardCounter}`;
    };

    const makeSpecialInstanceId = (playerId: string) => {
      specialCounter += 1;
      return `special-${playerId}-${specialCounter}`;
    };

    const emitEvent = (kind: GameEventKind, message: string) => {
      ctx.onEvent?.({
        id: `${ctx.roomCode}-${Date.now()}-${eventCounter++}`,
        kind,
        message,
        createdAt: Date.now(),
      });
      lastStageText = message;
    };

    const setStageText = (message: string) => {
      lastStageText = message;
    };

    const ensureAllBunkerCardsRevealed = () => {
      const maxConfiguredRound = Math.max(1, ruleset.votesPerRound.length);
      for (const card of world.bunker) {
        if (!card.isRevealed) {
          card.isRevealed = true;
          card.revealedAtRound = maxConfiguredRound;
        }
      }
    };

    const finishGame = () => {
      if (phase === "ended" && postGame?.isActive) {
        return;
      }
      ensureAllBunkerCardsRevealed();
      phase = "ended";
      votePhase = null;
      winners = alivePlayers().map((player) => player.name);
      votingState = null;
      postGame = {
        isActive: true,
        enteredAt: Date.now(),
      };
      const threatsNote = finalThreats.length > 0 ? ` Угроза: ${finalThreats.join(", ")}.` : "";
      emitEvent("gameEnd", `Игра завершена. В бункер попали: ${winners.join(", ")}.${threatsNote}`);
      clearVoteWindowTimer();
      clearDiscussionTimer();
    };

    const drawSpecialFromPool = (): SpecialConditionDefinition | null => {
      if (specialPool.length === 0) return null;
      const index = Math.floor(rng() * specialPool.length);
      const [definition] = specialPool.splice(index, 1);
      return definition ?? null;
    };

    for (const player of ctx.players) {
      const hand: CardState[] = [];
      for (const deckName of CORE_DECKS) {
        const baseCard = drawCardFromDeck(deckName, deckPools, rng);
        const instanceId = makeCardInstanceId(player.playerId);
        if (!baseCard) {
          hand.push(buildMissingCard(deckName, instanceId));
          continue;
        }
        hand.push({
          instanceId,
          id: baseCard.id,
          deck: baseCard.deck,
          labelShort: baseCard.labelShort,
          revealed: false,
        });
      }
      for (const slotKey of FACTS_SLOTS) {
        const baseCard = drawCardFromDeck(FACTS_DECK, deckPools, rng);
        const instanceId = makeCardInstanceId(player.playerId);
        if (!baseCard) {
          hand.push(buildMissingCard(FACTS_DECK, instanceId, slotKey));
          continue;
        }
        hand.push({
          instanceId,
          id: baseCard.id,
          deck: baseCard.deck,
          slotKey,
          labelShort: baseCard.labelShort,
          revealed: false,
        });
      }

      const specialDefinition = drawSpecialFromPool() ?? buildMissingSpecialDefinition();
      const specialInstance: SpecialConditionState = {
        instanceId: makeSpecialInstanceId(player.playerId),
        definition: specialDefinition,
        revealedPublic: false,
        used: false,
      };

      players.set(player.playerId, {
        playerId: player.playerId,
        name: player.name,
        status: "alive",
        hand,
        revealedThisRound: false,
        specialConditions: [specialInstance],
        bannedAgainst: new Set(),
        forcedWastedVoteNext: false,
      });
    }


    const resetRevealProgress = () => {
      lastRevealerId = null;
      for (const player of players.values()) {
        if (player.status === "alive") {
          player.revealedThisRound = false;
        }
      }
    };

    const clearRoundRules = () => {
      roundRules = {};
    };

    const alivePlayers = () => Array.from(players.values()).filter((player) => player.status === "alive");

    const isRoundComplete = () => alivePlayers().every((player) => player.revealedThisRound);

    const getFirstAliveInOrder = () => {
      for (const id of playerOrder) {
        const player = players.get(id);
        if (player && player.status === "alive") return player;
      }
      return undefined;
    };

    const getNextAliveInOrder = (fromId: string | null) => {
      if (playerOrder.length === 0) return undefined;
      if (!fromId) return getFirstAliveInOrder();
      const startIndex = playerOrder.indexOf(fromId);
      if (startIndex === -1) return getFirstAliveInOrder();
      for (let offset = 1; offset <= playerOrder.length; offset += 1) {
        const idx = (startIndex + offset) % playerOrder.length;
        const candidate = players.get(playerOrder[idx]);
        if (candidate && candidate.status === "alive") return candidate;
      }
      return undefined;
    };

    const getVotesForRound = (roundNumber: number) => {
      const index = Math.max(1, roundNumber) - 1;
      return ruleset.votesPerRound[index] ?? 0;
    };

    const getCumulativeExileRequirement = (roundNumber: number) => {
      let required = 0;
      const roundsCount = Math.max(1, ruleset.votesPerRound.length);
      for (let index = 1; index <= Math.min(roundsCount, Math.max(1, roundNumber)); index += 1) {
        required += getVotesForRound(index);
      }
      return required;
    };

    const computeRoundFromEliminations = (eliminatedCount: number) => {
      if (eliminatedCount <= 0) return 1;
      const roundsCount = Math.max(1, ruleset.votesPerRound.length);
      for (let candidateRound = 1; candidateRound <= roundsCount; candidateRound += 1) {
        if (eliminatedCount < getCumulativeExileRequirement(candidateRound)) {
          return candidateRound;
        }
      }
      return roundsCount + 1;
    };

    const getFastForwardRoundTarget = () => {
      const baselineRound = round + 1;
      const eliminationRound = computeRoundFromEliminations(totalExiles);
      return Math.max(baselineRound, eliminationRound);
    };

    const tryAdvanceRoundByEliminations = () => {
      if (phase !== "reveal" && phase !== "reveal_discussion") return false;
      const targetRound = computeRoundFromEliminations(totalExiles);
      if (targetRound <= round) return false;
      if (targetRound > Math.max(1, ruleset.votesPerRound.length)) {
        checkEndCondition(true);
        return true;
      }
      startRevealPhase(targetRound);
      return true;
    };

    const getPlayerById = (playerId: string) => players.get(playerId);

    const buildAliveSet = () => new Set(alivePlayers().map((player) => player.playerId));

    const getNeighbor = (playerId: string, direction: "left" | "right") => {
      const aliveSet = buildAliveSet();
      const neighbors = computeNeighbors(playerOrder, aliveSet, playerId);
      const neighborId = direction === "left" ? neighbors.leftId : neighbors.rightId;
      return neighborId ? players.get(neighborId) : undefined;
    };

    const getTargetScope = (definition: SpecialConditionDefinition): SpecialTargetScope | null =>
      resolveTargetScope(definition);

    const getTargetCandidatesFor = (scope: SpecialTargetScope, actorId: string) =>
      getTargetCandidates(scope, actorId, playerOrder, buildAliveSet());

    const resolveNeighborChoice = (actorId: string, payload: Record<string, unknown>) => {
      const aliveSet = buildAliveSet();
      const neighbors = computeNeighbors(playerOrder, aliveSet, actorId);
      const targetId = String(payload.targetPlayerId ?? "");
      const side = String(payload.side ?? "");
      if (targetId) {
        if (targetId === neighbors.leftId) return { neighborId: neighbors.leftId, side: "left" as const };
        if (targetId === neighbors.rightId) return { neighborId: neighbors.rightId, side: "right" as const };
        return { error: "Недопустимый сосед." as const };
      }
      if (side === "left" && neighbors.leftId) return { neighborId: neighbors.leftId, side: "left" as const };
      if (side === "right" && neighbors.rightId) return { neighborId: neighbors.rightId, side: "right" as const };
      return { error: "Сосед не найден." as const };
    };

    const resolveCategoryDeck = (categoryKey: string) => CATEGORY_KEY_TO_DECK[categoryKey] ?? categoryKey;

    const resolveCategorySlot = (categoryKey: string) => CATEGORY_KEY_TO_SLOT[categoryKey];

    const getCardsByCategoryKey = (player: PlayerState, categoryKey: string, onlyRevealed = false) => {
      const deckName = resolveCategoryDeck(categoryKey);
      const slotKey = resolveCategorySlot(categoryKey);
      return player.hand.filter((card) => {
        if (card.deck !== deckName) return false;
        if (slotKey && card.slotKey !== slotKey) return false;
        if (onlyRevealed && !card.revealed) return false;
        return true;
      });
    };

    const getRevealedCardsByCategory = (player: PlayerState, categoryKey: string) =>
      getCardsByCategoryKey(player, categoryKey, true);

    const getAnyCardsByCategory = (player: PlayerState, categoryKey: string) =>
      getCardsByCategoryKey(player, categoryKey, false);

    const getFirstRevealedCard = (player: PlayerState, categoryKey: string) =>
      getCardsByCategoryKey(player, categoryKey, true)[0];

    const getCardByInstanceId = (player: PlayerState, cardId: string) =>
      player.hand.find((card) => card.instanceId === cardId);

    const parseAgeFromCard = (card?: CardState): number | null => {
      if (!card?.labelShort) return null;
      const match = card.labelShort.match(/\d{1,3}/);
      if (!match) return null;
      const age = Number.parseInt(match[0], 10);
      if (Number.isNaN(age) || age < 1 || age > 120) return null;
      return age;
    };

    const getRevealedAge = (player: PlayerState): number | null => {
      const bioCard = player.hand.find((card) => card.deck === "Биология" && card.revealed);
      return parseAgeFromCard(bioCard);
    };

    const removeFromVoting = (targetId: string) => {
      if (!votingState) return;
      votingState.candidates.delete(targetId);
      votingState.votes.delete(targetId);
      votingState.baseVotes?.delete(targetId);
      votingState.voteWeights.delete(targetId);
      votingState.disabledVoters.delete(targetId);
      votingState.autoWastedVoters.delete(targetId);
      votingState.revoteDisallowTargets.delete(targetId);
      if (votingState.doubleAgainstTarget === targetId) {
        votingState.doubleAgainstTarget = undefined;
      }
      if (votePhase === "voting" && votingState.votes.size >= alivePlayers().length) {
        enterVoteSpecialWindow();
      }
    };

    const computeAgeExtremes = () => {
      const entries = alivePlayers()
        .map((player) => ({ playerId: player.playerId, age: getRevealedAge(player) }))
        .filter((entry) => entry.age !== null) as Array<{ playerId: string; age: number }>;
      if (entries.length === 0) return null;
      let youngest = entries[0];
      let oldest = entries[0];
      for (const entry of entries) {
        if (entry.age < youngest.age) youngest = entry;
        if (entry.age > oldest.age) oldest = entry;
      }
      return { youngestId: youngest.playerId, oldestId: oldest.playerId };
    };

    const checkEndCondition = (force = false) => {
      const alive = alivePlayers();
      const reachedExiles = totalExiles >= ruleset.totalExiles;
      const seatsReached = alive.length <= ruleset.bunkerSeats;
      if (!force && !reachedExiles && !seatsReached) return false;
      finishGame();
      return true;
    };

    const markVoteWasted = (state: VotingState, voterId: string, reason = "Голос заблокирован.") => {
      state.autoWastedVoters.add(voterId);
      state.disabledVoters.add(voterId);
      state.votes.set(voterId, {
        targetId: undefined,
        submittedAt: Date.now(),
        isValid: false,
        reasonInvalid: reason,
      });
    };

    const clearVoteWindowTimer = () => {
      if (voteWindowTimer) {
        clearTimeout(voteWindowTimer);
      }
      voteWindowTimer = undefined;
      if (activeTimer?.kind === "post_vote") {
        activeTimer = null;
      }
    };

    const clearDiscussionTimer = () => {
      if (discussionTimer) {
        clearTimeout(discussionTimer);
      }
      discussionTimer = undefined;
      if (activeTimer?.kind === "reveal_discussion" || activeTimer?.kind === "pre_vote") {
        activeTimer = null;
      }
    };

    const scheduleTimer = (kind: GameTimerKind, durationSec: number, callback: () => void) => {
      if (!durationSec || durationSec <= 0) return;
      const endsAt = Date.now() + durationSec * 1000;
      activeTimer = { kind, endsAt };
      const handle = setTimeout(() => {
        callback();
      }, durationSec * 1000);
      if (kind === "reveal_discussion" || kind === "pre_vote") {
        discussionTimer = handle;
      } else if (kind === "post_vote") {
        voteWindowTimer = handle;
      }
    };

    const consumeRoundElimination = () => {
      eliminationsThisRound += 1;
      if (votesRemainingInRound > 0) {
        votesRemainingInRound -= 1;
      }
    };

    const skipVotingAfterOutOfBandElimination = (playerName: string) => {
      if (phase !== "voting") return;
      clearVoteWindowTimer();
      votingState = null;
      phase = "resolution";
      votePhase = "voteResolve";
      resolutionNote = `Голосование пропущено: ${playerName} уже выбыл из игры.`;
      emitEvent("info", resolutionNote);
      if (!checkEndCondition()) {
        scheduleResolutionAdvance();
      }
    };

    const startVoting = () => {
      if (votesRemainingInRound <= 0) {
        startNextReveal();
        return;
      }
      votingState = {
        votes: new Map(),
        baseVotes: null,
        candidates: new Set(alivePlayers().map((player) => player.playerId)),
        autoWastedVoters: new Set(),
        disabledVoters: new Set(),
        voteWeights: new Map(),
        doubleAgainstTarget: undefined,
        tieBreakUsed: false,
        revoteDisallowTargets: new Set(),
      };

      roundRules.noTalkUntilVoting = false;
      clearDiscussionTimer();
      currentTurnPlayerId = null;
      lastRevealerId = null;

      for (const player of alivePlayers()) {
        if (player.forcedWastedVoteNext) {
          markVoteWasted(votingState, player.playerId, "Голос потрачен.");
          player.forcedWastedVoteNext = false;
        }
      }

      phase = "voting";
      votePhase = "voting";
      clearVoteWindowTimer();
      emitEvent("votingStart", `Началось голосование (раунд ${round}).`);
    };

    const maskWorldCard = (card: WorldFacedCard, label: string): WorldFacedCard => {
      if (card.isRevealed) return card;
      return {
        ...card,
        title: "",
        description: "",
        imageId: undefined,
        isRevealed: false,
        revealedAtRound: undefined,
        revealedBy: undefined,
      };
    };

    const buildWorldView = (): WorldState30 => ({
      disaster: world.disaster,
      bunker: world.bunker.map((card, index) =>
        card.isRevealed ? card : maskWorldCard(card, `Бункер #${index + 1}`)
      ),
      threats: world.threats.map((card, index) =>
        card.isRevealed ? card : maskWorldCard(card, `Угроза #${index + 1}`)
      ),
      counts: world.counts,
    });

    const getThreatModifierFromBunkerCards = () => {
      const { delta, reasons } = getThreatDeltaFromBunkerCards(world.bunker);

      const baseCount = world.counts.threats;
      const finalCount = Math.max(0, Math.min(world.threats.length, baseCount + delta));

      return {
        delta,
        reasons,
        baseCount,
        finalCount,
      };
    };

    const revealNextBunkerCard = (roundNumber: number) => {
      const index = world.bunker.findIndex((card) => !card.isRevealed);
      if (index === -1) return;
      world.bunker[index].isRevealed = true;
      world.bunker[index].revealedAtRound = roundNumber;
      worldEvent = { type: "bunker_revealed", index, round: roundNumber };
    };

    const startRevealPhase = (nextRound: number) => {
      const previousRound = round;
      round = nextRound;
      worldEvent = null;
      const roundsAdvanced = Math.max(1, round - previousRound);
      for (let step = 1; step <= roundsAdvanced; step += 1) {
        revealNextBunkerCard(previousRound + step);
      }
      votesRemainingInRound = getVotesForRound(round);
      eliminationsThisRound = 0;
      resetRevealProgress();
      clearRoundRules();
      phase = "reveal";
      votePhase = null;
      const firstAlive = getFirstAliveInOrder();
      currentTurnPlayerId = firstAlive?.playerId ?? null;
      if (!currentTurnPlayerId) {
        checkEndCondition(true);
        return;
      }
      emitEvent("roundStart", `Раунд ${round}: началось раскрытие.`);
    };

    const startNextReveal = () => {
      const nextRound = getFastForwardRoundTarget();
      if (nextRound > Math.max(1, ruleset.votesPerRound.length)) {
        checkEndCondition(true);
        return;
      }
      startRevealPhase(nextRound);
    };

    const scheduleResolutionAdvance = () => {
      if (!ctx.onStateChange) return;
      if (resolutionTimer) {
        clearTimeout(resolutionTimer);
      }
      resolutionTimer = setTimeout(() => {
        if (phase !== "resolution") return;
        if (checkEndCondition()) {
          ctx.onStateChange?.();
          return;
        }
        if (votesRemainingInRound > 0) {
          startVoting();
          lastEliminated = undefined;
          resolutionNote = undefined;
          ctx.onStateChange?.();
          return;
        }
        startNextReveal();
        votingState = null;
        lastEliminated = undefined;
        resolutionNote = undefined;
        ctx.onStateChange?.();
      }, RESOLUTION_DELAY_MS);
    };

    const enterRevealDiscussion = () => {
      clearDiscussionTimer();
      phase = "reveal_discussion";
      votePhase = null;
      const roundComplete = isRoundComplete();
      const shouldVote = roundComplete && votesRemainingInRound > 0;
      if (shouldVote && settings.enablePreVoteDiscussionTimer) {
        scheduleTimer("pre_vote", settings.preVoteDiscussionSeconds, () => {
          if (phase !== "reveal_discussion") return;
          advanceAfterDiscussion();
          ctx.onStateChange?.();
        });
        return;
      }
      if (settings.enableRevealDiscussionTimer) {
        scheduleTimer("reveal_discussion", settings.revealDiscussionSeconds, () => {
          if (phase !== "reveal_discussion") return;
          advanceAfterDiscussion();
          ctx.onStateChange?.();
        });
      }
    };

    const advanceAfterDiscussion = () => {
      clearDiscussionTimer();
      const roundComplete = isRoundComplete();
      if (!roundComplete) {
        const next = getNextAliveInOrder(currentTurnPlayerId);
        currentTurnPlayerId = next?.playerId ?? null;
        if (!currentTurnPlayerId) {
          checkEndCondition(true);
          return;
        }
        phase = "reveal";
        return;
      }
      if (votesRemainingInRound > 0) {
        startVoting();
        return;
      }
      startNextReveal();
    };

    const revealWorldThreat = (actorId: string, index: number): ScenarioActionResult => {
      if (phase !== "ended") {
        return { error: "Угрозы раскрываются в конце игры." };
      }
      const threatModifier = getThreatModifierFromBunkerCards();
      if (index < 0 || index >= threatModifier.finalCount) {
        return { error: "Некорректная карта угроз." };
      }
      if (settings.finalThreatReveal === "host" && actorId !== ctx.hostId) {
        return { error: "Только хост может открывать угрозы." };
      }
      const target = world.threats[index];
      if (target.isRevealed) return { stateChanged: false };
      target.isRevealed = true;
      target.revealedBy = actorId;
      return { stateChanged: true };
    };

    const setBunkerOutcome = (actorId: string, outcome: PostGameOutcome): ScenarioActionResult => {
      if (phase !== "ended" || !postGame?.isActive) {
        return { error: "Игра ещё не завершена." };
      }
      if (actorId !== ctx.hostId) {
        return { error: "Только хост может выбрать исход бункера." };
      }
      if (postGame.outcome) {
        return { error: "Исход уже выбран." };
      }
      postGame.outcome = outcome;
      postGame.decidedBy = actorId;
      postGame.decidedAt = Date.now();
      emitEvent(
        "info",
        outcome === "survived"
          ? "Финал: бункер выжил."
          : "Финал: бункер не выжил."
      );
      return { stateChanged: true };
    };

    const devSkipRound = (actorId: string): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return { error: "Только хост может пропустить раунд." };
      if (phase === "voting" || phase === "resolution") {
        return { error: "Нельзя пропустить раунд во время голосования." };
      }
      if (phase === "ended") return { error: "Игра уже завершена." };

      for (const player of alivePlayers()) {
        player.revealedThisRound = true;
      }
      advanceAfterDiscussion();
      return { stateChanged: true };
    };


    const getVoteSource = () => {
      if (!votingState) return null;
      if (votePhase === "voteSpecialWindow" || votePhase === "voteResolve") {
        return votingState.baseVotes ?? votingState.votes;
      }
      return votingState.votes;
    };

    const buildEffectiveVotes = (state: VotingState, source: Map<string, VoteRecord>) => {
      const result = new Map<
        string,
        { targetId?: string; status: "voted" | "not_voted" | "invalid"; reason?: string; weight: number; submittedAt?: number }
      >();

      for (const player of players.values()) {
        if (player.status !== "alive") {
          result.set(player.playerId, { status: "not_voted", weight: 0 });
          continue;
        }

        const record = source.get(player.playerId);
        if (!record) {
          result.set(player.playerId, { status: "not_voted", weight: 0 });
          continue;
        }

        let status: "voted" | "not_voted" | "invalid" = "voted";
        let reason = record.reasonInvalid;
        let targetId = record.targetId;
        let weight = state.voteWeights.get(player.playerId) ?? 1;

        if (!record.isValid) {
          status = "invalid";
        }
        if (!targetId) {
          status = "not_voted";
        }
        if (state.disabledVoters.has(player.playerId)) {
          status = "invalid";
          reason = reason ?? "Голос заблокирован.";
        }
        if (targetId && state.revoteDisallowTargets.has(targetId)) {
          status = "invalid";
          reason = reason ?? "Нельзя голосовать за этого кандидата.";
        }
        if (targetId && !state.candidates.has(targetId)) {
          status = "invalid";
          reason = reason ?? "Кандидат недоступен.";
        }
        if (targetId) {
          const targetPlayer = players.get(targetId);
          if (targetPlayer && targetPlayer.bannedAgainst.has(player.playerId)) {
            status = "invalid";
            reason = reason ?? "Голос против этого игрока запрещён.";
          }
        }

        if (status === "voted" && targetId) {
          if (state.doubleAgainstTarget && state.doubleAgainstTarget === targetId) {
            weight *= 2;
          }
        } else {
          targetId = undefined;
          weight = 0;
        }

        result.set(player.playerId, {
          targetId,
          status,
          reason,
          weight,
          submittedAt: record.submittedAt,
        });
      }

      return result;
    };

    const computeTotals = (state: VotingState, source: Map<string, VoteRecord>) => {
      const totals = new Map<string, number>();
      for (const candidate of state.candidates) {
        totals.set(candidate, 0);
      }

      const effective = buildEffectiveVotes(state, source);
      for (const [voterId, info] of effective.entries()) {
        if (info.status !== "voted" || !info.targetId) continue;
        const voter = players.get(voterId);
        if (!voter || voter.status !== "alive") continue;
        totals.set(info.targetId, (totals.get(info.targetId) ?? 0) + info.weight);
      }

      let maxVotes = 0;
      let topCandidates: string[] = [];
      for (const [candidate, count] of totals.entries()) {
        if (count > maxVotes) {
          maxVotes = count;
          topCandidates = [candidate];
        } else if (count === maxVotes) {
          topCandidates.push(candidate);
        }
      }

      if (topCandidates.length === 0) {
        topCandidates = Array.from(state.candidates);
      }

      return { totals, topCandidates };
    };

    const resetVotesForRevote = () => {
      if (!votingState) return;
      votingState.votes.clear();
      votingState.baseVotes = null;
      for (const voterId of votingState.autoWastedVoters) {
        markVoteWasted(votingState, voterId, "Голос потрачен.");
      }
    };

    const startTieBreakRevote = (candidates: string[]) => {
      if (!votingState) return;
      votingState.tieBreakUsed = true;
      votingState.candidates = new Set(candidates);
      votingState.revoteDisallowTargets.clear();
      resetVotesForRevote();
      votePhase = "voting";
      clearVoteWindowTimer();
      emitEvent("info", "Ничья. Переголосование между топ-кандидатами.");
    };

    const finalizeVotingResolution = (): ScenarioActionResult => {
      if (!votingState) return { error: "Голосование не начато." };
      clearVoteWindowTimer();
      const source = getVoteSource();
      if (!source) return { error: "Нет данных голосования." };

      const { topCandidates } = computeTotals(votingState, source);
      if (topCandidates.length > 1 && !votingState.tieBreakUsed) {
        startTieBreakRevote(topCandidates);
        return { stateChanged: true };
      }

      const index = Math.floor(rng() * topCandidates.length);
      applyElimination(topCandidates[index]);
      phase = "resolution";
      votePhase = "voteResolve";
      votingState.baseVotes = source;
      if (lastEliminated) {
        const name = players.get(lastEliminated)?.name ?? "игрок";
        emitEvent("elimination", `Итоги голосования: исключён ${name}.`);
      }

      if (!checkEndCondition()) {
        scheduleResolutionAdvance();
      }

      return { stateChanged: true };
    };

    const enterVoteSpecialWindow = () => {
      if (!votingState) return;
      votingState.baseVotes = new Map(votingState.votes);
      votePhase = "voteSpecialWindow";
      emitEvent("info", "Сбор голосов завершён. Окно спецусловий.");
      clearVoteWindowTimer();
      if (settings.enablePostVoteDiscussionTimer) {
        scheduleTimer("post_vote", settings.postVoteDiscussionSeconds, () => {
          if (phase === "voting" && votePhase === "voteSpecialWindow") {
            finalizeVotingResolution();
            ctx.onStateChange?.();
          }
        });
      }
    };

    const handleOnOwnerEliminated = (player: PlayerState) => {
      for (const condition of player.specialConditions) {
        const def = condition.definition;
        if (condition.used || def.trigger !== "onOwnerEliminated") continue;
        if (!def.implemented) continue;
        condition.used = true;
        if (def.effect.type === "addFinalThreat") {
          const threatKey = String(def.effect.params?.threatKey ?? def.id);
          finalThreats.push(threatKey);
        }
      }
    };

    const handleSecretEliminationTriggers = (eliminatedId: string) => {
      const ageExtremes = computeAgeExtremes();
      for (const player of players.values()) {
        for (const condition of player.specialConditions) {
          const def = condition.definition;
          if (condition.used || def.trigger !== "secret_onEliminate") continue;
          if (!def.implemented) continue;
          const conditionKey = String(def.effect.params?.condition ?? "");
          let triggered = false;

          if (conditionKey === "leftNeighborEliminated") {
            const left = getNeighbor(player.playerId, "left");
            triggered = Boolean(left && left.playerId === eliminatedId);
          } else if (conditionKey === "rightNeighborEliminated") {
            const right = getNeighbor(player.playerId, "right");
            triggered = Boolean(right && right.playerId === eliminatedId);
          } else if (conditionKey === "youngestByRevealedAgeEliminated") {
            triggered = Boolean(ageExtremes && ageExtremes.youngestId === eliminatedId);
          } else if (conditionKey === "oldestByRevealedAgeEliminated") {
            triggered = Boolean(ageExtremes && ageExtremes.oldestId === eliminatedId);
          } else if (conditionKey === "firstRevealedHealthEliminated") {
            triggered = Boolean(firstHealthRevealPlayerId && firstHealthRevealPlayerId === eliminatedId);
          }

          if (triggered) {
            condition.used = true;
            player.forcedWastedVoteNext = true;
          }
        }
      }
    };

    const applyElimination = (targetId: string) => {
      const target = players.get(targetId);
      if (!target || target.status !== "alive") return;

      target.status = "eliminated";
      consumeRoundElimination();
      totalExiles += 1;
      lastEliminated = targetId;
      resolutionNote = `${target.name} исключён.`;

      handleOnOwnerEliminated(target);
      handleSecretEliminationTriggers(targetId);
    };

    const markLeftBunker = (targetId: string): ScenarioActionResult => {
      const target = players.get(targetId);
      if (!target || target.status === "left_bunker") return { error: "Игрок не найден." };
      const wasAlive = target.status === "alive";
      target.status = "left_bunker";
      target.revealedThisRound = false;
      if (wasAlive) {
        consumeRoundElimination();
        totalExiles += 1;
      }
      removeFromVoting(targetId);
      if (currentTurnPlayerId === targetId) {
        const next = getNextAliveInOrder(targetId);
        currentTurnPlayerId = next?.playerId ?? null;
      }
      if (wasAlive && phase === "voting") {
        skipVotingAfterOutOfBandElimination(target.name);
        return { stateChanged: true };
      }
      if (!checkEndCondition() && wasAlive) {
        tryAdvanceRoundByEliminations();
      }
      return { stateChanged: true };
    };

    const devKickPlayer = (actorId: string, targetId: string): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return { error: "Только хост может выгнать игрока." };
      if (phase === "ended") return { error: "Игра уже завершена." };
      const target = players.get(targetId);
      if (!target) return { error: "Игрок не найден." };
      if (target.status !== "alive") return { error: "Игрок уже выбыл." };

      applyElimination(targetId);
      emitEvent("elimination", `DEV: ${target.name} принудительно исключён.`);
      removeFromVoting(targetId);

      if (currentTurnPlayerId === targetId) {
        const next = getNextAliveInOrder(targetId);
        currentTurnPlayerId = next?.playerId ?? null;
      }

      if (phase === "voting") {
        skipVotingAfterOutOfBandElimination(target.name);
        return { stateChanged: true };
      }

      if (!checkEndCondition()) {
        tryAdvanceRoundByEliminations();
      }
      return { stateChanged: true };
    };

    const revealCard = (player: PlayerState, cardId: string): ScenarioActionResult => {
      if (phase === "ended") {
        if (player.status === "left_bunker") {
          return { error: "Вы покинули игру." };
        }
        const cardEnded = getCardByInstanceId(player, cardId);
        if (!cardEnded) return { error: "Карта не найдена." };
        if (cardEnded.revealed) return { error: "Эта карта уже раскрыта." };
        cardEnded.revealed = true;
        return { stateChanged: true };
      }

      if (phase !== "reveal") return { error: "Сейчас нельзя раскрывать карты." };
      if (currentTurnPlayerId && player.playerId !== currentTurnPlayerId) {
        return { error: "Сейчас ход другого игрока." };
      }
      if (player.revealedThisRound) return { error: "Вы уже раскрыли карту в этом раунде." };

      const card = getCardByInstanceId(player, cardId);
      if (!card) return { error: "Карта не найдена." };
      if (card.revealed) return { error: "Эта карта уже раскрыта." };

      if (roundRules.forcedRevealCategory) {
        const forcedCategory = roundRules.forcedRevealCategory;
        const deckInfo = CATEGORY_LABEL_TO_DECK[forcedCategory];
        const hasForcedHidden = deckInfo
          ? player.hand.some(
              (entry) =>
                entry.deck === deckInfo.deck &&
                (!deckInfo.slotKey || entry.slotKey === deckInfo.slotKey) &&
                !entry.revealed
            )
          : player.hand.some((entry) => entry.deck === forcedCategory && !entry.revealed);
        const matchesForced = deckInfo
          ? card.deck === deckInfo.deck && (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey)
          : card.deck === forcedCategory;
        if (hasForcedHidden && !matchesForced) {
          return { error: `В этом раунде нужно раскрыть карту категории "${forcedCategory}".` };
        }
      }

      card.revealed = true;
      player.revealedThisRound = true;
      lastRevealerId = player.playerId;

      if (card.deck === "Здоровье" && !firstHealthRevealPlayerId) {
        firstHealthRevealPlayerId = player.playerId;
      }
      emitEvent("info", `${player.name} раскрывает карту.`);
      enterRevealDiscussion();
      return { stateChanged: true };
    };

    const continueRound = (player: PlayerState): ScenarioActionResult => {
      if (phase !== "reveal_discussion") return { error: "Сейчас нельзя продолжить кон." };
      if (continuePermission === "host_only" && player.playerId !== ctx.hostId) {
        return { error: "Только хост может продолжить ход." };
      }
      if (continuePermission === "revealer_only" && player.playerId !== lastRevealerId) {
        return { error: "Продолжить может только игрок, который раскрыл карту." };
      }
      advanceAfterDiscussion();
      return { stateChanged: true };
    };

    const applySpecial = (
      player: PlayerState,
      specialInstanceId: string,
      payload: Record<string, unknown>
    ): ScenarioActionResult => {
      const special = player.specialConditions.find((item) => item.instanceId === specialInstanceId);
      if (!special) return { error: "Особое условие не найдено." };
      if (!special.definition.implemented) return { error: "Эта карта ещё не реализована." };
      if (special.used) return { error: "Эта карта уже использована." };

      if (settings.specialUsage === "only_during_voting" && phase !== "voting") {
        return { error: "Особые условия можно использовать только во время голосования." };
      }

      if (special.definition.trigger === "onOwnerEliminated" || special.definition.trigger === "secret_onEliminate") {
        return { error: "Эта карта срабатывает автоматически." };
      }

      const choiceKind = resolveChoiceKind(special.definition);
      const targetScope = getTargetScope(special.definition);
      const effectivePayload = { ...payload } as Record<string, unknown>;

      if (choiceKind !== "none" && Object.keys(payload).length === 0) {
        return { error: "Нужен выбор для применения карты." };
      }

      if (targetScope) {
        if (targetScope === "neighbors") {
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if ("error" in neighborChoice) return { error: neighborChoice.error };
          effectivePayload.targetPlayerId = neighborChoice.neighborId;
          effectivePayload.side = neighborChoice.side;
        } else if (targetScope === "self") {
          effectivePayload.targetPlayerId = player.playerId;
        } else {
          const candidates = getTargetCandidatesFor(targetScope, player.playerId);
          if (candidates.length === 0) return { error: "Нет доступных целей." };
          const targetId = String(payload.targetPlayerId ?? "");
          if (!targetId) return { error: "Нужно выбрать цель." };
          if (!candidates.includes(targetId)) return { error: "Недопустимая цель." };
        }
      }

      if (choiceKind === "player") {
        const targetId = String(effectivePayload.targetPlayerId ?? "");
        if (targetId && !allowsSelfTarget(special.definition) && targetId === player.playerId) {
          return { error: "Нельзя выбрать себя." };
        }
      }

      const requiresError = validateRequires(player, special, effectivePayload);
      if (requiresError) return { error: requiresError };

      const result = applySpecialEffect(player, special, effectivePayload);
      if (result.error) return result;

      let changed = Boolean(result.stateChanged);
      if (!special.revealedPublic) {
        special.revealedPublic = true;
        emitEvent("info", `${player.name} применяет особое условие: ${special.definition.title}.`);
        changed = true;
      }

      return changed ? { stateChanged: true } : result;
    };

    const validateRequires = (player: PlayerState, special: SpecialConditionState, payload: Record<string, unknown>) => {
      const requires = special.definition.requires ?? [];
      for (const requirement of requires) {
        if (requirement === "phase=voting" && phase !== "voting") {
          return "Эту карту можно использовать только в фазе голосования.";
        }
        if (requirement === "phase=reveal" && phase !== "reveal") {
          return "Эту карту можно использовать только в фазе раскрытия.";
        }
        if (requirement === "votingStarted" && (!votingState || votingState.votes.size === 0)) {
          return "Голосование ещё не началось.";
        }
        if (requirement === "targetHasBaggage") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasBaggage = target ? getAnyCardsByCategory(target, "Багаж").length > 0 : false;
          if (!target || !hasBaggage) return "У выбранного игрока нет багажа.";
        }
        if (requirement === "targetHasRevealedHealth") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasRevealed = target ? getRevealedCardsByCategory(target, "Здоровье").length > 0 : false;
          if (!target || !hasRevealed) return "У выбранного игрока нет раскрытого здоровья.";
        }
        if (requirement === "targetHasRevealedProfession") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasRevealed = target ? getRevealedCardsByCategory(target, "Профессия").length > 0 : false;
          if (!target || !hasRevealed) return "У выбранного игрока нет раскрытой профессии.";
        }
        if (requirement === "targetHasRevealedSameCategory") {
          const categoryKey = String(special.definition.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return "Неизвестная категория.";
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if ("error" in neighborChoice) return neighborChoice.error;
          const neighbor = neighborChoice.neighborId ? players.get(neighborChoice.neighborId) : undefined;
          if (!neighbor) return "Сосед не найден.";
          const hasRevealed = getRevealedCardsByCategory(neighbor, deckName).length > 0;
          if (!hasRevealed) return "У соседа нет раскрытой карты этой категории.";
        }
        if (requirement === "needsNeighborIndexing") {
          if (playerOrder.length <= 1) return "Недостаточно игроков для соседей.";
        }
        if (requirement === "ageFieldAvailable") {
          const ages = alivePlayers().map((p) => getRevealedAge(p)).filter((age) => age !== null);
          if (ages.length === 0) return "Возраст ещё не раскрыт ни у одного игрока.";
        }
        if (requirement === "someRevealedAges") {
          const ages = alivePlayers().map((p) => getRevealedAge(p)).filter((age) => age !== null);
          if (ages.length === 0) return "Возраст ещё не раскрыт ни у одного игрока.";
        }
        if (requirement === "trackFirstRevealHealth") {
          if (!firstHealthRevealPlayerId) return "Ещё нет первого раскрытия здоровья.";
        }
      }
      return null;
    };

    const addSpecialToPlayer = (target: PlayerState): string | null => {
      const def = drawSpecialFromPool();
      if (!def) return "В колоде особых условий больше нет карт.";
      target.specialConditions.push({
        instanceId: makeSpecialInstanceId(target.playerId),
        definition: def,
        revealedPublic: false,
        used: false,
      });
      return null;
    };

    const applySpecialEffect = (
      player: PlayerState,
      special: SpecialConditionState,
      payload: Record<string, unknown>
    ): ScenarioActionResult => {
      const def = special.definition;
      if (!def.implemented) return { error: "Эта карта ещё не реализована." };
      if (special.used) return { error: "Эта карта уже использована." };

      const requiresError = validateRequires(player, special, payload);
      if (requiresError) return { error: requiresError };

      const canTargetSelf = allowsSelfTarget(def);
      const effectType = def.effect.type;
      const votingWindowEffects = new Set([
        "banVoteAgainst",
        "disableVote",
        "voteWeight",
        "forceRevote",
        "doubleVotesAgainst_and_disableSelfVote",
      ]);
      if (votingWindowEffects.has(effectType) && votePhase !== "voteSpecialWindow") {
        return { error: "Эту карту можно использовать только в окне спецусловий голосования." };
      }

      switch (effectType) {
        case "banVoteAgainst": {
          if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return { error: "Цель не в игре." };
          if (targetId === player.playerId && !canTargetSelf) return { error: "Нельзя выбрать себя." };
          player.bannedAgainst.add(targetId);
          special.used = true;
          emitEvent("info", `${player.name} использует карту "${def.title}".`);
          return { stateChanged: true };
        }
        case "voteWeight": {
          if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
          const weight = Number(def.effect.params?.weight ?? 2);
          votingState.voteWeights.set(player.playerId, weight);
          special.used = true;
          emitEvent("info", `${player.name} усиливает свой голос.`);
          return { stateChanged: true };
        }
        case "disableVote": {
          if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return { error: "Цель не в игре." };
          if (targetId === player.playerId && !canTargetSelf) return { error: "Нельзя выбрать себя." };
          markVoteWasted(votingState, targetId, "Голос заблокирован.");
          special.used = true;
          emitEvent("info", `${player.name} блокирует голос игрока ${target.name}.`);
          return { stateChanged: true };
        }
        case "doubleVotesAgainst_and_disableSelfVote": {
          if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return { error: "Цель не в игре." };
          if (targetId === player.playerId && !canTargetSelf) return { error: "Нельзя выбрать себя." };
          votingState.doubleAgainstTarget = targetId;
          markVoteWasted(votingState, player.playerId, "Ваш голос потрачен.");
          special.used = true;
          emitEvent("info", `${player.name} усиливает голоса против ${target.name}.`);
          return { stateChanged: true };
        }
        case "forceRevote": {
          if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
          const source = getVoteSource();
          if (!source) return { error: "Нет данных голосования." };
          if (def.effect.params?.disallowPreviousCandidate) {
            const { topCandidates } = computeTotals(votingState, source);
            votingState.revoteDisallowTargets = new Set(topCandidates);
          }
          resetVotesForRevote();
          votePhase = "voting";
          clearVoteWindowTimer();
          special.used = true;
          emitEvent("info", `${player.name} запускает переголосование.`);
          return { stateChanged: true };
        }
        case "swapRevealedWithNeighbor": {
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if ("error" in neighborChoice) return { error: neighborChoice.error };
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return { error: "Неизвестная категория." };
          const neighbor = neighborChoice.neighborId ? players.get(neighborChoice.neighborId) : undefined;
          if (!neighbor) return { error: "Сосед не найден." };

          const yourCard = getFirstRevealedCard(player, categoryKey);
          const theirCard = getFirstRevealedCard(neighbor, categoryKey);
          if (!yourCard || !theirCard) return { error: "Нужны раскрытые карты у обоих игроков." };

          const temp = { id: yourCard.id, labelShort: yourCard.labelShort, missing: yourCard.missing };
          yourCard.id = theirCard.id;
          yourCard.labelShort = theirCard.labelShort;
          yourCard.missing = theirCard.missing;
          theirCard.id = temp.id;
          theirCard.labelShort = temp.labelShort;
          theirCard.missing = temp.missing;

          special.used = true;
          emitEvent("info", `${player.name} меняется раскрытой картой с ${neighbor.name}.`);
          return { stateChanged: true };
        }
        case "replaceRevealedCard": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!target || target.status !== "alive") return { error: "Цель не в игре." };
          if (!deckName) return { error: "Неизвестная категория." };

          const revealedCard = getFirstRevealedCard(target, categoryKey);
          if (!revealedCard) return { error: "У цели нет раскрытой карты этой категории." };

          const newCard = drawCardFromDeck(deckName, deckPools, rng);
          if (!newCard) return { error: `В колоде категории "${deckName}" больше нет карт.` };

          revealedCard.id = newCard.id;
          revealedCard.labelShort = newCard.labelShort;
          revealedCard.missing = false;

          special.used = true;
          emitEvent("info", `${player.name} заменяет раскрытую карту у ${target.name}.`);
          return { stateChanged: true };
        }
        case "discardRevealedAndDealHidden": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!target || target.status !== "alive") return { error: "Цель не в игре." };
          if (!deckName) return { error: "Неизвестная категория." };

          const revealedCard = getFirstRevealedCard(target, categoryKey);
          if (!revealedCard) return { error: "У цели нет раскрытой карты этой категории." };

          const newCard = drawCardFromDeck(deckName, deckPools, rng);
          if (!newCard) return { error: `В колоде категории "${deckName}" больше нет карт.` };

          revealedCard.id = newCard.id;
          revealedCard.labelShort = newCard.labelShort;
          revealedCard.missing = false;
          revealedCard.revealed = false;

          special.used = true;
          emitEvent("info", `${player.name} сбрасывает раскрытую карту у ${target.name}.`);
          return { stateChanged: true };
        }
        case "redealAllRevealed": {
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return { error: "Неизвестная категория." };

          const revealedSlots: CardState[] = [];
          for (const target of alivePlayers()) {
            revealedSlots.push(...getRevealedCardsByCategory(target, categoryKey));
          }
          if (revealedSlots.length === 0) return { error: "Нет раскрытых карт для перераздачи." };

          const shuffled = [...revealedSlots];
          for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(rng() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          for (let i = 0; i < revealedSlots.length; i += 1) {
            const from = shuffled[i];
            const targetSlot = revealedSlots[i];
            targetSlot.id = from.id;
            targetSlot.labelShort = from.labelShort;
            targetSlot.missing = from.missing;
          }

          special.used = true;
          emitEvent("info", `${player.name} перераздаёт раскрытые карты категории ${deckName}.`);
          return { stateChanged: true };
        }
        case "forceRevealCategoryForAll": {
          const category = String(payload.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[category] ?? category;
          if (!deckName) return { error: "Нужно выбрать категорию." };
          const forcedLabel =
            category === "facts1"
              ? FACTS_LABELS.facts1
              : category === "facts2"
                ? FACTS_LABELS.facts2
                : deckName;
          roundRules.forcedRevealCategory = forcedLabel;
          special.used = true;
          emitEvent("info", `${player.name} требует раскрыть категорию ${forcedLabel}.`);
          return { stateChanged: true };
        }
        case "setRoundRule": {
          roundRules.noTalkUntilVoting = Boolean(def.effect.params?.noTalkUntilVoting ?? true);
          special.used = true;
          emitEvent("info", `${player.name} вводит правило раунда.`);
          return { stateChanged: true };
        }
        case "stealBaggage_and_giveSpecial": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return { error: "Цель не в игре." };
          if (targetId === player.playerId && !canTargetSelf) return { error: "Нельзя выбрать себя." };

          const targetBaggage = getAnyCardsByCategory(target, "Багаж");
          if (targetBaggage.length === 0) return { error: "У цели нет багажа." };

          const giveCount = Number(def.effect.params?.giveSpecialCount ?? 1);
          if (specialPool.length < giveCount) {
            return { error: "В колоде особых условий больше нет карт." };
          }

          const stolenCard = targetBaggage[0];
          target.hand = target.hand.filter((card) => card !== stolenCard);
          player.hand.push({ ...stolenCard, instanceId: makeCardInstanceId(player.playerId) });

          for (let i = 0; i < giveCount; i += 1) {
            const error = addSpecialToPlayer(target);
            if (error) return { error };
          }

          special.used = true;
          emitEvent("info", `${player.name} забирает багаж у ${target.name}.`);
          return { stateChanged: true };
        }
        case "addFinalThreat": {
          const threatKey = String(def.effect.params?.threatKey ?? def.id);
          finalThreats.push(threatKey);
          special.used = true;
          emitEvent("info", `${player.name} добавляет угрозу в финал.`);
          return { stateChanged: true };
        }
        default:
          return { error: "Эффект не поддерживается" };
      }
    };

    const vote = (player: PlayerState, targetId: string): ScenarioActionResult => {
      if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
      if (votePhase !== "voting") return { error: "Сбор голосов завершён." };
      if (targetId === player.playerId) return { error: "Нельзя голосовать за себя." };
      if (!votingState.candidates.has(targetId)) return { error: "Недопустимый кандидат." };
      if (votingState.votes.has(player.playerId)) return { error: "Вы уже проголосовали." };
      if (votingState.revoteDisallowTargets.has(targetId)) return { error: "Нельзя голосовать за этого кандидата." };

      const target = players.get(targetId);
      if (!target || target.status !== "alive") return { error: "Кандидат не в игре." };
      if (target.bannedAgainst.has(player.playerId)) {
        return { error: "Вы не можете голосовать против этого игрока." };
      }
      if (votingState.disabledVoters.has(player.playerId)) {
        return { error: "Ваш голос заблокирован." };
      }

      votingState.votes.set(player.playerId, {
        targetId,
        submittedAt: Date.now(),
        isValid: true,
      });

      const aliveCount = alivePlayers().length;
      if (votingState.votes.size < aliveCount) {
        return { stateChanged: true };
      }

      enterVoteSpecialWindow();
      return { stateChanged: true };
    };

    const finalizeVotingWindow = (): ScenarioActionResult => {
      if (phase !== "voting" || !votingState) return { error: "Сейчас нет голосования." };
      if (votePhase !== "voteSpecialWindow") return { error: "Окно спецусловий ещё не открыто." };
      clearVoteWindowTimer();
      return finalizeVotingResolution();
    };


    const toCardRef = (card: CardState): CardRef => ({
      id: card.id,
      deck: card.deck,
      instanceId: card.instanceId,
      labelShort: card.labelShort,
      missing: card.missing,
    });

    const toHandCard = (card: CardState): CardInHand => ({
      id: card.id,
      deck: card.deck,
      instanceId: card.instanceId,
      labelShort: card.labelShort,
      missing: card.missing,
      revealed: card.revealed,
    });

    const buildPublicCategories = (player: PlayerState): PublicCategorySlot[] => {
      return CATEGORY_ORDER.map((category) => {
        if (category === SPECIAL_CATEGORY) {
          const cards = player.specialConditions
            .filter((condition) => condition.revealedPublic)
            .map((condition) => ({
              labelShort: condition.definition.title,
              imgUrl: buildSpecialImgUrl(condition.definition.file),
            }));
          return {
            category,
            status: cards.length > 0 ? "revealed" : "hidden",
            cards,
          };
        }
        const deckInfo = CATEGORY_LABEL_TO_DECK[category];
        if (!deckInfo) {
          return { category, status: "hidden", cards: [] };
        }
        const revealedCards = player.hand.filter(
          (card) =>
            card.deck === deckInfo.deck &&
            (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey) &&
            card.revealed
        );
        const cards = revealedCards.map((card) => ({
          labelShort: card.labelShort,
          imgUrl: card.id ? `/assets/${card.id}` : undefined,
        }));
        return {
          category,
          status: cards.length > 0 ? "revealed" : "hidden",
          cards,
        };
      });
    };

    const buildYouCategories = (player: PlayerState): YouCategorySlot[] => {
      return CATEGORY_ORDER.filter((category) => category !== SPECIAL_CATEGORY).map((category) => {
        const deckInfo = CATEGORY_LABEL_TO_DECK[category];
        const cards = deckInfo
          ? player.hand
              .filter(
                (card) =>
                  card.deck === deckInfo.deck && (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey)
              )
              .map((card) => ({
                instanceId: card.instanceId,
                labelShort: card.labelShort,
                revealed: card.revealed,
              }))
          : [];
        return { category, cards };
      });
    };

    const buildSpecialInstances = (player: PlayerState): SpecialConditionInstance[] =>
      player.specialConditions.map((condition) => ({
        instanceId: condition.instanceId,
        id: condition.definition.id,
        title: condition.definition.title,
        text: condition.definition.text,
        trigger: condition.definition.trigger,
        effect: condition.definition.effect,
        implemented: condition.definition.implemented,
        revealedPublic: condition.revealedPublic,
        used: condition.used,
        imgUrl: buildSpecialImgUrl(condition.definition.file),
        needsChoice: resolveChoiceKind(condition.definition) !== "none",
        choiceKind: resolveChoiceKind(condition.definition),
        allowSelfTarget: allowsSelfTarget(condition.definition),
        targetScope: getTargetScope(condition.definition) ?? undefined,
      }));

    const buildVotesPublic = () => {
      if (!votingState || !votePhase) return undefined;
      const source = getVoteSource() ?? new Map<string, VoteRecord>();
      const effective = buildEffectiveVotes(votingState, source);
      return Array.from(players.values()).map((player) => {
        const info = effective.get(player.playerId);
        if (!info) {
          return {
            voterId: player.playerId,
            voterName: player.name,
            status: "not_voted" as const,
          };
        }
        if (info.status === "voted" && info.targetId) {
          return {
            voterId: player.playerId,
            voterName: player.name,
            targetId: info.targetId,
            targetName: players.get(info.targetId)?.name ?? "Неизвестно",
            status: "voted" as const,
            submittedAt: info.submittedAt,
          };
        }
        return {
          voterId: player.playerId,
          voterName: player.name,
          status: info.status === "invalid" ? ("invalid" as const) : ("not_voted" as const),
          reason: info.reason,
          submittedAt: info.submittedAt,
        };
      });
    };

    const buildVotingProgress = () => {
      if (!votingState || !votePhase) return undefined;
      const source = getVoteSource() ?? new Map<string, VoteRecord>();
      return { voted: source.size, total: alivePlayers().length };
    };

    startRevealPhase(1);

    return {
      getGameView(playerId: string) {
        const player = players.get(playerId);
        const you =
          player ??
          ({
            playerId,
            name: "Unknown",
            status: "eliminated" as PlayerStatus,
            hand: [
              ...CORE_DECKS.map((deck) => buildMissingCard(deck, makeCardInstanceId(playerId))),
              ...FACTS_SLOTS.map((slotKey) =>
                buildMissingCard(FACTS_DECK, makeCardInstanceId(playerId), slotKey)
              ),
            ],
            revealedThisRound: false,
            specialConditions: [],
            bannedAgainst: new Set(),
            forcedWastedVoteNext: false,
          } satisfies PlayerState);

        const revealedThisRound = alivePlayers()
          .filter((p) => p.revealedThisRound)
          .map((p) => p.playerId);

        return {
          phase,
          round,
          categoryOrder: CATEGORY_ORDER.slice(),
          lastStageText,
          ruleset,
          world: buildWorldView(),
          worldEvent: worldEvent ? { ...worldEvent } : undefined,
          postGame: postGame ? { ...postGame } : undefined,
          you: {
            playerId: you.playerId,
            name: you.name,
            hand: you.hand.map((card) => toHandCard(card)),
            categories: buildYouCategories(you),
            specialConditions: buildSpecialInstances(you),
          },
          public: {
            players: Array.from(players.values()).map((p) => ({
              playerId: p.playerId,
              name: p.name,
              status: p.status,
              connected: true,
              leftBunker: p.status === "left_bunker",
              revealedCards: p.hand.filter((card) => card.revealed).map((card) => toCardRef(card)),
              revealedCount: p.hand.filter((card) => card.revealed).length,
              totalCards: p.hand.length,
              specialRevealed: p.specialConditions.some((item) => item.revealedPublic),
              categories: buildPublicCategories(p),
            })),
            revealedThisRound,
            revealLimit: alivePlayers().length,
            voting: votePhase && votingState ? { hasVoted: votingState.votes.has(playerId) } : undefined,
            votePhase: votePhase ?? null,
            votesPublic: buildVotesPublic(),
            votingProgress: buildVotingProgress(),
            threatModifier: getThreatModifierFromBunkerCards(),
            canOpenVotingModal: votePhase !== null,
            canContinue:
              phase === "reveal_discussion" &&
              (continuePermission === "anyone" ||
                (continuePermission === "host_only" && playerId === ctx.hostId) ||
                (continuePermission === "revealer_only" && playerId === lastRevealerId)),
            currentTurnPlayerId,
            roundRevealedCount: alivePlayers().filter((p) => p.revealedThisRound).length,
            roundTotalAlive: alivePlayers().length,
            votesRemainingInRound,
            votesTotalThisRound: getVotesForRound(round),
            activeTimer,
            voteModalOpen: votePhase === "voting",
            lastEliminated,
            winners,
            resolutionNote,
            roundRules: {
              noTalkUntilVoting: roundRules.noTalkUntilVoting,
              forcedRevealCategory: roundRules.forcedRevealCategory,
            },
          },
        };
      },
      handleAction(playerId: string, action: ScenarioAction): ScenarioActionResult {
        const player = players.get(playerId);
        if (!player) return { error: "Игрок не найден." };
        if (action.type === "markLeftBunker") {
          return markLeftBunker(action.payload.targetPlayerId);
        }
        if (action.type === "revealWorldThreat") {
          return revealWorldThreat(playerId, action.payload.index);
        }
        if (action.type === "setBunkerOutcome") {
          return setBunkerOutcome(playerId, action.payload.outcome);
        }
        if (action.type === "devSkipRound") {
          return devSkipRound(playerId);
        }
        if (action.type === "devKickPlayer") {
          return devKickPlayer(playerId, action.payload.targetPlayerId);
        }
        if (action.type === "revealCard" && phase === "ended") {
          return revealCard(player, action.payload.cardId);
        }
        if (player.status !== "alive") return { error: "Вы исключены из игры." };
        if (phase === "ended") return { error: "Игра уже завершена." };

        switch (action.type) {
          case "revealCard":
            return revealCard(player, action.payload.cardId);
          case "continueRound":
            return continueRound(player);
          case "vote":
            return vote(player, action.payload.targetPlayerId);
          case "finalizeVoting":
            return finalizeVotingWindow();
          case "applySpecial":
            return applySpecial(player, action.payload.specialInstanceId, action.payload.payload ?? {});
          default:
            return { error: "Неизвестное действие." };
        }
      },
    };
  },
};
