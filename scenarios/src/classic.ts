
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
  VoteReasonCode,
  LocalizedVars,
} from "@bunker/shared";
import { computeNeighbors, computeTargetScope, getTargetCandidates } from "@bunker/shared";
import { getRulesetForPlayerCount } from "@bunker/shared";
import { rollWorldFromAssets } from "./world_deck.js";
import { getThreatDeltaFromBunkerCards } from "./threat_modifier.js";
import { buildDeckAccess, resolveAssetDeckId, resolveDeckIdByLabel } from "./deck_identity.js";
import { tClassic, tClassicFmt } from "./classicLocale.js";

const DECK_LABELS = {
  profession: tClassic("deck.profession"),
  health: tClassic("deck.health"),
  hobby: tClassic("deck.hobby"),
  baggage: tClassic("deck.baggage"),
  fact: tClassic("deck.fact"),
  biology: tClassic("deck.biology"),
  special: tClassic("deck.special"),
  bunker: tClassic("deck.bunker"),
} as const;

const DECK_IDS = {
  profession: "profession",
  health: "health",
  hobby: "hobby",
  baggage: "baggage",
  fact: "fact",
  biology: "biology",
  special: "special",
  bunker: "bunker",
} as const;

const CORE_DECKS = [
  DECK_LABELS.profession,
  DECK_LABELS.health,
  DECK_LABELS.hobby,
  DECK_LABELS.baggage,
  DECK_LABELS.biology,
] as const;
const FACTS_DECK = DECK_LABELS.fact;
const FACTS_SLOTS = ["facts1", "facts2"] as const;
const FACTS_LABELS: Record<(typeof FACTS_SLOTS)[number], string> = {
  facts1: tClassic("category.fact1"),
  facts2: tClassic("category.fact2"),
};
const MAIN_DECKS = [...CORE_DECKS, FACTS_DECK] as const;
const SPECIAL_CATEGORY = "special";
const CATEGORY_ORDER = [
  "profession",
  "health",
  "hobby",
  "baggage",
  "facts1",
  "facts2",
  "biology",
  SPECIAL_CATEGORY,
] as const;
const RESOLUTION_DELAY_MS = 2000;

const CATEGORY_KEY_TO_DECK: Record<string, string> = {
  profession: DECK_IDS.profession,
  health: DECK_IDS.health,
  hobby: DECK_IDS.hobby,
  baggage: DECK_IDS.baggage,
  facts: DECK_IDS.fact,
  facts1: DECK_IDS.fact,
  facts2: DECK_IDS.fact,
  biology: DECK_IDS.biology,
};

const CATEGORY_KEY_TO_SLOT: Record<string, (typeof FACTS_SLOTS)[number] | undefined> = {
  facts1: "facts1",
  facts2: "facts2",
};

const CATEGORY_LABEL_TO_DECK: Record<string, { deck: string; slotKey?: (typeof FACTS_SLOTS)[number] }> = {
  [DECK_LABELS.profession]: { deck: DECK_IDS.profession },
  [DECK_LABELS.health]: { deck: DECK_IDS.health },
  [DECK_LABELS.hobby]: { deck: DECK_IDS.hobby },
  [DECK_LABELS.baggage]: { deck: DECK_IDS.baggage },
  [DECK_LABELS.biology]: { deck: DECK_IDS.biology },
  [FACTS_LABELS.facts1]: { deck: DECK_IDS.fact, slotKey: "facts1" },
  [FACTS_LABELS.facts2]: { deck: DECK_IDS.fact, slotKey: "facts2" },
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

type SpecialChoiceKind = "player" | "neighbor" | "category" | "bunker" | "none";

interface SpecialConditionState {
  instanceId: string;
  definition: SpecialConditionDefinition;
  imgUrl?: string;
  revealedPublic: boolean;
  used: boolean;
  pendingActivation?: boolean;
}

interface CardState {
  instanceId: string;
  id: string;
  deck: string;
  deckId?: string;
  slotKey?: string;
  labelShort: string;
  revealed: boolean;
  missing?: boolean;
  publicBackCategory?: string;
}

interface PlayerState {
  playerId: string;
  name: string;
  status: PlayerStatus;
  hand: CardState[];
  revealedThisRound: boolean;
  specialConditions: SpecialConditionState[];
  specialCategoryProxyCards: Array<{
    labelShort: string;
    imgUrl?: string;
    hidden?: boolean;
    backCategory?: string;
  }>;
  bannedAgainst: Set<string>;
  forcedWastedVoteNext: boolean;
}

interface VotingState {
  votes: Map<string, VoteRecord>;
  baseVotes: Map<string, VoteRecord> | null;
  candidates: Set<string>;
  autoWastedVoters: Set<string>;
  forcedSelfVoters: Set<string>;
  disabledVoters: Set<string>;
  voteWeights: Map<string, number>;
  doubleAgainstTarget?: string;
  tieBreakUsed: boolean;
  revoteDisallowTargets: Set<string>;
  revoteDisallowByVoter: Map<string, string>;
}

interface VoteRecord {
  targetId?: string;
  submittedAt: number;
  isValid: boolean;
  reasonInvalid?: string;
  reasonKeyInvalid?: string;
  reasonVarsInvalid?: LocalizedVars;
  reasonCodeInvalid?: VoteReasonCode;
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
const normalizeSpecialLookup = (value?: string): string =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435")
    .replace(/[\\/]/g, " ")
    .replace(/\.(jpg|jpeg|png|webp)$/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
const toSpecialFileName = (value?: string): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? "";
};
const resolveSpecialImgUrl = (
  definition: SpecialConditionDefinition,
  specialImageIndex: Map<string, string>
): string | undefined => {
  const byTitle = specialImageIndex.get(normalizeSpecialLookup(definition.title));
  if (byTitle) return byTitle;

  const byFileName = specialImageIndex.get(normalizeSpecialLookup(toSpecialFileName(definition.file)));
  if (byFileName) return byFileName;

  const byId = specialImageIndex.get(normalizeSpecialLookup(toSpecialFileName(definition.id)));
  if (byId) return byId;

  return buildSpecialImgUrl(definition.file);
};

const resolveChoiceKindFromTargeting = (definition: SpecialConditionDefinition): SpecialChoiceKind => {
  const targeting = (definition.uiTargeting ?? "").toLowerCase();
  if (
    definition.effect.type === "replaceBunkerCard" ||
    definition.effect.type === "discardBunkerCard" ||
    definition.effect.type === "stealBunkerCardToExiled"
  ) {
    return "bunker";
  }
  if (
    targeting.includes("neighbor") ||
    targeting.includes(tClassic("classic.auto.085")) ||
    targeting.includes("left") ||
    targeting.includes("right") ||
    targeting.includes(tClassic("classic.auto.084")) ||
    targeting.includes(tClassic("classic.auto.088"))
  ) {
    return "neighbor";
  }
  if (targeting.includes("bunker") || targeting.includes(tClassic("classic.auto.001"))) return "bunker";
  if (targeting.includes("category") || targeting.includes(tClassic("classic.auto.033"))) return "category";
  const scope = computeTargetScope(definition.uiTargeting, definition.text);
  if (!scope) return "none";
  return "player";
};

const resolveChoiceKind = (definition: SpecialConditionDefinition): SpecialChoiceKind =>
  resolveChoiceKindFromTargeting(definition);

const resolveTargetScope = (definition: SpecialConditionDefinition): SpecialTargetScope | null => {
  const choiceKind = resolveChoiceKindFromTargeting(definition);
  if (choiceKind === "category" || choiceKind === "bunker") return null;
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

function cardDeckId(card: Pick<CardState, "deck" | "deckId" | "id">): string | undefined {
  const byExplicit = resolveDeckIdByLabel(card.deckId);
  if (byExplicit) return byExplicit;
  const byDeck = resolveDeckIdByLabel(card.deck);
  if (byDeck) return byDeck;
  return resolveAssetDeckId({ deck: card.deck, deckId: card.deckId, id: card.id });
}

function cardMatchesDeck(card: Pick<CardState, "deck" | "deckId" | "id">, deckNameOrId: string): boolean {
  const target = resolveDeckIdByLabel(deckNameOrId) ?? deckNameOrId;
  return cardDeckId(card) === target;
}

function buildMissingCard(deckName: string, instanceId: string, slotKey?: string): CardState {
  return {
    instanceId,
    id: "",
    deck: deckName,
    slotKey,
    labelShort: tClassic("card.noCard"),
    revealed: false,
    missing: true,
  };
}

function buildMissingSpecialDefinition(): SpecialConditionDefinition {
  return {
    id: "missing-special",
    title: tClassic("special.none.title"),
    text: tClassic("special.none.text"),
    trigger: "active",
    effect: { type: "none" },
    implemented: false,
  };
}

export const scenario: ScenarioModule = {
  meta: {
    id: "classic",
    name: "Classic Bunker",
    description: tClassic("meta.description"),
  },
  createSession(ctx: ScenarioContext): ScenarioSession {
    const deckAccess = buildDeckAccess(ctx.assets);
    const deckPools = new Map<string, AssetCard[]>();
    for (const deckName of MAIN_DECKS) {
      const deckId = resolveDeckIdByLabel(deckName) ?? deckName;
      deckPools.set(deckName, [...deckAccess.getDeckCards(deckId, deckName)]);
    }
    const specialImageIndex = new Map<string, string>();
    for (const asset of deckAccess.getDeckCards("special", SPECIAL_CATEGORY)) {
      const imgUrl = asset.id ? `/assets/${asset.id}` : undefined;
      if (!imgUrl) continue;
      const titleKey = normalizeSpecialLookup(asset.labelShort);
      if (titleKey && !specialImageIndex.has(titleKey)) {
        specialImageIndex.set(titleKey, imgUrl);
      }
      const fileKey = normalizeSpecialLookup(toSpecialFileName(asset.id));
      if (fileKey && !specialImageIndex.has(fileKey)) {
        specialImageIndex.set(fileKey, imgUrl);
      }
    }
    const specialPool = [...IMPLEMENTED_SPECIALS];

    let cardCounter = 0;
    let specialCounter = 0;
    let eventCounter = 0;
    const rng = ctx.rng;
    const settings = ctx.settings;
    const ruleset: GameRuleset = ctx.ruleset ?? getRulesetForPlayerCount(ctx.players.length);
    const continuePermission = settings.continuePermission;
    const getAutomationMode = () => settings.automationMode ?? "semi";
    const isAutoAutomation = () => getAutomationMode() === "auto";
    const isManualAutomation = () => getAutomationMode() === "manual";
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
    let resolutionNoteKey: string | undefined;
    let resolutionNoteVars: LocalizedVars | undefined;
    let winners: string[] | undefined;
    let resolutionTimer: ReturnType<typeof setTimeout> | undefined;
    let voteWindowTimer: ReturnType<typeof setTimeout> | undefined;
    let discussionTimer: ReturnType<typeof setTimeout> | undefined;
    let activeTimer: { kind: GameTimerKind; endsAt: number } | null = null;
    let lastStageText: string | undefined;
    let lastStageTextKey: string | undefined;
    let lastStageTextVars: LocalizedVars | undefined;
    let roundRules: RoundRules = {};
    let firstHealthRevealPlayerId: string | undefined;
    let currentTurnPlayerId: string | null = null;
    let lastRevealerId: string | null = null;
    const finalThreats: string[] = [];
    const world: WorldState30 = rollWorldFromAssets(
      ctx.assets,
      rng,
      ctx.players.length,
      ctx.settings.forcedDisasterId
    );
    const bunkerDeckAssets = deckAccess.getDeckCards(DECK_IDS.bunker, DECK_LABELS.bunker);
    const initialBunkerIds = new Set(world.bunker.map((card) => card.id).filter((id): id is string => Boolean(id)));
    const bunkerReplacementPool: WorldFacedCard[] =
      bunkerDeckAssets.length > 0
        ? bunkerDeckAssets
            .filter((card) => !initialBunkerIds.has(card.id))
            .map((card) => ({
              kind: "bunker",
              id: card.id,
              title: card.labelShort,
              description: card.labelShort,
              imageId: card.id,
              isRevealed: true,
            }))
        : world.bunker.map((card) => ({ ...card, isRevealed: true }));
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

    const emitEvent = (
      kind: GameEventKind,
      messageOrKey: string,
      vars?: LocalizedVars,
      explicitMessage?: string
    ) => {
      const message = explicitMessage ?? (vars ? tClassicFmt(messageOrKey, vars) : tClassic(messageOrKey));
      ctx.onEvent?.({
        id: `${ctx.roomCode}-${Date.now()}-${eventCounter++}`,
        kind,
        message,
        messageKey: messageOrKey,
        messageVars: vars,
        createdAt: Date.now(),
      });
      lastStageText = message;
      lastStageTextKey = messageOrKey;
      lastStageTextVars = vars;
    };

    const setStageText = (messageOrKey: string, vars?: LocalizedVars, explicitMessage?: string) => {
      lastStageText = explicitMessage ?? (vars ? tClassicFmt(messageOrKey, vars) : tClassic(messageOrKey));
      lastStageTextKey = messageOrKey;
      lastStageTextVars = vars;
    };

    const scenarioError = (
      key: string,
      vars?: Record<string, string | number>
    ): ScenarioActionResult => ({
      error: vars ? tClassicFmt(key, vars) : tClassic(key),
      errorKey: key,
      errorVars: vars,
    });

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
      const threatsNote = finalThreats.length > 0 ? tClassicFmt("classic.auto.116", { v1: finalThreats.join(", ") }) : "";
      emitEvent("gameEnd", "classic.auto.117", { v1: winners.join(", "), v2: threatsNote });
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
          deck: deckName,
          deckId: resolveAssetDeckId(baseCard) ?? resolveDeckIdByLabel(deckName),
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
          deck: FACTS_DECK,
          deckId: resolveAssetDeckId(baseCard) ?? resolveDeckIdByLabel(FACTS_DECK),
          slotKey,
          labelShort: baseCard.labelShort,
          revealed: false,
        });
      }

      const specialDefinition = drawSpecialFromPool() ?? buildMissingSpecialDefinition();
      const specialInstance: SpecialConditionState = {
        instanceId: makeSpecialInstanceId(player.playerId),
        definition: specialDefinition,
        imgUrl: resolveSpecialImgUrl(specialDefinition, specialImageIndex),
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
        specialCategoryProxyCards: [],
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
        return scenarioError("classic.auto.043");
      }
      if (side === "left" && neighbors.leftId) return { neighborId: neighbors.leftId, side: "left" as const };
      if (side === "right" && neighbors.rightId) return { neighborId: neighbors.rightId, side: "right" as const };
      return scenarioError("classic.auto.086");
    };

    const resolveCategoryDeck = (categoryKey: string) => CATEGORY_KEY_TO_DECK[categoryKey] ?? categoryKey;

    const resolveCategorySlot = (categoryKey: string) => CATEGORY_KEY_TO_SLOT[categoryKey];

    const getCardsByCategoryKey = (player: PlayerState, categoryKey: string, onlyRevealed = false) => {
      const deckName = resolveCategoryDeck(categoryKey);
      const slotKey = resolveCategorySlot(categoryKey);
      return player.hand.filter((card) => {
        if (!cardMatchesDeck(card, deckName)) return false;
        if (slotKey && card.slotKey !== slotKey) return false;
        if (onlyRevealed && !card.revealed) return false;
        return true;
      });
    };

    const getRevealedCardsByCategory = (player: PlayerState, categoryKey: string) =>
      getCardsByCategoryKey(player, categoryKey, true);

    const getAnyCardsByCategory = (player: PlayerState, categoryKey: string) =>
      getCardsByCategoryKey(player, categoryKey, false);

    const getSelectedRevealedCard = (
      player: PlayerState,
      categoryKey: string,
      requestedInstanceId?: string
    ) => {
      const revealedCards = getCardsByCategoryKey(player, categoryKey, true);
      if (revealedCards.length === 0) return undefined;
      const requested = String(requestedInstanceId ?? "").trim();
      if (!requested) return revealedCards[0];
      return revealedCards.find((card) => card.instanceId === requested);
    };

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
      const bioCard = player.hand.find((card) => cardMatchesDeck(card, DECK_IDS.biology) && card.revealed);
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
      votingState.forcedSelfVoters.delete(targetId);
      votingState.revoteDisallowTargets.delete(targetId);
      if (votingState.doubleAgainstTarget === targetId) {
        votingState.doubleAgainstTarget = undefined;
      }
      if (
        !isManualAutomation() &&
        votePhase === "voting" &&
        votingState.votes.size >= alivePlayers().length
      ) {
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

    const getVoteReasonKey = (reasonCode?: VoteReasonCode): string | undefined => {
      switch (reasonCode) {
        case "VOTE_BLOCKED":
          return "classic.voteReason.blocked";
        case "VOTE_FORCED_SELF":
          return "classic.voteReason.forcedSelf";
        case "VOTE_SPENT":
          return "classic.voteReason.spent";
        case "VOTE_TARGET_DISALLOWED":
          return "classic.voteReason.targetDisallowed";
        case "VOTE_TARGET_UNAVAILABLE":
          return "classic.voteReason.targetUnavailable";
        case "VOTE_BANNED_AGAINST_TARGET":
          return "classic.voteReason.bannedAgainstTarget";
        default:
          return undefined;
      }
    };

    const markVoteWasted = (
      state: VotingState,
      voterId: string,
      reason?: string,
      reasonCode: VoteReasonCode = "VOTE_BLOCKED"
    ) => {
      state.autoWastedVoters.add(voterId);
      state.disabledVoters.add(voterId);
      state.votes.set(voterId, {
        targetId: undefined,
        submittedAt: Date.now(),
        isValid: false,
        reasonInvalid: reason,
        reasonKeyInvalid: getVoteReasonKey(reasonCode),
        reasonVarsInvalid: undefined,
        reasonCodeInvalid: reasonCode,
      });
    };

    const markVoteForcedSelf = (
      state: VotingState,
      voterId: string,
      reason?: string,
      reasonCode: VoteReasonCode = "VOTE_FORCED_SELF"
    ) => {
      state.forcedSelfVoters.add(voterId);
      state.disabledVoters.delete(voterId);
      state.votes.set(voterId, {
        targetId: voterId,
        submittedAt: Date.now(),
        isValid: true,
        reasonInvalid: reason,
        reasonKeyInvalid: getVoteReasonKey(reasonCode),
        reasonVarsInvalid: undefined,
        reasonCodeInvalid: reasonCode,
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
      const voteSkipNote = tClassicFmt("classic.auto.118", { v1: playerName });
      resolutionNote = voteSkipNote;
      resolutionNoteKey = "classic.auto.118";
      resolutionNoteVars = { v1: playerName };
      emitEvent("info", "classic.auto.118", { v1: playerName }, voteSkipNote);
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
        forcedSelfVoters: new Set(),
        disabledVoters: new Set(),
        voteWeights: new Map(),
        doubleAgainstTarget: undefined,
        tieBreakUsed: false,
        revoteDisallowTargets: new Set(),
        revoteDisallowByVoter: new Map(),
      };

      roundRules.noTalkUntilVoting = false;
      clearDiscussionTimer();
      currentTurnPlayerId = null;
      lastRevealerId = null;

      for (const player of alivePlayers()) {
        if (player.forcedWastedVoteNext) {
          markVoteForcedSelf(votingState, player.playerId);
          player.forcedWastedVoteNext = false;
        }
      }

      phase = "voting";
      votePhase = "voting";
      clearVoteWindowTimer();
      emitEvent("votingStart", "classic.auto.119", { v1: round });
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
        card.isRevealed ? card : maskWorldCard(card, `${DECK_LABELS.bunker} #${index + 1}`)
      ),
      threats: world.threats.map((card, index) =>
        card.isRevealed ? card : maskWorldCard(card, tClassicFmt("classic.auto.120", { v1: index + 1 }))
      ),
      counts: world.counts,
    });

    const getThreatModifierFromBunkerCards = () => {
      const { delta, reasons, reasonCardIds } = getThreatDeltaFromBunkerCards(world.bunker);

      const baseCount = world.counts.threats;
      const finalCount = Math.max(0, Math.min(world.threats.length, baseCount + delta));

      return {
        delta,
        reasons,
        reasonCardIds,
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

    const getRevealedBunkerIndices = () =>
      world.bunker
        .map((card, index) => (card.isRevealed ? index : -1))
        .filter((index) => index >= 0);

    const getRandomRevealedBunkerIndex = (): number | null => {
      const revealedIndices = getRevealedBunkerIndices();
      if (revealedIndices.length === 0) return null;
      return revealedIndices[Math.floor(rng() * revealedIndices.length)] ?? null;
    };

    const resolveBunkerIndex = (
      payload: Record<string, unknown>,
      { allowRandom = false }: { allowRandom?: boolean } = {}
    ): { index: number } | ScenarioActionResult => {
      const rawIndex = payload.bunkerIndex;
      if (rawIndex === undefined || rawIndex === null || rawIndex === "") {
        if (!allowRandom) return scenarioError("classic.auto.064");
        const randomIndex = getRandomRevealedBunkerIndex();
        if (randomIndex === null) return scenarioError("classic.auto.059");
        return { index: randomIndex };
      }

      const index = Number(rawIndex);
      if (!Number.isInteger(index)) return scenarioError("classic.auto.048");
      if (index < 0 || index >= world.bunker.length) return scenarioError("classic.auto.048");
      if (!world.bunker[index]?.isRevealed) return scenarioError("classic.auto.034");
      return { index };
    };

    const pickBunkerReplacementCard = (excludeIds: Set<string>): WorldFacedCard | null => {
      if (bunkerReplacementPool.length === 0) return null;
      const candidateIndices = bunkerReplacementPool
        .map((card, index) => (!excludeIds.has(card.id) ? index : -1))
        .filter((index) => index >= 0);
      const sourceIndices =
        candidateIndices.length > 0 ? candidateIndices : bunkerReplacementPool.map((_, index) => index);
      const pickedIndex = sourceIndices[Math.floor(rng() * sourceIndices.length)];
      if (pickedIndex === undefined) return null;
      const [picked] = bunkerReplacementPool.splice(pickedIndex, 1);
      if (!picked) return null;
      return { ...picked, isRevealed: true };
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
      emitEvent("roundStart", "classic.auto.121", { v1: round });
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
          resolutionNoteKey = undefined;
          resolutionNoteVars = undefined;
          ctx.onStateChange?.();
          return;
        }
        startNextReveal();
        votingState = null;
        lastEliminated = undefined;
        resolutionNote = undefined;
        resolutionNoteKey = undefined;
        resolutionNoteVars = undefined;
        ctx.onStateChange?.();
      }, RESOLUTION_DELAY_MS);
    };

    const enterRevealDiscussion = () => {
      clearDiscussionTimer();
      phase = "reveal_discussion";
      votePhase = null;
      const roundComplete = isRoundComplete();
      const shouldVote = roundComplete && votesRemainingInRound > 0;
      if (shouldVote && settings.enablePreVoteDiscussionTimer && isAutoAutomation()) {
        scheduleTimer("pre_vote", settings.preVoteDiscussionSeconds, () => {
          if (phase !== "reveal_discussion") return;
          advanceAfterDiscussion();
          ctx.onStateChange?.();
        });
        return;
      }
      if (settings.enableRevealDiscussionTimer && isAutoAutomation()) {
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
        return scenarioError("classic.auto.104");
      }
      const threatModifier = getThreatModifierFromBunkerCards();
      if (index < 0 || index >= threatModifier.finalCount) {
        return scenarioError("classic.auto.049");
      }
      if (settings.finalThreatReveal === "host" && actorId !== ctx.hostId) {
        return scenarioError("classic.auto.095");
      }
      const target = world.threats[index];
      if (target.isRevealed) return { stateChanged: false };
      target.isRevealed = true;
      target.revealedBy = actorId;
      return { stateChanged: true };
    };

    const setBunkerOutcome = (actorId: string, outcome: PostGameOutcome): ScenarioActionResult => {
      if (phase !== "ended" || !postGame?.isActive) {
        return scenarioError("classic.auto.018");
      }
      if (actorId !== ctx.hostId) {
        return scenarioError("classic.auto.093");
      }
      if (postGame.outcome) {
        return scenarioError("classic.auto.024");
      }
      postGame.outcome = outcome;
      postGame.decidedBy = actorId;
      postGame.decidedAt = Date.now();
      emitEvent(
        "info",
        outcome === "survived"
          ? tClassic("classic.auto.105")
          : tClassic("classic.auto.106")
      );
      return { stateChanged: true };
    };

    const devSkipRound = (actorId: string): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.097");
      if (phase === "voting" || phase === "resolution") {
        return scenarioError("classic.auto.055");
      }
      if (phase === "ended") return scenarioError("classic.auto.019");

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
        {
          targetId?: string;
          status: "voted" | "not_voted" | "invalid";
          reason?: string;
          reasonKey?: string;
          reasonVars?: LocalizedVars;
          reasonCode?: VoteReasonCode;
          weight: number;
          submittedAt?: number;
        }
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
        let reasonKey = record.reasonKeyInvalid;
        let reasonVars = record.reasonVarsInvalid;
        let reasonCode = record.reasonCodeInvalid;
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
          reasonCode = reasonCode ?? "VOTE_BLOCKED";
        }
        if (targetId && state.revoteDisallowTargets.has(targetId)) {
          status = "invalid";
          reasonCode = reasonCode ?? "VOTE_TARGET_DISALLOWED";
        }
        if (targetId && !state.candidates.has(targetId)) {
          status = "invalid";
          reasonCode = reasonCode ?? "VOTE_TARGET_UNAVAILABLE";
        }
        if (targetId) {
          const targetPlayer = players.get(targetId);
          if (targetPlayer && targetPlayer.bannedAgainst.has(player.playerId)) {
            status = "invalid";
            reasonCode = reasonCode ?? "VOTE_BANNED_AGAINST_TARGET";
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
          reasonKey: reasonKey ?? getVoteReasonKey(reasonCode),
          reasonVars,
          reasonCode,
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
        markVoteWasted(votingState, voterId, undefined, "VOTE_SPENT");
      }
      for (const voterId of votingState.forcedSelfVoters) {
        markVoteForcedSelf(votingState, voterId, undefined);
      }
    };

    const startTieBreakRevote = (candidates: string[]) => {
      if (!votingState) return;
      votingState.tieBreakUsed = true;
      votingState.candidates = new Set(candidates);
      votingState.revoteDisallowTargets.clear();
      votingState.revoteDisallowByVoter.clear();
      resetVotesForRevote();
      votePhase = "voting";
      clearVoteWindowTimer();
      emitEvent("info", "classic.auto.061");
    };

    const finalizeVotingResolution = (): ScenarioActionResult => {
      if (!votingState) return scenarioError("classic.auto.015");
      clearVoteWindowTimer();
      const source = getVoteSource();
      if (!source) return scenarioError("classic.auto.056");

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
        const name = players.get(lastEliminated)?.name ?? tClassic("classic.auto.020");
        emitEvent("elimination", "classic.auto.122", { v1: name });
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
      emitEvent("info", "classic.auto.077");
      clearVoteWindowTimer();
      if (settings.enablePostVoteDiscussionTimer && isAutoAutomation()) {
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
        const choiceKind = resolveChoiceKind(def);
        if (choiceKind !== "none") {
          if (choiceKind === "bunker" && getRevealedBunkerIndices().length === 0) {
            condition.used = true;
            emitEvent("info", "classic.auto.123", { v1: def.title });
            continue;
          }
          condition.pendingActivation = true;
          if (!condition.revealedPublic) {
            condition.revealedPublic = true;
          }
          emitEvent("info", "classic.auto.124", { v1: player.name, v2: def.title });
          continue;
        }
        const result = applySpecialEffect(player, condition, {});
        if (result.error) {
          emitEvent("info", "classic.auto.125", { v1: def.title, v2: result.error });
          continue;
        }
        if (!condition.revealedPublic) {
          condition.revealedPublic = true;
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
            const becamePublic = !condition.revealedPublic;
            condition.revealedPublic = true;
            condition.used = true;
            player.forcedWastedVoteNext = true;
            if (becamePublic) {
              emitEvent("info", "classic.auto.126", { v1: player.name, v2: def.title });
            } else {
              emitEvent("info", "classic.auto.127", { v1: def.title, v2: player.name });
            }
          }
        }
      }
    };

    const applyElimination = (targetId: string) => {
      const target = players.get(targetId);
      if (!target || target.status !== "alive") return;

      // Evaluate secret_onEliminate conditions against pre-elimination table state.
      handleSecretEliminationTriggers(targetId);
      target.status = "eliminated";
      consumeRoundElimination();
      totalExiles += 1;
      lastEliminated = targetId;
      resolutionNote = tClassicFmt("classic.auto.128", { v1: target.name });
      resolutionNoteKey = "classic.auto.128";
      resolutionNoteVars = { v1: target.name };

      handleOnOwnerEliminated(target);
    };

    const markLeftBunker = (targetId: string): ScenarioActionResult => {
      const target = players.get(targetId);
      if (!target || target.status === "left_bunker") return scenarioError("classic.auto.021");
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
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.094");
      if (phase === "ended") return scenarioError("classic.auto.019");
      const target = players.get(targetId);
      if (!target) return scenarioError("classic.auto.021");
      if (target.status !== "alive") return scenarioError("classic.auto.022");

      applyElimination(targetId);
      emitEvent("elimination", "classic.auto.129", { v1: target.name });
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

    const pickDeckCard = (
      deckName: string,
      replacementMode: "random" | "specific",
      replacementCardId?: string
    ): { card: AssetCard } | ScenarioActionResult => {
      const deckId = resolveDeckIdByLabel(deckName) ?? deckName;
      const deck = deckAccess.getDeckCards(deckId, deckName);
      if (deck.length === 0) {
        return scenarioError("classic.auto.130", { v1: deckName });
      }
      if (replacementMode === "specific") {
        const requested = String(replacementCardId ?? "").trim();
        if (!requested) return scenarioError("classic.auto.035");
        const selected = deck.find((card) => card.id === requested);
        if (!selected) return scenarioError("classic.auto.011");
        return { card: selected };
      }
      const selected = deck[Math.floor(rng() * deck.length)] ?? null;
      if (!selected) return scenarioError("classic.auto.038");
      return { card: selected };
    };

    const adminReplacePlayerCard = (
      actorId: string,
      payload: {
        targetPlayerId: string;
        cardInstanceId: string;
        targetArea?: "hand" | "special";
        replacementMode: "random" | "specific";
        replacementCardId?: string;
      }
    ): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.089");
      const target = players.get(payload.targetPlayerId);
      if (!target) return scenarioError("classic.auto.021");
      const targetArea = payload.targetArea === "special" ? "special" : "hand";

      if (targetArea === "special") {
        const special = target.specialConditions.find(
          (entry) => entry.instanceId === payload.cardInstanceId
        );
        if (!special) return scenarioError("classic.auto.071");
        const definition =
          payload.replacementMode === "specific"
            ? findSpecialDefinitionForAdmin(String(payload.replacementCardId ?? ""))
            : IMPLEMENTED_SPECIALS[Math.floor(rng() * IMPLEMENTED_SPECIALS.length)] ?? null;
        if (!definition) return scenarioError("classic.auto.037");
        if (!definition.implemented) return scenarioError("classic.auto.012");
        special.definition = definition;
        special.used = false;
        special.pendingActivation =
          Boolean(special.revealedPublic) && definition.trigger === "onOwnerEliminated";
        special.imgUrl = resolveSpecialImgUrl(definition, specialImageIndex);
        emitEvent("info", "classic.auto.131", { v1: target.name });
        return { stateChanged: true };
      }

      const card = target.hand.find((entry) => entry.instanceId === payload.cardInstanceId);
      if (!card) return scenarioError("classic.auto.030");
      const picked = pickDeckCard(card.deck, payload.replacementMode, payload.replacementCardId);
      if (!("card" in picked)) return picked;
      card.id = picked.card.id;
      card.labelShort = picked.card.labelShort;
      card.missing = false;
      emitEvent("info", "classic.auto.132", { v1: target.name, v2: card.deck });
      return { stateChanged: true };
    };

    const detectWorldDeckName = (kind: "bunker" | "threat" | "disaster"): string | null => {
      const entries = Object.entries(ctx.assets.decks ?? {});
      if (entries.length === 0) return null;
      const worldIds =
        kind === "bunker"
          ? new Set(world.bunker.map((card) => card.id))
          : kind === "threat"
            ? new Set(world.threats.map((card) => card.id))
            : new Set([world.disaster.id]);
      let bestDeck: string | null = null;
      let bestScore = -1;
      for (const [deckName, cards] of entries) {
        let score = 0;
        for (const card of cards) {
          if (worldIds.has(card.id)) score += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          bestDeck = deckName;
        }
      }
      if (bestDeck) return bestDeck;
      return entries[0]?.[0] ?? null;
    };

    const adminSetWorldCardReveal = (
      actorId: string,
      payload: { kind: "bunker" | "threat"; index: number; revealed: boolean }
    ): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.090");
      const index = Number(payload.index);
      if (!Number.isInteger(index) || index < 0) return scenarioError("classic.auto.051");
      const list = payload.kind === "bunker" ? world.bunker : world.threats;
      const target = list[index];
      if (!target) return scenarioError("classic.auto.031");
      target.isRevealed = Boolean(payload.revealed);
      emitEvent("info", "classic.auto.133", { v1: target.isRevealed ? tClassic("classic.auto.075") : tClassic("classic.auto.082"), v2: payload.kind });
      return { stateChanged: true };
    };

    const adminReplaceWorldCard = (
      actorId: string,
      payload: {
        kind: "bunker" | "threat" | "disaster";
        index?: number;
        replacementMode: "random" | "specific";
        replacementCardId?: string;
      }
    ): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.090");
      const deckName = detectWorldDeckName(payload.kind);
      if (!deckName) return scenarioError("classic.auto.040");
      const picked = pickDeckCard(deckName, payload.replacementMode, payload.replacementCardId);
      if (!("card" in picked)) return picked;

      if (payload.kind === "disaster") {
        world.disaster.id = picked.card.id;
        world.disaster.title = picked.card.labelShort;
        world.disaster.description = picked.card.labelShort;
        world.disaster.imageId = picked.card.id;
      } else {
        const index = Number(payload.index);
        if (!Number.isInteger(index) || index < 0) return scenarioError("classic.auto.051");
        const list = payload.kind === "bunker" ? world.bunker : world.threats;
        const target = list[index];
        if (!target) return scenarioError("classic.auto.031");
        target.id = picked.card.id;
        target.title = picked.card.labelShort;
        target.description = picked.card.labelShort;
        target.imageId = picked.card.id;
      }
      emitEvent("info", "classic.auto.134", { v1: payload.kind });
      return { stateChanged: true };
    };

    const adminSetWorldCount = (
      actorId: string,
      payload: { kind: "bunker" | "threat"; count: number }
    ): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.091");
      const count = Number(payload.count);
      if (!Number.isInteger(count) || count < 0) return scenarioError("classic.auto.050");
      if (payload.kind === "bunker") {
        world.counts.bunker = Math.max(0, Math.min(world.bunker.length, count));
      } else {
        world.counts.threats = Math.max(0, Math.min(world.threats.length, count));
      }
      emitEvent("info", "classic.auto.135", { v1: payload.kind, v2: count });
      return { stateChanged: true };
    };

    const findSpecialDefinitionForAdmin = (specialIdRaw: string) => {
      const lookup = String(specialIdRaw ?? "").trim();
      if (!lookup) return null;
      const normalized = normalizeSpecialLookup(lookup);
      const byId = SPECIAL_DEFINITIONS.find(
        (definition) =>
          normalizeSpecialLookup(definition.id) === normalized ||
          normalizeSpecialLookup(toSpecialFileName(definition.id)) === normalized
      );
      if (byId) return byId;
      const byFile = SPECIAL_DEFINITIONS.find(
        (definition) =>
          normalizeSpecialLookup(definition.file) === normalized ||
          normalizeSpecialLookup(toSpecialFileName(definition.file)) === normalized
      );
      if (byFile) return byFile;
      const byTitle = SPECIAL_DEFINITIONS.find(
        (definition) => normalizeSpecialLookup(definition.title) === normalized
      );
      return byTitle ?? null;
    };

    const adminApplySpecial = (
      actorId: string,
      payload: {
        actorPlayerId: string;
        specialInstanceId?: string;
        specialId?: string;
        payload?: Record<string, unknown>;
      }
    ): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("classic.auto.092");
      const sourcePlayer = players.get(payload.actorPlayerId);
      if (!sourcePlayer) return scenarioError("classic.auto.023");
      const effectivePayload = (payload.payload ?? {}) as Record<string, unknown>;
      const specialInstanceId = String(payload.specialInstanceId ?? "").trim();
      if (specialInstanceId) {
        const special = sourcePlayer.specialConditions.find((item) => item.instanceId === specialInstanceId);
        const result = applySpecial(sourcePlayer, specialInstanceId, effectivePayload);
        if (result.error) return result;
        emitEvent(
          "info",
          tClassicFmt("classic.auto.136", { v1: sourcePlayer.name, v2: special ? `: ${special.definition.title}` : "" })
        );
        return result.stateChanged ? { stateChanged: true } : result;
      }

      const specialId = String(payload.specialId ?? "").trim();
      if (!specialId) return scenarioError("classic.auto.068");
      const definition = findSpecialDefinitionForAdmin(specialId);
      if (!definition) return scenarioError("classic.auto.087");
      if (!definition.implemented) return scenarioError("classic.auto.013");

      const tempSpecial: SpecialConditionState = {
        instanceId: `admin-special-${sourcePlayer.playerId}-${Date.now()}`,
        definition,
        used: false,
        revealedPublic: true,
        pendingActivation: false,
        imgUrl: resolveSpecialImgUrl(definition, specialImageIndex),
      };
      const result = applySpecialEffect(sourcePlayer, tempSpecial, effectivePayload);
      if (result.error) return result;
      emitEvent(
        "info",
        sourcePlayer.playerId === ctx.hostId
          ? tClassicFmt("classic.auto.137", { v1: definition.title })
          : tClassicFmt("classic.auto.138", { v1: definition.title, v2: sourcePlayer.name })
      );
      return { stateChanged: true };
    };

    const revealCard = (player: PlayerState, cardId: string): ScenarioActionResult => {
      if (phase === "ended") {
        if (player.status === "left_bunker") {
          return scenarioError("classic.auto.008");
        }
        const cardEnded = getCardByInstanceId(player, cardId);
        if (!cardEnded) return scenarioError("classic.auto.032");
        if (cardEnded.revealed) return scenarioError("classic.auto.111");
        cardEnded.revealed = true;
        return { stateChanged: true };
      }

      if (phase !== "reveal") return scenarioError("classic.auto.079");
      if (currentTurnPlayerId && player.playerId !== currentTurnPlayerId) {
        return scenarioError("classic.auto.081");
      }
      if (player.revealedThisRound) return scenarioError("classic.auto.010");

      const card = getCardByInstanceId(player, cardId);
      if (!card) return scenarioError("classic.auto.032");
      if (card.revealed) return scenarioError("classic.auto.111");

      if (roundRules.forcedRevealCategory) {
        const forcedCategory = roundRules.forcedRevealCategory;
        const deckInfo = CATEGORY_LABEL_TO_DECK[forcedCategory];
        const hasForcedHidden = deckInfo
          ? player.hand.some(
              (entry) =>
                cardMatchesDeck(entry, deckInfo.deck) &&
                (!deckInfo.slotKey || entry.slotKey === deckInfo.slotKey) &&
                !entry.revealed
            )
          : player.hand.some((entry) => cardMatchesDeck(entry, forcedCategory) && !entry.revealed);
        const matchesForced = deckInfo
          ? cardMatchesDeck(card, deckInfo.deck) && (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey)
          : cardMatchesDeck(card, forcedCategory);
        if (hasForcedHidden && !matchesForced) {
          return scenarioError("classic.auto.139", { v1: forcedCategory });
        }
      }

      card.revealed = true;
      player.revealedThisRound = true;
      lastRevealerId = player.playerId;

      if (cardMatchesDeck(card, DECK_IDS.health) && !firstHealthRevealPlayerId) {
        firstHealthRevealPlayerId = player.playerId;
      }
      emitEvent("info", "classic.auto.140", { v1: player.name });
      enterRevealDiscussion();
      return { stateChanged: true };
    };

    const continueRound = (player: PlayerState): ScenarioActionResult => {
      if (phase !== "reveal_discussion") return scenarioError("classic.auto.078");
      if (continuePermission === "host_only" && player.playerId !== ctx.hostId) {
        return scenarioError("classic.auto.096");
      }
      if (continuePermission === "revealer_only" && player.playerId !== lastRevealerId) {
        return scenarioError("classic.auto.074");
      }
      advanceAfterDiscussion();
      return { stateChanged: true };
    };

    const applySpecial = (
      player: PlayerState,
      specialInstanceId: string,
      payload: Record<string, unknown>
    ): ScenarioActionResult => {
      if (player.status !== "alive") return scenarioError("classic.auto.006");
      const special = player.specialConditions.find((item) => item.instanceId === specialInstanceId);
      if (!special) return scenarioError("classic.auto.072");
      if (!special.definition.implemented) return scenarioError("classic.auto.108");
      if (special.used) return scenarioError("classic.auto.110");

      const trigger = special.definition.trigger;
      if (trigger === "secret_onEliminate") {
        return scenarioError("classic.auto.109");
      }
      if (trigger === "onOwnerEliminated") {
        return scenarioError("classic.auto.114");
      }
      if (settings.specialUsage === "only_during_voting" && phase !== "voting") {
        return scenarioError("classic.auto.073");
      }

      const choiceKind = resolveChoiceKind(special.definition);
      const targetScope = getTargetScope(special.definition);
      const effectivePayload = { ...payload } as Record<string, unknown>;

      if (choiceKind !== "none" && Object.keys(payload).length === 0) {
        return scenarioError("classic.auto.062");
      }

      if (targetScope) {
        if (targetScope === "neighbors") {
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if (!("neighborId" in neighborChoice)) return neighborChoice;
          effectivePayload.targetPlayerId = neighborChoice.neighborId;
          effectivePayload.side = neighborChoice.side;
        } else if (targetScope === "self") {
          effectivePayload.targetPlayerId = player.playerId;
        } else {
          const candidates = getTargetCandidatesFor(targetScope, player.playerId);
          if (candidates.length === 0) return scenarioError("classic.auto.058");
          const targetId = String(payload.targetPlayerId ?? "");
          if (!targetId) return scenarioError("classic.auto.069");
          if (!candidates.includes(targetId)) return scenarioError("classic.auto.041");
        }
      }

      if (choiceKind === "player") {
        const targetId = String(effectivePayload.targetPlayerId ?? "");
        if (targetId && !allowsSelfTarget(special.definition) && targetId === player.playerId) {
          return scenarioError("classic.auto.052");
        }
      }

      const requiresError = validateRequires(player, special, effectivePayload);
      if (requiresError) return requiresError;

      const result = applySpecialEffect(player, special, effectivePayload);
      if (result.error) return result;

      let changed = Boolean(result.stateChanged);
      if (!special.revealedPublic) {
        special.revealedPublic = true;
        emitEvent("info", "classic.auto.141", { v1: player.name, v2: special.definition.title });
        changed = true;
      }

      return changed ? { stateChanged: true } : result;
    };

    const validateRequires = (
      player: PlayerState,
      special: SpecialConditionState,
      payload: Record<string, unknown>
    ): ScenarioActionResult | null => {
      const requires = special.definition.requires ?? [];
      for (const requirement of requires) {
        if (requirement === "phase=voting" && phase !== "voting") {
          return scenarioError("classic.auto.112");
        }
        if (requirement === "phase=reveal" && phase !== "reveal" && phase !== "voting") {
          return scenarioError("classic.auto.113");
        }
        if (requirement === "votingStarted" && (!votingState || votingState.votes.size === 0)) {
          return scenarioError("classic.auto.014");
        }
        if (requirement === "targetHasBaggage") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasBaggage = target ? getAnyCardsByCategory(target, "baggage").length > 0 : false;
          if (!target || !hasBaggage) return scenarioError("classic.auto.098");
        }
        if (requirement === "targetHasRevealedHealth") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasRevealed = target ? getRevealedCardsByCategory(target, "health").length > 0 : false;
          if (!target || !hasRevealed) return scenarioError("classic.auto.099");
        }
        if (requirement === "targetHasRevealedProfession") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasRevealed = target ? getRevealedCardsByCategory(target, "profession").length > 0 : false;
          if (!target || !hasRevealed) return scenarioError("classic.auto.100");
        }
        if (requirement === "targetHasRevealedSameCategory") {
          const categoryKey = String(special.definition.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return scenarioError("classic.auto.045");
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if (!("neighborId" in neighborChoice)) return neighborChoice;
          const neighbor = players.get(neighborChoice.neighborId);
          if (!neighbor) return scenarioError("classic.auto.086");
          const hasRevealed = getRevealedCardsByCategory(neighbor, deckName).length > 0;
          if (!hasRevealed) return scenarioError("classic.auto.101");
        }
        if (requirement === "needsNeighborIndexing") {
          if (playerOrder.length <= 1) return scenarioError("classic.auto.044");
        }
        if (requirement === "ageFieldAvailable") {
          const ages = alivePlayers().map((p) => getRevealedAge(p)).filter((age) => age !== null);
          if (ages.length === 0) return scenarioError("classic.auto.004");
        }
        if (requirement === "someRevealedAges") {
          const ages = alivePlayers().map((p) => getRevealedAge(p)).filter((age) => age !== null);
          if (ages.length === 0) return scenarioError("classic.auto.004");
        }
        if (requirement === "trackFirstRevealHealth") {
          if (!firstHealthRevealPlayerId) return scenarioError("classic.auto.017");
        }
      }
      return null;
    };

    const addSpecialToPlayer = (target: PlayerState): ScenarioActionResult | null => {
      const def = drawSpecialFromPool();
      if (!def) return scenarioError("classic.auto.002");
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
      if (!def.implemented) return scenarioError("classic.auto.108");
      if (special.used) return scenarioError("classic.auto.110");

      const requiresError = validateRequires(player, special, payload);
      if (requiresError) return requiresError;

      const canTargetSelf = allowsSelfTarget(def);
      const effectType = def.effect.type;
      const votingWindowEffects = new Set([
        "banVoteAgainst",
        "disableVote",
        "voteWeight",
        "forceRevote",
        "doubleVotesAgainst_and_disableSelfVote",
      ]);
      // During voting we allow applying any implemented special at any voting sub-phase.
      if (votingWindowEffects.has(effectType) && phase !== "voting") {
        return scenarioError("classic.auto.080");
      }
      if (votingWindowEffects.has(effectType) && votingState?.disabledVoters.has(player.playerId)) {
        return scenarioError("classic.auto.003");
      }

      switch (effectType) {
        case "banVoteAgainst": {
          if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("classic.auto.107");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("classic.auto.052");
          player.bannedAgainst.add(targetId);
          special.used = true;
          emitEvent("info", "classic.auto.142", { v1: player.name, v2: def.title });
          return { stateChanged: true };
        }
        case "voteWeight": {
          if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
          const weight = Number(def.effect.params?.weight ?? 2);
          votingState.voteWeights.set(player.playerId, weight);
          special.used = true;
          emitEvent("info", "classic.auto.143", { v1: player.name });
          return { stateChanged: true };
        }
        case "disableVote": {
          if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("classic.auto.107");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("classic.auto.052");
          markVoteWasted(votingState, targetId, undefined, "VOTE_BLOCKED");
          special.used = true;
          emitEvent("info", "classic.auto.144", { v1: player.name, v2: target.name });
          return { stateChanged: true };
        }
        case "doubleVotesAgainst_and_disableSelfVote": {
          if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("classic.auto.107");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("classic.auto.052");
          votingState.doubleAgainstTarget = targetId;
          markVoteWasted(votingState, player.playerId, undefined, "VOTE_SPENT");
          special.used = true;
          emitEvent("info", "classic.auto.145", { v1: player.name, v2: target.name });
          return { stateChanged: true };
        }
        case "forceRevote": {
          if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
          const source = getVoteSource();
          if (!source) return scenarioError("classic.auto.056");
          if (def.effect.params?.disallowPreviousCandidate) {
            const disallowByVoter = new Map<string, string>();
            for (const [voterId, record] of source.entries()) {
              if (!record.isValid || !record.targetId) continue;
              if (!votingState.candidates.has(record.targetId)) continue;
              disallowByVoter.set(voterId, record.targetId);
            }
            votingState.revoteDisallowByVoter = disallowByVoter;
            votingState.revoteDisallowTargets.clear();
          } else {
            votingState.revoteDisallowByVoter.clear();
          }
          resetVotesForRevote();
          votePhase = "voting";
          clearVoteWindowTimer();
          special.used = true;
          emitEvent("info", "classic.auto.146", { v1: player.name });
          return { stateChanged: true };
        }
        case "swapRevealedWithNeighbor": {
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
			if (!("neighborId" in neighborChoice)) return neighborChoice;

			const categoryKey = String(def.effect.params?.category ?? "");
			const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
			if (!deckName) return scenarioError("classic.auto.045");

			const neighbor = players.get(neighborChoice.neighborId);
			if (!neighbor) return scenarioError("classic.auto.086");

          const targetCardInstanceId = String(payload.targetCardInstanceId ?? "");
          const sourceCardInstanceId = String(payload.sourceCardInstanceId ?? "");
          const yourCard = getSelectedRevealedCard(player, categoryKey, sourceCardInstanceId);
          const theirCard = getSelectedRevealedCard(neighbor, categoryKey, targetCardInstanceId);
          if (!yourCard || !theirCard) {
            return scenarioError("classic.auto.067");
          }

          const temp = { id: yourCard.id, labelShort: yourCard.labelShort, missing: yourCard.missing };
          yourCard.id = theirCard.id;
          yourCard.labelShort = theirCard.labelShort;
          yourCard.missing = theirCard.missing;
          theirCard.id = temp.id;
          theirCard.labelShort = temp.labelShort;
          theirCard.missing = temp.missing;

          special.used = true;
          emitEvent("info", "classic.auto.147", { v1: player.name, v2: neighbor.name });
          return { stateChanged: true };
        }
        case "replaceRevealedCard": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!target || target.status !== "alive") return scenarioError("classic.auto.107");
          if (!deckName) return scenarioError("classic.auto.045");

          const targetCardInstanceId = String(payload.targetCardInstanceId ?? "");
          const revealedCard = getSelectedRevealedCard(target, categoryKey, targetCardInstanceId);
          if (!revealedCard) return scenarioError("classic.auto.103");

          const newCard = drawCardFromDeck(deckName, deckPools, rng);
          if (!newCard) return scenarioError("classic.auto.148", { v1: deckName });

          revealedCard.id = newCard.id;
          revealedCard.labelShort = newCard.labelShort;
          revealedCard.missing = false;

          special.used = true;
          emitEvent("info", "classic.auto.149", { v1: player.name, v2: target.name });
          return { stateChanged: true };
        }
        case "discardRevealedAndDealHidden": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!target || target.status !== "alive") return scenarioError("classic.auto.107");
          if (!deckName) return scenarioError("classic.auto.045");

          const targetCardInstanceId = String(payload.targetCardInstanceId ?? "");
          const revealedCard = getSelectedRevealedCard(target, categoryKey, targetCardInstanceId);
          if (!revealedCard) return scenarioError("classic.auto.103");

          const newCard = drawCardFromDeck(deckName, deckPools, rng);
          if (!newCard) return scenarioError("classic.auto.148", { v1: deckName });

          revealedCard.id = newCard.id;
          revealedCard.labelShort = newCard.labelShort;
          revealedCard.missing = false;
          revealedCard.revealed = false;

          special.used = true;
          emitEvent("info", "classic.auto.150", { v1: player.name, v2: target.name });
          return { stateChanged: true };
        }
        case "redealAllRevealed": {
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return scenarioError("classic.auto.045");

          const revealedSlots: CardState[] = [];
          for (const target of alivePlayers()) {
            revealedSlots.push(...getRevealedCardsByCategory(target, categoryKey));
          }
          if (revealedSlots.length === 0) return scenarioError("classic.auto.060");

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
          emitEvent("info", "classic.auto.151", { v1: player.name, v2: deckName });
          return { stateChanged: true };
        }
        case "replaceBunkerCard": {
          const resolved = resolveBunkerIndex(payload);
          if (!("index" in resolved)) return resolved;
          const target = world.bunker[resolved.index];
          if (!target?.isRevealed) return scenarioError("classic.auto.034");

          const occupiedIds = new Set(
            world.bunker.map((card) => card.id).filter((id): id is string => Boolean(id))
          );
          const replacement = pickBunkerReplacementCard(occupiedIds);
          if (!replacement) return scenarioError("classic.auto.057");

          target.id = replacement.id;
          target.title = replacement.title;
          target.description = replacement.description;
          target.text = replacement.text;
          target.imageId = replacement.imageId;
          target.isRevealed = true;
          target.revealedBy = player.playerId;
          target.revealedAtRound = target.revealedAtRound ?? round;

          special.used = true;
          emitEvent("info", "classic.auto.152", { v1: player.name });
          return { stateChanged: true };
        }
        case "discardBunkerCard": {
          const resolved = resolveBunkerIndex(payload, { allowRandom: true });
          if (!("index" in resolved)) return resolved;
          const target = world.bunker[resolved.index];
          if (!target?.isRevealed) return scenarioError("classic.auto.034");

          target.id = `bunker-discarded-${Date.now()}-${Math.floor(rng() * 1_000_000)}`;
          target.title = tClassic("classic.auto.028");
          target.description = tClassic("classic.auto.027");
          target.text = undefined;
          target.imageId = undefined;
          target.isRevealed = true;
          target.revealedBy = player.playerId;
          target.revealedAtRound = target.revealedAtRound ?? round;

          special.used = true;
          emitEvent("info", "classic.auto.153", { v1: def.title });
          return { stateChanged: true };
        }
        case "stealBunkerCardToExiled": {
          const resolved = resolveBunkerIndex(payload, { allowRandom: true });
          if (!("index" in resolved)) return resolved;
          const target = world.bunker[resolved.index];
          if (!target?.isRevealed) return scenarioError("classic.auto.034");

          target.id = `bunker-stolen-${Date.now()}-${Math.floor(rng() * 1_000_000)}`;
          target.title = tClassic("classic.auto.029");
          target.description = tClassic("classic.auto.026");
          target.text = undefined;
          target.imageId = undefined;
          target.isRevealed = true;
          target.revealedBy = player.playerId;
          target.revealedAtRound = target.revealedAtRound ?? round;

          special.used = true;
          emitEvent("info", "classic.auto.154", { v1: def.title });
          return { stateChanged: true };
        }
        case "forceRevealCategoryForAll": {
          const category = String(payload.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[category] ?? category;
          if (!deckName) return scenarioError("classic.auto.065");
          const forcedLabel =
            category === "facts1"
              ? FACTS_LABELS.facts1
              : category === "facts2"
                ? FACTS_LABELS.facts2
                : deckName;
          roundRules.forcedRevealCategory = forcedLabel;
          special.used = true;
          emitEvent("info", "classic.auto.155", { v1: player.name, v2: forcedLabel });
          return { stateChanged: true };
        }
        case "setRoundRule": {
          roundRules.noTalkUntilVoting = Boolean(def.effect.params?.noTalkUntilVoting ?? true);
          special.used = true;
          emitEvent("info", "classic.auto.156", { v1: player.name });
          return { stateChanged: true };
        }
        case "stealBaggage_and_giveSpecial": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("classic.auto.107");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("classic.auto.052");

          const targetBaggage = getAnyCardsByCategory(target, "baggage");
          if (targetBaggage.length === 0) return scenarioError("classic.auto.102");
          const requestedBaggageCardId = String(payload.baggageCardId ?? "");
          const stolenCard =
            (requestedBaggageCardId
              ? targetBaggage.find((card) => card.instanceId === requestedBaggageCardId)
              : targetBaggage[0]) ?? null;
          if (!stolenCard) return scenarioError("classic.auto.066");

          const giveCount = Number(def.effect.params?.giveSpecialCount ?? 1);
          if (specialPool.length < giveCount) {
            return scenarioError("classic.auto.002");
          }
          target.hand = target.hand.filter((card) => card !== stolenCard);
          player.hand.push({ ...stolenCard, instanceId: makeCardInstanceId(player.playerId) });

          const specialAssetId =
            special.imgUrl && special.imgUrl.startsWith("/assets/")
              ? special.imgUrl.slice("/assets/".length)
              : def.file
                ? `decks/${def.file.replace(/\\/g, "/")}`
                : "";
          target.hand.push({
            instanceId: makeCardInstanceId(target.playerId),
            id: specialAssetId,
            deck: DECK_LABELS.baggage,
            labelShort: def.title,
            revealed: false,
            missing: !specialAssetId,
            publicBackCategory: SPECIAL_CATEGORY,
          });

          for (let i = 0; i < giveCount; i += 1) {
            const error = addSpecialToPlayer(target);
            if (error) return error;
          }

          player.specialConditions = player.specialConditions.filter(
            (item) => item.instanceId !== special.instanceId
          );
          player.specialCategoryProxyCards = [
            {
              labelShort: stolenCard.labelShort,
              imgUrl: stolenCard.revealed && stolenCard.id ? `/assets/${stolenCard.id}` : undefined,
              hidden: !stolenCard.revealed,
              backCategory: DECK_LABELS.baggage,
            },
          ];

          special.used = true;
          emitEvent("info", "classic.auto.157", { v1: player.name, v2: target.name });
          return { stateChanged: true };
        }
        case "addFinalThreat": {
          const threatKey = String(def.effect.params?.threatKey ?? def.id);
          finalThreats.push(threatKey);
          special.used = true;
          emitEvent("info", "classic.auto.158", { v1: player.name });
          return { stateChanged: true };
        }
        default:
          return scenarioError("classic.auto.115");
      }
    };

    const vote = (player: PlayerState, targetId: string): ScenarioActionResult => {
      if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
      if (votePhase !== "voting") return scenarioError("classic.auto.076");
      if (targetId === player.playerId) return scenarioError("classic.auto.053");
      if (!votingState.candidates.has(targetId)) return scenarioError("classic.auto.042");
      if (votingState.votes.has(player.playerId)) return scenarioError("classic.auto.009");
      if (votingState.revoteDisallowTargets.has(targetId)) return scenarioError("classic.auto.054");
      if (votingState.revoteDisallowByVoter.get(player.playerId) === targetId) {
        return scenarioError("classic.auto.063");
      }

      const target = players.get(targetId);
      if (!target || target.status !== "alive") return scenarioError("classic.auto.025");
      if (target.bannedAgainst.has(player.playerId)) {
        return scenarioError("classic.auto.007");
      }
      if (votingState.disabledVoters.has(player.playerId)) {
        return scenarioError("classic.auto.003");
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
      if (isManualAutomation()) {
        emitEvent("info", "classic.auto.005");
        return { stateChanged: true };
      }
      enterVoteSpecialWindow();
      return { stateChanged: true };
    };

    const finalizeVotingWindow = (): ScenarioActionResult => {
      if (phase !== "voting" || !votingState) return scenarioError("classic.auto.080");
      if (votePhase === "voting") {
        enterVoteSpecialWindow();
        return { stateChanged: true };
      }
      if (votePhase !== "voteSpecialWindow") return scenarioError("classic.auto.070");
      clearVoteWindowTimer();
      return finalizeVotingResolution();
    };


    const toCardRef = (card: CardState): CardRef => ({
      id: card.id,
      deck: card.deck,
      instanceId: card.instanceId,
      labelShort: card.labelShort,
      imgUrl: card.id ? `/assets/${card.id}` : undefined,
      missing: card.missing,
    });

    const toHandCard = (card: CardState): CardInHand => ({
      id: card.id,
      deck: card.deck,
      instanceId: card.instanceId,
      labelShort: card.labelShort,
      imgUrl: card.id ? `/assets/${card.id}` : undefined,
      missing: card.missing,
      revealed: card.revealed,
    });

    const buildPublicCategories = (player: PlayerState): PublicCategorySlot[] => {
      return CATEGORY_ORDER.map((category) => {
        if (category === SPECIAL_CATEGORY) {
          const revealedSpecialCards: PublicCategorySlot["cards"] = player.specialConditions
            .filter((condition) => condition.revealedPublic)
            .map((condition) => ({
              labelShort: condition.definition.title,
              imgUrl: condition.imgUrl ?? buildSpecialImgUrl(condition.definition.file),
              instanceId: condition.instanceId,
              hidden: false,
              backCategory: SPECIAL_CATEGORY,
            }));
          const proxySpecialCards: PublicCategorySlot["cards"] = player.specialCategoryProxyCards.map(
            (card, index) => ({
              labelShort: card.labelShort,
              imgUrl: card.imgUrl,
              instanceId: `proxy-special-${player.playerId}-${index}`,
              hidden: card.hidden ?? false,
              backCategory: card.backCategory ?? SPECIAL_CATEGORY,
            })
          );
          const cards: PublicCategorySlot["cards"] = revealedSpecialCards.concat(proxySpecialCards);
          return {
            category,
            status: cards.some((card) => !card.hidden) ? "revealed" : "hidden",
            cards,
          };
        }
        const deck = CATEGORY_KEY_TO_DECK[category];
        const slotKey = CATEGORY_KEY_TO_SLOT[category];
        const deckInfo = deck ? { deck, slotKey } : undefined;
        if (!deckInfo) {
          return { category, status: "hidden", cards: [] };
        }
        const allCards = player.hand.filter(
          (card) =>
            cardMatchesDeck(card, deckInfo.deck) &&
            (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey)
        );
        const revealedCards = allCards.filter((card) => card.revealed);
        const hiddenCards = allCards.filter((card) => !card.revealed);
        const cards = [
          ...revealedCards.map((card) => ({
            labelShort: card.labelShort,
            imgUrl: card.id ? `/assets/${card.id}` : undefined,
            instanceId: card.instanceId,
            hidden: false,
          })),
          ...hiddenCards.map((card) => ({
            labelShort: tClassic("classic.auto.083"),
            instanceId: card.instanceId,
            hidden: true,
            backCategory: card.publicBackCategory ?? category,
          })),
        ];
        return {
          category,
          status: revealedCards.length > 0 ? "revealed" : "hidden",
          cards,
        };
      });
    };

    const buildYouCategories = (player: PlayerState): YouCategorySlot[] => {
      return CATEGORY_ORDER.filter((category) => category !== SPECIAL_CATEGORY).map((category) => {
        const deck = CATEGORY_KEY_TO_DECK[category];
        const slotKey = CATEGORY_KEY_TO_SLOT[category];
        const deckInfo = deck ? { deck, slotKey } : undefined;
        const cards = deckInfo
          ? player.hand
              .filter(
                (card) =>
                  cardMatchesDeck(card, deckInfo.deck) && (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey)
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
        imgUrl: condition.imgUrl ?? buildSpecialImgUrl(condition.definition.file),
        needsChoice: resolveChoiceKind(condition.definition) !== "none",
        choiceKind: resolveChoiceKind(condition.definition),
        pendingActivation: condition.pendingActivation ?? false,
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
            targetName: players.get(info.targetId)?.name ?? tClassic("classic.auto.046"),
            status: "voted" as const,
            reason: info.reason,
            reasonKey: info.reasonKey,
            reasonVars: info.reasonVars,
            reasonCode: info.reasonCode,
            weight: info.weight,
            submittedAt: info.submittedAt,
          };
        }
        return {
          voterId: player.playerId,
          voterName: player.name,
          status: info.status === "invalid" ? ("invalid" as const) : ("not_voted" as const),
          reason: info.reason,
          reasonKey: info.reasonKey,
          reasonVars: info.reasonVars,
          reasonCode: info.reasonCode,
          weight: info.weight,
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
            specialCategoryProxyCards: [],
            bannedAgainst: new Set(),
            forcedWastedVoteNext: false,
          } satisfies PlayerState);

        const revealedThisRound = alivePlayers()
          .filter((p) => p.revealedThisRound)
          .map((p) => p.playerId);
        const disallowedVoteTargetIdsForYou = (() => {
          if (!votingState || votePhase !== "voting") return undefined;
          const restricted = new Set<string>();
          const perVoterTarget = votingState.revoteDisallowByVoter.get(playerId);
          if (perVoterTarget) restricted.add(perVoterTarget);
          for (const candidateId of votingState.revoteDisallowTargets) {
            restricted.add(candidateId);
          }
          for (const candidateId of votingState.candidates) {
            const candidate = players.get(candidateId);
            if (candidate?.bannedAgainst.has(playerId)) {
              restricted.add(candidateId);
            }
          }
          return restricted.size > 0 ? Array.from(restricted) : undefined;
        })();

        return {
          phase,
          round,
          categoryOrder: CATEGORY_ORDER.slice(),
          lastStageText,
          lastStageTextKey,
          lastStageTextVars,
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
            disallowedVoteTargetIdsForYou,
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
            resolutionNoteKey,
            resolutionNoteVars,
            roundRules: {
              noTalkUntilVoting: roundRules.noTalkUntilVoting,
              forcedRevealCategory: roundRules.forcedRevealCategory,
            },
          },
        };
      },
      getSpecialCatalog() {
        return SPECIAL_DEFINITIONS.map((definition) => ({
          id: definition.id,
          title: definition.title,
          text: definition.text,
          implemented: definition.implemented,
          choiceKind: resolveChoiceKind(definition),
          targetScope: getTargetScope(definition) ?? undefined,
          allowSelfTarget: allowsSelfTarget(definition),
          effectType: definition.effect.type,
          requires: definition.requires ? [...definition.requires] : undefined,
        }));
      },
      handleAction(playerId: string, action: ScenarioAction): ScenarioActionResult {
        const player = players.get(playerId);
        if (!player) return scenarioError("classic.auto.021");
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
        if (action.type === "adminReplacePlayerCard") {
          return adminReplacePlayerCard(playerId, action.payload);
        }
        if (action.type === "adminSetWorldCardReveal") {
          return adminSetWorldCardReveal(playerId, action.payload);
        }
        if (action.type === "adminReplaceWorldCard") {
          return adminReplaceWorldCard(playerId, action.payload);
        }
        if (action.type === "adminSetWorldCount") {
          return adminSetWorldCount(playerId, action.payload);
        }
        if (action.type === "adminApplySpecial") {
          return adminApplySpecial(playerId, action.payload);
        }
        if (action.type === "revealCard" && phase === "ended") {
          return revealCard(player, action.payload.cardId);
        }
        if (action.type === "applySpecial") {
          return applySpecial(player, action.payload.specialInstanceId, action.payload.payload ?? {});
        }
        if (player.status !== "alive") return scenarioError("classic.auto.006");
        if (phase === "ended") return scenarioError("classic.auto.019");

        switch (action.type) {
          case "revealCard":
            return revealCard(player, action.payload.cardId);
          case "continueRound":
            return continueRound(player);
          case "vote":
            return vote(player, action.payload.targetPlayerId);
          case "finalizeVoting":
            return finalizeVotingWindow();
          default:
            return scenarioError("classic.auto.047");
        }
      },
    } as ScenarioSession;
  },
};
