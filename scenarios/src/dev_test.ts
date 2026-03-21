
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
  VoteReasonCode,
  GameTimerKind,
  GameRuleset,
  SpecialTargetScope,
  WorldState30,
  WorldEvent,
  WorldFacedCard,
} from "@bunker/shared";
import { computeNeighbors, computeTargetScope, getTargetCandidates } from "@bunker/shared";
import { getRulesetForPlayerCount } from "@bunker/shared";
import { getThreatDeltaFromBunkerCards } from "./threat_modifier.js";
import { rollWorldFromAssets } from "./world_deck.js";
import { buildDeckAccess, resolveAssetDeckId, resolveDeckIdByLabel } from "./deck_identity.js";
import { tDev, tDevFmt } from "./devTestLocale.js";

const CORE_DECKS = [tDev("deck.profession"), tDev("deck.health"), tDev("deck.hobby"), tDev("deck.baggage"), tDev("deck.biology")] as const;
const FACTS_DECK = tDev("deck.fact");
const FACTS_SLOTS = ["facts1", "facts2"] as const;
const FACTS_LABELS: Record<(typeof FACTS_SLOTS)[number], string> = {
  facts1: tDev("category.fact1"),
  facts2: tDev("category.fact2"),
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
const BUNKER_CAPACITY = 5;
const RESOLUTION_DELAY_MS = 2000;
const DEV_SHOW_ALL_PUBLIC = true;
const DEV_AUTO_BOTS = true;
const DEV_ALLOW_REUSE_SPECIAL = false;
const DEV_BOT_NAME_PREFIX = tDev("bot.prefix");

const CATEGORY_KEY_TO_DECK: Record<string, string> = {
  profession: tDev("deck.profession"),
  health: tDev("deck.health"),
  hobby: tDev("deck.hobby"),
  baggage: tDev("deck.baggage"),
  facts: tDev("deck.fact"),
  facts1: tDev("deck.fact"),
  facts2: tDev("deck.fact"),
  biology: tDev("deck.biology"),
};

const CATEGORY_KEY_TO_SLOT: Record<string, (typeof FACTS_SLOTS)[number] | undefined> = {
  facts1: "facts1",
  facts2: "facts2",
};

const CATEGORY_LABEL_TO_DECK: Record<string, { deck: string; slotKey?: (typeof FACTS_SLOTS)[number] }> = {
  [tDev("deck.profession")]: { deck: tDev("deck.profession") },
  [tDev("deck.health")]: { deck: tDev("deck.health") },
  [tDev("deck.hobby")]: { deck: tDev("deck.hobby") },
  [tDev("deck.baggage")]: { deck: tDev("deck.baggage") },
  [tDev("deck.biology")]: { deck: tDev("deck.biology") },
  [tDev("category.fact1")]: { deck: FACTS_DECK, slotKey: "facts1" },
  [tDev("category.fact2")]: { deck: FACTS_DECK, slotKey: "facts2" },
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

type SpecialChoiceKind = "player" | "neighbor" | "category" | "bunker" | "special" | "none";

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
  isBot: boolean;
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
}

interface VoteRecord {
  targetId?: string;
  submittedAt: number;
  isValid: boolean;
  reasonInvalid?: string;
  reasonKeyInvalid?: string;
  reasonVarsInvalid?: Record<string, string | number>;
  reasonCodeInvalid?: VoteReasonCode;
}

type ScenarioLocalizedResult = {
  error: string;
  errorKey?: string;
  errorVars?: Record<string, string | number>;
};

interface RoundRules {
  noTalkUntilVoting?: boolean;
  forcedRevealCategory?: string;
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
    .replace(/ё/g, "е")
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

const resolveChoiceKindFromTargeting = (definition: SpecialConditionDefinition): SpecialChoiceKind => {
  if (String(definition.effect.params?.target ?? "").toLowerCase() === "bunker_revealed") {
    return "bunker";
  }
  if (
    definition.effect.type === "replaceBunkerCard" ||
    definition.effect.type === "discardBunkerCard" ||
    definition.effect.type === "stealBunkerCardToExiled"
  ) {
    return "bunker";
  }
  const targeting = (definition.uiTargeting ?? "").toLowerCase();
  if (targeting.includes("choose special") || targeting.includes("special") || targeting.includes(tDev("parse.target.special"))) {
    return "special";
  }
  if (targeting.includes("bunker") || targeting.includes(tDev("parse.target.bunker"))) return "bunker";
  if (
    targeting.includes("neighbor") ||
    targeting.includes(tDev("parse.target.neighbor")) ||
    targeting.includes("left") ||
    targeting.includes("right") ||
    targeting.includes(tDev("parse.target.left")) ||
    targeting.includes(tDev("parse.target.right"))
  ) {
    return "neighbor";
  }
  if (targeting.includes("category") || targeting.includes(tDev("parse.target.category"))) return "category";
  const scope = computeTargetScope(definition.uiTargeting, definition.text);
  if (!scope) return "none";
  return "player";
};

const resolveChoiceKind = (definition: SpecialConditionDefinition): SpecialChoiceKind =>
  resolveChoiceKindFromTargeting(definition);

const resolveTargetScope = (definition: SpecialConditionDefinition): SpecialTargetScope | null => {
  const choiceKind = resolveChoiceKindFromTargeting(definition);
  if (choiceKind === "category" || choiceKind === "special" || choiceKind === "bunker") return null;
  return computeTargetScope(definition.uiTargeting, definition.text);
};

const allowsSelfTarget = (definition: SpecialConditionDefinition): boolean => {
  const scope = resolveTargetScope(definition);
  return scope === "self" || scope === "any_including_self";
};

const DEV_CHOICE_EFFECT_TYPE = "devChooseSpecial";
const DEV_CHOICE_TITLE = tDev("dev.choice.title");

const DEV_SPECIAL_OPTIONS = (() => {
  const unique = new Map<string, { id: string; title: string }>();
  for (const item of IMPLEMENTED_SPECIALS) {
    if (!item.id || item.effect.type === DEV_CHOICE_EFFECT_TYPE) continue;
    if (unique.has(item.id)) continue;
    unique.set(item.id, { id: item.id, title: item.title });
  }
  return Array.from(unique.values());
})();

const buildDevChoiceDefinition = (playerId: string): SpecialConditionDefinition | null => {
  if (DEV_SPECIAL_OPTIONS.length === 0) return null;
  return {
    id: `dev-choice-${playerId}`,
    title: DEV_CHOICE_TITLE,
    text: tDev("dev.choice.text"),
    trigger: "active",
    effect: {
      type: DEV_CHOICE_EFFECT_TYPE,
      params: { specialOptions: DEV_SPECIAL_OPTIONS },
    },
    implemented: true,
    requires: [],
    uiTargeting: "choose special",
  };
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
    labelShort: tDev("card.noCard"),
    revealed: false,
    missing: true,
  };
}

function buildMissingSpecialDefinition(): SpecialConditionDefinition {
  return {
    id: "missing-special",
    title: tDev("special.none.title"),
    text: tDev("special.none.text"),
    trigger: "active",
    effect: { type: "none" },
    implemented: false,
  };
}

export const scenario: ScenarioModule = {
  meta: {
    id: "dev_test",
    name: "Dev Test Scenario",
    description: tDev("meta.description"),
    devOnly: true,
  },
  createSession(ctx: ScenarioContext): ScenarioSession {
    const deckAccess = buildDeckAccess(ctx.assets);
    const deckPools = new Map<string, AssetCard[]>();
    for (const deckName of MAIN_DECKS) {
      const deckId = resolveDeckIdByLabel(deckName) ?? deckName;
      deckPools.set(deckName, [...deckAccess.getDeckCards(deckId, deckName)]);
    }
    const specialPool = [...IMPLEMENTED_SPECIALS];
    const specialImageIndex = new Map<string, string>();
    for (const asset of deckAccess.getDeckCards("special", SPECIAL_CATEGORY)) {
      const imgUrl = asset.id ? `/assets/${asset.id}` : undefined;
      if (!imgUrl) continue;
      const titleKey = normalizeSpecialLookup(asset.labelShort);
      const fileKey = normalizeSpecialLookup(toSpecialFileName(asset.id));
      if (titleKey && !specialImageIndex.has(titleKey)) {
        specialImageIndex.set(titleKey, imgUrl);
      }
      if (fileKey && !specialImageIndex.has(fileKey)) {
        specialImageIndex.set(fileKey, imgUrl);
      }
    }

    let cardCounter = 0;
    let specialCounter = 0;
    let eventCounter = 0;
    let devBotCounter = 0;
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
    let round = 1;
    let votesRemainingInRound = ruleset.votesPerRound[0] ?? 0;
    let votingState: VotingState | null = null;
    let votePhase: VotePhase | null = null;
    let lastEliminated: string | undefined;
    let resolutionNote: string | undefined;
    let resolutionNoteKey: string | undefined;
    let resolutionNoteVars: Record<string, string | number> | undefined;
    let winners: string[] | undefined;
    let resolutionTimer: ReturnType<typeof setTimeout> | undefined;
    let voteWindowTimer: ReturnType<typeof setTimeout> | undefined;
    let discussionTimer: ReturnType<typeof setTimeout> | undefined;
    let activeTimer: { kind: GameTimerKind; endsAt: number } | null = null;
    let lastStageText: string | undefined;
    let lastStageTextKey: string | undefined;
    let lastStageTextVars: Record<string, string | number> | undefined;
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
    const bunkerDeckAssets = deckAccess.getDeckCards("bunker", tDev("deck.bunker"));
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

    const resolveSpecialImgUrl = (definition: SpecialConditionDefinition): string | undefined => {
      const byTitle = specialImageIndex.get(normalizeSpecialLookup(definition.title));
      if (byTitle) return byTitle;
      const byFileName = specialImageIndex.get(normalizeSpecialLookup(toSpecialFileName(definition.file)));
      if (byFileName) return byFileName;
      const byId = specialImageIndex.get(normalizeSpecialLookup(toSpecialFileName(definition.id)));
      if (byId) return byId;
      return buildSpecialImgUrl(definition.file);
    };
    const resolveSpecialAssetId = (definition: SpecialConditionDefinition): string => {
      const imgUrl = resolveSpecialImgUrl(definition);
      if (!imgUrl || !imgUrl.startsWith("/assets/")) return "";
      return imgUrl.slice("/assets/".length);
    };

    const makeCardInstanceId = (playerId: string) => {
      cardCounter += 1;
      return `${playerId}-${cardCounter}`;
    };

    const makeSpecialInstanceId = (playerId: string) => {
      specialCounter += 1;
      return `special-${playerId}-${specialCounter}`;
    };

    const scenarioError = (
      key: string,
      vars?: Record<string, string | number>
    ): ScenarioLocalizedResult => ({
      error: vars ? tDevFmt(key, vars) : tDev(key),
      errorKey: key,
      errorVars: vars,
    });

    const emitEvent = (
      kind: GameEventKind,
      messageOrKey: string,
      vars?: Record<string, string | number>,
      options?: { isKey?: boolean }
    ) => {
      const isKey = options?.isKey ?? true;
      const message = isKey ? (vars ? tDevFmt(messageOrKey, vars) : tDev(messageOrKey)) : messageOrKey;
      ctx.onEvent?.({
        id: `${ctx.roomCode}-${Date.now()}-${eventCounter++}`,
        kind,
        message,
        messageKey: isKey ? messageOrKey : undefined,
        messageVars: isKey ? vars : undefined,
        createdAt: Date.now(),
      });
      lastStageText = message;
      lastStageTextKey = isKey ? messageOrKey : undefined;
      lastStageTextVars = isKey ? vars : undefined;
    };

    const setStageText = (
      messageOrKey: string,
      vars?: Record<string, string | number>,
      options?: { isKey?: boolean }
    ) => {
      const isKey = options?.isKey ?? true;
      lastStageText = isKey ? (vars ? tDevFmt(messageOrKey, vars) : tDev(messageOrKey)) : messageOrKey;
      lastStageTextKey = isKey ? messageOrKey : undefined;
      lastStageTextVars = isKey ? vars : undefined;
    };

    const drawSpecialFromPool = (): SpecialConditionDefinition | null => {
      if (specialPool.length === 0) return null;
      const index = Math.floor(rng() * specialPool.length);
      const [definition] = specialPool.splice(index, 1);
      return definition ?? null;
    };

    const createPlayerState = (playerId: string, name: string, isBot: boolean): PlayerState => {
      const hand: CardState[] = [];
      for (const deckName of CORE_DECKS) {
        const baseCard = drawCardFromDeck(deckName, deckPools, rng);
        const instanceId = makeCardInstanceId(playerId);
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
        const instanceId = makeCardInstanceId(playerId);
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

      const devChoiceDefinition = buildDevChoiceDefinition(playerId);
      const primarySpecialDefinition = devChoiceDefinition ?? buildMissingSpecialDefinition();
      const primarySpecial: SpecialConditionState = {
        instanceId: makeSpecialInstanceId(playerId),
        definition: primarySpecialDefinition,
        revealedPublic: DEV_SHOW_ALL_PUBLIC ? true : false,
        used: false,
      };

      return {
        playerId,
        name,
        status: "alive",
        hand,
        revealedThisRound: false,
        specialConditions: [primarySpecial],
        specialCategoryProxyCards: [],
        bannedAgainst: new Set(),
        forcedWastedVoteNext: false,
        isBot,
      };
    };

    for (const player of ctx.players) {
      players.set(player.playerId, createPlayerState(player.playerId, player.name, false));
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

    const makeDevPlayerId = () => {
      devBotCounter += 1;
      return `dev-${ctx.roomCode}-${devBotCounter}`;
    };

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

    const addDevPlayer = (name?: string): ScenarioActionResult => {
      const playerId = makeDevPlayerId();
      const displayName = (name ?? "").trim() || `${DEV_BOT_NAME_PREFIX} ${devBotCounter}`;
      const state = createPlayerState(playerId, displayName, true);
      players.set(playerId, state);
      playerOrder.push(playerId);
      if (phase === "voting" && votingState) {
        votingState.candidates.add(playerId);
      }
      emitEvent("info", "event.playerAdded", { name: displayName });
      if (DEV_AUTO_BOTS && phase === "reveal") {
        autoRevealBots();
      }
      if (DEV_AUTO_BOTS && phase === "voting") {
        autoVoteBots();
      }
      return { stateChanged: true };
    };

    const removePlayerFromVoting = (targetId: string) => {
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
        votingState.votes.size >= alivePlayers().length &&
        votePhase === "voting"
      ) {
        enterVoteSpecialWindow();
      }
    };

    const removeDevPlayer = (targetId?: string): ScenarioActionResult => {
      let idToRemove = targetId;
      if (!idToRemove) {
        for (let i = playerOrder.length - 1; i >= 0; i -= 1) {
          const candidateId = playerOrder[i];
          const candidate = players.get(candidateId);
          if (candidate && candidate.isBot) {
            idToRemove = candidateId;
            break;
          }
        }
      }
      if (!idToRemove) return scenarioError("error.removePlayer.none");
      const player = players.get(idToRemove);
      if (!player) return scenarioError("error.player.notFound");

      players.delete(idToRemove);
      const idx = playerOrder.indexOf(idToRemove);
      if (idx !== -1) {
        playerOrder.splice(idx, 1);
      }
      removePlayerFromVoting(idToRemove);

      emitEvent("info", "event.playerRemoved", { name: player.name });
      if (phase === "reveal" || phase === "reveal_discussion") {
        if (currentTurnPlayerId === idToRemove) {
          const next = getNextAliveInOrder(idToRemove);
          currentTurnPlayerId = next?.playerId ?? null;
        }
        autoRevealBots();
      }
      if (phase === "voting" && DEV_AUTO_BOTS) {
        autoVoteBots();
      }
      checkEndCondition();
      return { stateChanged: true };
    };

    const alivePlayers = () => Array.from(players.values()).filter((player) => player.status === "alive");

    const getVotesForRound = (roundNumber: number) => {
      const index = Math.max(1, roundNumber) - 1;
      return ruleset.votesPerRound[index] ?? 0;
    };

    const autoRevealBots = () => {
      if (!DEV_AUTO_BOTS || phase !== "reveal") return;
      if (!currentTurnPlayerId) return;
      const player = players.get(currentTurnPlayerId);
      if (!player || !player.isBot || player.status !== "alive") return;

      const forcedCategory = roundRules.forcedRevealCategory;
      const deckInfo = forcedCategory ? CATEGORY_LABEL_TO_DECK[forcedCategory] : undefined;
      let candidate = forcedCategory
        ? player.hand.find(
            (card) =>
              cardMatchesDeck(card, deckInfo?.deck ?? forcedCategory) &&
              (!deckInfo?.slotKey || card.slotKey === deckInfo.slotKey) &&
              !card.revealed
          )
        : undefined;
      if (!candidate) {
        candidate = player.hand.find((card) => !card.revealed);
      }
      if (!candidate) return;

      candidate.revealed = true;
      player.revealedThisRound = true;
      lastRevealerId = player.playerId;
      emitEvent("info", "event.botReveal", { name: player.name });
      enterRevealDiscussion();
    };

    const autoVoteBots = () => {
      if (!DEV_AUTO_BOTS || phase !== "voting" || !votingState || votePhase !== "voting") return;
      for (const player of players.values()) {
        if (!player.isBot || player.status !== "alive") continue;
        if (votingState.votes.has(player.playerId)) continue;
        if (votingState.disabledVoters.has(player.playerId)) {
          markVoteWasted(votingState, player.playerId, undefined, "VOTE_BLOCKED", "dev.voteReason.blocked");
          continue;
        }
        const candidates = Array.from(votingState.candidates).filter((id) => id !== player.playerId);
        const viable = candidates.filter((id) => {
          const target = players.get(id);
          if (!target || target.status !== "alive") return false;
          if (target.bannedAgainst.has(player.playerId)) return false;
          return true;
        });
        if (viable.length === 0) {
          markVoteWasted(votingState, player.playerId, undefined, "VOTE_TARGET_UNAVAILABLE", "dev.voteReason.targetUnavailable");
          continue;
        }
        const targetId = viable[Math.floor(rng() * viable.length)];
        votingState.votes.set(player.playerId, {
          targetId,
          submittedAt: Date.now(),
          isValid: true,
        });
      }
      if (!isManualAutomation() && votingState.votes.size >= alivePlayers().length) {
        enterVoteSpecialWindow();
      }
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

    const resolveNeighborChoice = (actorId: string, payload: Record<string, unknown>):
      | { neighborId: string; side: "left" | "right" }
      | ScenarioLocalizedResult => {
      const aliveSet = buildAliveSet();
      const neighbors = computeNeighbors(playerOrder, aliveSet, actorId);
      const targetId = String(payload.targetPlayerId ?? "");
      const side = String(payload.side ?? "");
      if (targetId) {
        if (targetId === neighbors.leftId) return { neighborId: neighbors.leftId, side: "left" as const };
        if (targetId === neighbors.rightId) return { neighborId: neighbors.rightId, side: "right" as const };
        return scenarioError("error.neighbor.invalid");
      }
      if (side === "left" && neighbors.leftId) return { neighborId: neighbors.leftId, side: "left" as const };
      if (side === "right" && neighbors.rightId) return { neighborId: neighbors.rightId, side: "right" as const };
      return scenarioError("error.neighbor.notFound");
    };

    const resolveCategoryDeck = (categoryKey: string) => CATEGORY_KEY_TO_DECK[categoryKey] ?? categoryKey;

    const resolveCategorySlot = (categoryKey: string) => CATEGORY_KEY_TO_SLOT[categoryKey];

    const getCardsByCategoryKey = (player: PlayerState, categoryKey: string, onlyRevealed = false) => {
      const deckName = resolveCategoryDeck(categoryKey);
      const slotKey = resolveCategorySlot(categoryKey);
      return player.hand.filter((card) => {
        if (!cardMatchesDeck(card, deckName)) return false;
        if (slotKey && card.slotKey !== slotKey) return false;
        if (onlyRevealed && !(DEV_SHOW_ALL_PUBLIC || card.revealed)) return false;
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
      const bioCard = player.hand.find((card) => cardMatchesDeck(card, tDev("deck.biology")) && card.revealed);
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

    const checkEndCondition = () => {
      if (alivePlayers().length <= BUNKER_CAPACITY && lastEliminated) {
        phase = "ended";
        votePhase = null;
        winners = alivePlayers().map((player) => player.name);
        votingState = null;
        const threatsNote = finalThreats.length > 0 ? tDevFmt("event.gameEnd.threatsNote", { threats: finalThreats.join(", ") }) : "";
        emitEvent("gameEnd", "event.gameEnd", { winners: winners.join(", "), threatsNote });
        clearVoteWindowTimer();
        clearDiscussionTimer();
        return true;
      }
      return false;
    };

    const markVoteWasted = (
      state: VotingState,
      voterId: string,
      reason?: string,
      reasonCode: VoteReasonCode = "VOTE_BLOCKED",
      reasonKey?: string,
      reasonVars?: Record<string, string | number>
    ) => {
      state.autoWastedVoters.add(voterId);
      state.disabledVoters.add(voterId);
      state.votes.set(voterId, {
        targetId: undefined,
        submittedAt: Date.now(),
        isValid: false,
        reasonInvalid: reason,
        reasonKeyInvalid: reasonKey,
        reasonVarsInvalid: reasonVars,
        reasonCodeInvalid: reasonCode,
      });
    };

    const markVoteForcedSelf = (
      state: VotingState,
      voterId: string,
      reason?: string,
      reasonCode: VoteReasonCode = "VOTE_FORCED_SELF",
      reasonKey?: string,
      reasonVars?: Record<string, string | number>
    ) => {
      state.forcedSelfVoters.add(voterId);
      state.disabledVoters.delete(voterId);
      state.votes.set(voterId, {
        targetId: voterId,
        submittedAt: Date.now(),
        isValid: true,
        reasonInvalid: reason,
        reasonKeyInvalid: reasonKey,
        reasonVarsInvalid: reasonVars,
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

    const startVoting = () => {
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
      };

      roundRules.noTalkUntilVoting = false;
      clearDiscussionTimer();
      currentTurnPlayerId = null;
      lastRevealerId = null;

      for (const player of alivePlayers()) {
        if (player.forcedWastedVoteNext) {
          markVoteForcedSelf(votingState, player.playerId, undefined, "VOTE_FORCED_SELF", "dev.voteReason.forcedSelf");
          player.forcedWastedVoteNext = false;
        }
      }

      phase = "voting";
      votePhase = "voting";
      clearVoteWindowTimer();
      emitEvent("votingStart", "event.votingStart", { round });
      autoVoteBots();
    };

    const maskWorldCard = (card: WorldFacedCard): WorldFacedCard => {
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

    const buildWorldView = (): WorldState30 => {
      if (DEV_SHOW_ALL_PUBLIC) {
        return {
          disaster: world.disaster,
          bunker: world.bunker.map((card) => ({ ...card, isRevealed: true })),
          threats: world.threats.map((card) => ({ ...card, isRevealed: true })),
          counts: world.counts,
        };
      }
      return {
        disaster: world.disaster,
        bunker: world.bunker.map((card) => (card.isRevealed ? card : maskWorldCard(card))),
        threats: world.threats.map((card) => (card.isRevealed ? card : maskWorldCard(card))),
        counts: world.counts,
      };
    };

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

    const isBunkerCardPubliclyRevealed = (card: WorldFacedCard | undefined): boolean =>
      Boolean(card && (card.isRevealed || DEV_SHOW_ALL_PUBLIC));

    const getRevealedBunkerIndices = () =>
      world.bunker
        .map((card, index) => (isBunkerCardPubliclyRevealed(card) ? index : -1))
        .filter((index) => index >= 0);

    const getRandomRevealedBunkerIndex = (): number | null => {
      const revealedIndices = getRevealedBunkerIndices();
      if (revealedIndices.length === 0) return null;
      return revealedIndices[Math.floor(rng() * revealedIndices.length)] ?? null;
    };

    const resolveBunkerIndex = (
      payload: Record<string, unknown>,
      { allowRandom = false }: { allowRandom?: boolean } = {}
    ): { index: number } | ScenarioLocalizedResult => {
      const rawIndex = payload.bunkerIndex;
      if (rawIndex === undefined || rawIndex === null || rawIndex === "") {
        if (!allowRandom) return scenarioError("error.bunker.pickRequired");
        const randomIndex = getRandomRevealedBunkerIndex();
        if (randomIndex === null) return scenarioError("error.bunker.noRevealed");
        return { index: randomIndex };
      }

      const index = Number(rawIndex);
      if (!Number.isInteger(index)) return scenarioError("error.bunker.invalid");
      if (index < 0 || index >= world.bunker.length) return scenarioError("error.bunker.invalid");
      if (!isBunkerCardPubliclyRevealed(world.bunker[index])) {
        return scenarioError("error.bunker.revealedOnly");
      }
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
      round = nextRound;
      worldEvent = null;
      if (round > 1) {
        revealNextBunkerCard(round);
      }
      votesRemainingInRound = getVotesForRound(round);
      resetRevealProgress();
      clearRoundRules();
      phase = "reveal";
      votePhase = null;
      const firstAlive = getFirstAliveInOrder();
      currentTurnPlayerId = firstAlive?.playerId ?? null;
      emitEvent("roundStart", "event.roundStart", { round });
      autoRevealBots();
    };

    const startNextReveal = () => {
      startRevealPhase(round + 1);
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
          checkEndCondition();
          return;
        }
        phase = "reveal";
        autoRevealBots();
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
        return scenarioError("error.threats.onlyEnd");
      }
      const threatModifier = getThreatModifierFromBunkerCards();
      if (index < 0 || index >= threatModifier.finalCount) {
        return scenarioError("error.threat.invalid");
      }
      if (settings.finalThreatReveal === "host" && actorId !== ctx.hostId) {
        return scenarioError("error.host.onlyThreatReveal");
      }
      const target = world.threats[index];
      if (target.isRevealed) return { stateChanged: false };
      target.isRevealed = true;
      target.revealedBy = actorId;
      return { stateChanged: true };
    };

    const devSkipRound = (actorId: string): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("error.host.onlySkipRound");
      if (phase === "voting" || phase === "resolution") {
        return scenarioError("error.skipRound.voting");
      }
      if (phase === "ended") return scenarioError("error.game.alreadyEnded");

      for (const player of alivePlayers()) {
        player.revealedThisRound = true;
      }
      advanceAfterDiscussion();
      return { stateChanged: true };
    };

    const pickDeckCard = (
      deckName: string,
      replacementMode: "random" | "specific",
      replacementCardId?: string
    ): { card?: AssetCard; error?: string; errorKey?: string; errorVars?: Record<string, string | number> } => {
      const deckId = resolveDeckIdByLabel(deckName) ?? deckName;
      const deck = deckAccess.getDeckCards(deckId, deckName);
      if (deck.length === 0) return { card: undefined, ...scenarioError("error.deck.unavailable", { deckName }) };
      if (replacementMode === "specific") {
        const requested = String(replacementCardId ?? "").trim();
        if (!requested) return { card: undefined, ...scenarioError("error.replace.pickSpecificCard") };
        const selected = deck.find((card) => card.id === requested);
        if (!selected) return { card: undefined, ...scenarioError("error.replace.selectedCardMissing") };
        return { card: selected };
      }
      const selected = deck[Math.floor(rng() * deck.length)] ?? null;
      if (!selected) return { card: undefined, ...scenarioError("error.replace.randomFailed") };
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
      if (actorId !== ctx.hostId) return scenarioError("error.host.onlyPlayerCards");
      const target = players.get(payload.targetPlayerId);
      if (!target) return scenarioError("error.player.notFound");
      const targetArea = payload.targetArea === "special" ? "special" : "hand";

      if (targetArea === "special") {
        const special = target.specialConditions.find(
          (entry) => entry.instanceId === payload.cardInstanceId
        );
        if (!special) return scenarioError("error.special.playerMissing");
        const definition =
          payload.replacementMode === "specific"
            ? findSpecialDefinitionForAdmin(String(payload.replacementCardId ?? ""))
            : IMPLEMENTED_SPECIALS[Math.floor(rng() * IMPLEMENTED_SPECIALS.length)] ?? null;
        if (!definition) return scenarioError("error.special.replaceFailed");
        if (!definition.implemented) return scenarioError("error.special.notImplemented");
        special.definition = definition;
        special.used = false;
        emitEvent("info", "event.host.replacedPlayerSpecial", { name: target.name });
        return { stateChanged: true };
      }

      const card = target.hand.find((entry) => entry.instanceId === payload.cardInstanceId);
      if (!card) return scenarioError("error.playerCard.notFound");
      const picked = pickDeckCard(card.deck, payload.replacementMode, payload.replacementCardId);
      if (!picked.card) return picked.error ? { error: picked.error, errorKey: picked.errorKey, errorVars: picked.errorVars } : scenarioError("error.playerCard.replaceFailed");
      card.id = picked.card.id;
      card.labelShort = picked.card.labelShort;
      card.missing = false;
      emitEvent("info", "event.host.replacedPlayerCard", { name: target.name, deck: card.deck });
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
      if (actorId !== ctx.hostId) return scenarioError("error.host.onlyWorldCards");
      const index = Number(payload.index);
      if (!Number.isInteger(index) || index < 0) return scenarioError("error.world.invalidIndex");
      const list = payload.kind === "bunker" ? world.bunker : world.threats;
      const target = list[index];
      if (!target) return scenarioError("error.world.cardNotFound");
      target.isRevealed = Boolean(payload.revealed);
      emitEvent("info", "event.host.toggleWorldCard", { action: target.isRevealed ? tDev("world.action.revealed") : tDev("world.action.hidden"), kind: payload.kind });
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
      if (actorId !== ctx.hostId) return scenarioError("error.host.onlyWorldCards");
      const deckName = detectWorldDeckName(payload.kind);
      if (!deckName) return scenarioError("error.world.deckUnknown");
      const picked = pickDeckCard(deckName, payload.replacementMode, payload.replacementCardId);
      if (!picked.card) return picked.error ? { error: picked.error, errorKey: picked.errorKey, errorVars: picked.errorVars } : scenarioError("error.world.replaceFailed");

      if (payload.kind === "disaster") {
        world.disaster.id = picked.card.id;
        world.disaster.title = picked.card.labelShort;
        world.disaster.description = picked.card.labelShort;
        world.disaster.imageId = picked.card.id;
      } else {
        const index = Number(payload.index);
        if (!Number.isInteger(index) || index < 0) return scenarioError("error.world.invalidIndex");
        const list = payload.kind === "bunker" ? world.bunker : world.threats;
        const target = list[index];
        if (!target) return scenarioError("error.world.cardNotFound");
        target.id = picked.card.id;
        target.title = picked.card.labelShort;
        target.description = picked.card.labelShort;
        target.imageId = picked.card.id;
      }
      emitEvent("info", "event.host.replacedWorldCard", { kind: payload.kind });
      return { stateChanged: true };
    };

    const adminSetWorldCount = (
      actorId: string,
      payload: { kind: "bunker" | "threat"; count: number }
    ): ScenarioActionResult => {
      if (actorId !== ctx.hostId) return scenarioError("error.host.onlyWorldCards");
      const count = Number(payload.count);
      if (!Number.isInteger(count) || count < 0) return scenarioError("error.world.invalidCount");
      if (payload.kind === "bunker") {
        world.counts.bunker = Math.max(0, Math.min(world.bunker.length, count));
      } else {
        world.counts.threats = Math.max(0, Math.min(world.threats.length, count));
      }
      emitEvent("info", "event.host.updatedWorldCount", { kind: payload.kind, count });
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
      if (actorId !== ctx.hostId) return scenarioError("error.host.onlyManualSpecial");
      const sourcePlayer = players.get(payload.actorPlayerId);
      if (!sourcePlayer) return scenarioError("error.sourcePlayer.notFound");
      const effectivePayload = (payload.payload ?? {}) as Record<string, unknown>;
      const specialInstanceId = String(payload.specialInstanceId ?? "").trim();
      if (specialInstanceId) {
        const special = sourcePlayer.specialConditions.find((item) => item.instanceId === specialInstanceId);
        const result = applySpecial(sourcePlayer, specialInstanceId, effectivePayload);
        if (result.error) return result;
        emitEvent(
          "info",
          "event.host.appliedPlayerSpecial",
          { player: sourcePlayer.name, suffix: special ? tDevFmt("event.host.appliedPlayerSpecial.suffix", { title: special.definition.title }) : "" }
        );
        return result.stateChanged ? { stateChanged: true } : result;
      }

      const specialId = String(payload.specialId ?? "").trim();
      if (!specialId) return scenarioError("error.special.pickRequired");
      const definition = findSpecialDefinitionForAdmin(specialId);
      if (!definition) return scenarioError("error.special.catalogMissing");
      if (!definition.implemented) return scenarioError("error.special.notImplemented");

      const tempSpecial: SpecialConditionState = {
        instanceId: `admin-special-${sourcePlayer.playerId}-${Date.now()}`,
        definition,
        used: false,
        revealedPublic: true,
      };
      const result = applySpecialEffect(sourcePlayer, tempSpecial, effectivePayload);
      if (result.error) return result;
      if (sourcePlayer.playerId === ctx.hostId) {
        emitEvent("info", "event.host.appliedCatalogSpecial.self", { title: definition.title });
      } else {
        emitEvent("info", "event.host.appliedCatalogSpecial.asPlayer", { title: definition.title, player: sourcePlayer.name });
      }
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
          reasonVars?: Record<string, string | number>;
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
          reasonKey = reasonKey ?? "dev.voteReason.blocked";
        }
        if (targetId && state.revoteDisallowTargets.has(targetId)) {
          status = "invalid";
          reasonCode = reasonCode ?? "VOTE_TARGET_DISALLOWED";
          reasonKey = reasonKey ?? "dev.voteReason.targetDisallowed";
        }
        if (targetId && !state.candidates.has(targetId)) {
          status = "invalid";
          reasonCode = reasonCode ?? "VOTE_TARGET_UNAVAILABLE";
          reasonKey = reasonKey ?? "dev.voteReason.targetUnavailable";
        }
        if (targetId) {
          const targetPlayer = players.get(targetId);
          if (targetPlayer && targetPlayer.bannedAgainst.has(player.playerId)) {
            status = "invalid";
            reasonCode = reasonCode ?? "VOTE_BANNED_AGAINST_TARGET";
            reasonKey = reasonKey ?? "dev.voteReason.bannedAgainstTarget";
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
          reasonKey,
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
        markVoteWasted(votingState, voterId, undefined, "VOTE_SPENT", "dev.voteReason.spent");
      }
      for (const voterId of votingState.forcedSelfVoters) {
        markVoteForcedSelf(votingState, voterId, undefined, "VOTE_FORCED_SELF", "dev.voteReason.forcedSelf");
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
      emitEvent("info", "event.tie.revote");
      autoVoteBots();
    };

    const finalizeVotingResolution = (): ScenarioActionResult => {
      if (!votingState) return scenarioError("error.voting.notStarted");
      clearVoteWindowTimer();
      const source = getVoteSource();
      if (!source) return scenarioError("error.voting.noSource");

      const { topCandidates } = computeTotals(votingState, source);
      if (topCandidates.length > 1 && !votingState.tieBreakUsed) {
        startTieBreakRevote(topCandidates);
        return { stateChanged: true };
      }

      const index = Math.floor(rng() * topCandidates.length);
      applyElimination(topCandidates[index]);
      votesRemainingInRound = Math.max(0, votesRemainingInRound - 1);
      phase = "resolution";
      votePhase = "voteResolve";
      votingState.baseVotes = source;
      if (lastEliminated) {
        const name = players.get(lastEliminated)?.name ?? tDev("fallback.unknownPlayer");
        emitEvent("elimination", "event.voting.eliminated", { name });
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
      emitEvent("info", "event.voting.specialWindow");
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
            const becamePublic = !condition.revealedPublic;
            condition.revealedPublic = true;
            condition.used = true;
            player.forcedWastedVoteNext = true;
            if (becamePublic) {
              emitEvent("info", "event.secret.revealedForcedSelf", { player: player.name, title: def.title });
            } else {
              emitEvent("info", "event.secret.triggeredForcedSelf", { player: player.name, title: def.title });
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
      lastEliminated = targetId;
      resolutionNote = tDevFmt("event.elimination.resolution", { name: target.name });
      resolutionNoteKey = "event.elimination.resolution";
      resolutionNoteVars = { name: target.name };

      handleOnOwnerEliminated(target);
    };

    const markLeftBunker = (targetId: string): ScenarioActionResult => {
      const target = players.get(targetId);
      if (!target || target.status === "left_bunker") return scenarioError("error.player.notFound");
      target.status = "left_bunker";
      target.revealedThisRound = false;
      removeFromVoting(targetId);
      if (currentTurnPlayerId === targetId) {
        const next = getNextAliveInOrder(targetId);
        currentTurnPlayerId = next?.playerId ?? null;
      }
      checkEndCondition();
      return { stateChanged: true };
    };

    const revealCard = (player: PlayerState, cardId: string): ScenarioActionResult => {
      if (phase !== "reveal") return scenarioError("error.reveal.notNow");
      if (currentTurnPlayerId && player.playerId !== currentTurnPlayerId) {
        return scenarioError("error.turn.otherPlayer");
      }
      if (player.revealedThisRound) return scenarioError("error.reveal.alreadyThisRound");

      const card = getCardByInstanceId(player, cardId);
      if (!card) return scenarioError("error.card.notFound");
      if (card.revealed) return scenarioError("error.card.alreadyRevealed");

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
          return scenarioError("error.reveal.forcedCategory", { category: forcedCategory });
        }
      }

      card.revealed = true;
      player.revealedThisRound = true;
      lastRevealerId = player.playerId;

      if (cardMatchesDeck(card, tDev("deck.health")) && !firstHealthRevealPlayerId) {
        firstHealthRevealPlayerId = player.playerId;
      }
      emitEvent("info", "event.reveal.card", { name: player.name });
      enterRevealDiscussion();
      return { stateChanged: true };
    };

    const continueRound = (player: PlayerState): ScenarioActionResult => {
      if (phase !== "reveal_discussion") return scenarioError("error.continue.notNow");
      if (continuePermission === "host_only" && player.playerId !== ctx.hostId) {
        return scenarioError("error.continue.hostOnly");
      }
      if (continuePermission === "revealer_only" && player.playerId !== lastRevealerId) {
        return scenarioError("error.continue.revealerOnly");
      }
      advanceAfterDiscussion();
      return { stateChanged: true };
    };

    const isDevChoiceSpecial = (special: SpecialConditionState): boolean =>
      special.definition.id.startsWith("dev-choice-");

    const buildDevSpecialFromTemplate = (
      currentSpecial: SpecialConditionState,
      template: SpecialConditionDefinition
    ): SpecialConditionDefinition => ({
      ...template,
      id: currentSpecial.definition.id,
      title: `${template.title} (DEV)`,
      trigger: "active",
      implemented: true,
      requires: template.requires ? [...template.requires] : undefined,
      effect: {
        type: template.effect.type,
        params: template.effect.params ? { ...template.effect.params } : undefined,
      },
      uiTargeting: template.uiTargeting,
    });

    const applySpecial = (
      player: PlayerState,
      specialInstanceId: string,
      payload: Record<string, unknown>
    ): ScenarioActionResult => {
      if (player.status !== "alive") return scenarioError("error.player.excluded");
      const special = player.specialConditions.find((item) => item.instanceId === specialInstanceId);
      if (!special) return scenarioError("error.special.notFound");
      if (!special.definition.implemented) return scenarioError("error.special.unimplemented");
      if (special.used) return scenarioError("error.special.alreadyUsed");

      if (settings.specialUsage === "only_during_voting" && phase !== "voting") {
        return scenarioError("error.special.onlyVoting");
      }

      if (special.definition.trigger === "onOwnerEliminated" || special.definition.trigger === "secret_onEliminate") {
        return scenarioError("error.special.autoTrigger");
      }

      const choiceKind = resolveChoiceKind(special.definition);
      const targetScope = getTargetScope(special.definition);
      const effectivePayload = { ...payload } as Record<string, unknown>;

      if (choiceKind !== "none" && Object.keys(payload).length === 0) {
        return scenarioError("error.special.payloadRequired");
      }

      if (targetScope) {
        if (targetScope === "neighbors") {
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if ("error" in neighborChoice) return neighborChoice;
          effectivePayload.targetPlayerId = neighborChoice.neighborId;
          effectivePayload.side = neighborChoice.side;
        } else if (targetScope === "self") {
          effectivePayload.targetPlayerId = player.playerId;
        } else {
          const candidates = getTargetCandidatesFor(targetScope, player.playerId);
          if (candidates.length === 0) return scenarioError("error.target.none");
          const targetId = String(payload.targetPlayerId ?? "");
          if (!targetId) return scenarioError("error.target.required");
          if (!candidates.includes(targetId)) return scenarioError("error.target.invalid");
        }
      }

      if (choiceKind === "player") {
        const targetId = String(effectivePayload.targetPlayerId ?? "");
        if (targetId && !allowsSelfTarget(special.definition) && targetId === player.playerId) {
          return scenarioError("error.target.cannotSelf");
        }
      }

      const requiresError = validateRequires(player, special, effectivePayload);
      if (requiresError) return requiresError;

      if (!special.revealedPublic) {
        special.revealedPublic = true;
        emitEvent("info", "event.special.applied", { name: player.name, title: special.definition.title });
      }

      const effectTypeBeforeApply = special.definition.effect.type;
      const result = applySpecialEffect(player, special, effectivePayload);

      if (
        result.stateChanged &&
        isDevChoiceSpecial(special) &&
        effectTypeBeforeApply !== DEV_CHOICE_EFFECT_TYPE
      ) {
        const chooser = buildDevChoiceDefinition(player.playerId);
        if (chooser) {
          special.definition = chooser;
          special.used = false;
          special.revealedPublic = DEV_SHOW_ALL_PUBLIC ? true : special.revealedPublic;
        }
      }

      return result;
    };

    const validateRequires = (
      player: PlayerState,
      special: SpecialConditionState,
      payload: Record<string, unknown>
    ): ScenarioLocalizedResult | null => {
      const requires = special.definition.requires ?? [];
        for (const requirement of requires) {
        if (requirement === "phase=voting" && phase !== "voting") {
          return scenarioError("validate.phase.voting");
        }
        if (requirement === "phase=reveal" && phase !== "reveal" && phase !== "voting") {
          return scenarioError("validate.phase.reveal");
        }
        if (requirement === "votingStarted" && (!votingState || votingState.votes.size === 0)) {
          return scenarioError("validate.voting.started");
        }
        if (requirement === "targetHasBaggage") {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const hasBaggage = target ? getAnyCardsByCategory(target, tDev("deck.baggage")).length > 0 : false;
          if (!target || !hasBaggage) return scenarioError("validate.target.noBaggage");
        }
          if (requirement === "targetHasRevealedHealth") {
            const targetId = String(payload.targetPlayerId ?? "");
            const target = players.get(targetId);
            const hasRevealed = target
              ? (DEV_SHOW_ALL_PUBLIC ? getAnyCardsByCategory(target, tDev("deck.health")) : getRevealedCardsByCategory(target, tDev("deck.health")))
                  .length > 0
              : false;
            if (!target || !hasRevealed) return scenarioError("validate.target.noRevealedHealth");
          }
          if (requirement === "targetHasRevealedProfession") {
            const targetId = String(payload.targetPlayerId ?? "");
            const target = players.get(targetId);
            const hasRevealed = target
              ? (DEV_SHOW_ALL_PUBLIC ? getAnyCardsByCategory(target, tDev("deck.profession")) : getRevealedCardsByCategory(target, tDev("deck.profession")))
                  .length > 0
              : false;
            if (!target || !hasRevealed) return scenarioError("validate.target.noRevealedProfession");
          }
        if (requirement === "targetHasRevealedSameCategory") {
          const categoryKey = String(special.definition.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return scenarioError("validate.category.unknown");
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if ("error" in neighborChoice) return neighborChoice;
          const neighbor = neighborChoice.neighborId ? players.get(neighborChoice.neighborId) : undefined;
          if (!neighbor) return scenarioError("error.neighbor.notFound");
          const hasRevealed =
            (DEV_SHOW_ALL_PUBLIC ? getAnyCardsByCategory(neighbor, deckName) : getRevealedCardsByCategory(neighbor, deckName))
              .length > 0;
          if (!hasRevealed) return scenarioError("validate.neighbor.noRevealedCard");
        }
        if (requirement === "needsNeighborIndexing") {
          if (playerOrder.length <= 1) return scenarioError("validate.neighbor.notEnoughPlayers");
        }
        if (requirement === "ageFieldAvailable") {
          const ages = alivePlayers().map((p) => getRevealedAge(p)).filter((age) => age !== null);
          if (ages.length === 0) return scenarioError("validate.age.noneRevealed");
        }
        if (requirement === "someRevealedAges") {
          const ages = alivePlayers().map((p) => getRevealedAge(p)).filter((age) => age !== null);
          if (ages.length === 0) return scenarioError("validate.age.noneRevealed");
        }
        if (requirement === "trackFirstRevealHealth") {
          if (!firstHealthRevealPlayerId) return scenarioError("validate.health.firstRevealMissing");
        }
      }
      return null;
    };

      const addSpecialToPlayer = (target: PlayerState): ScenarioLocalizedResult | null => {
        const def = drawSpecialFromPool();
        if (!def) return scenarioError("validate.special.deckEmpty");
        target.specialConditions.push({
          instanceId: makeSpecialInstanceId(target.playerId),
          definition: def,
          revealedPublic: DEV_SHOW_ALL_PUBLIC ? true : false,
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
      if (!def.implemented) return scenarioError("error.special.unimplemented");
      if (special.used && !DEV_ALLOW_REUSE_SPECIAL) return scenarioError("error.special.alreadyUsed");

      const requiresError = validateRequires(player, special, payload);
      if (requiresError) return requiresError;

      const markSpecialUsed = () => {
        if (!DEV_ALLOW_REUSE_SPECIAL) {
          special.used = true;
        }
      };

      const canTargetSelf = allowsSelfTarget(def);
      const effectType = def.effect.type;
      const votingWindowEffects = new Set([
        "banVoteAgainst",
        "disableVote",
        "voteWeight",
        "forceRevote",
        "doubleVotesAgainst_and_disableSelfVote",
      ]);
      if (votingWindowEffects.has(effectType) && phase !== "voting") {
        return scenarioError("error.voting.notNow");
      }
      if (votingWindowEffects.has(effectType) && votingState?.disabledVoters.has(player.playerId)) {
        return scenarioError("error.vote.blocked");
      }

      switch (effectType) {
        case DEV_CHOICE_EFFECT_TYPE: {
          const selectedId = String(payload.specialId ?? "").trim();
          if (!selectedId) return scenarioError("error.special.choiceRequired");

          const selectedDefinition = IMPLEMENTED_SPECIALS.find((item) => item.id === selectedId);
          if (!selectedDefinition) return scenarioError("error.special.choiceNotFound");

          special.definition = buildDevSpecialFromTemplate(special, selectedDefinition);
          special.used = false;
          special.revealedPublic = DEV_SHOW_ALL_PUBLIC ? true : special.revealedPublic;
          emitEvent("info", "event.devChoice.selected", { name: player.name, title: selectedDefinition.title });
          return { stateChanged: true };
        }
        case "banVoteAgainst": {
          if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("error.target.notAlive");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("error.target.cannotSelf");
          player.bannedAgainst.add(targetId);
          markSpecialUsed();
          emitEvent("info", "event.special.applied", { name: player.name, title: def.title });
          return { stateChanged: true };
        }
        case "voteWeight": {
          if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
          const weight = Number(def.effect.params?.weight ?? 2);
          votingState.voteWeights.set(player.playerId, weight);
          markSpecialUsed();
          emitEvent("info", "event.vote.weightBoost", { name: player.name });
          return { stateChanged: true };
        }
        case "disableVote": {
          if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("error.target.notAlive");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("error.target.cannotSelf");
          markVoteWasted(votingState, targetId, undefined, "VOTE_BLOCKED", "dev.voteReason.blocked");
          markSpecialUsed();
          emitEvent("info", "event.vote.disable", { name: player.name, target: target.name });
          return { stateChanged: true };
        }
        case "doubleVotesAgainst_and_disableSelfVote": {
          if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("error.target.notAlive");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("error.target.cannotSelf");
          votingState.doubleAgainstTarget = targetId;
          markVoteWasted(votingState, player.playerId, undefined, "VOTE_SPENT", "dev.voteReason.spent");
          markSpecialUsed();
          emitEvent("info", "event.vote.doubleAgainst", { name: player.name, target: target.name });
          return { stateChanged: true };
        }
        case "forceRevote": {
          if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
          const source = getVoteSource();
          if (!source) return scenarioError("error.voting.noSource");
          if (def.effect.params?.disallowPreviousCandidate) {
            const { topCandidates } = computeTotals(votingState, source);
            votingState.revoteDisallowTargets = new Set(topCandidates);
          }
          resetVotesForRevote();
          votePhase = "voting";
          clearVoteWindowTimer();
          markSpecialUsed();
          emitEvent("info", "event.vote.forceRevote", { name: player.name });
          return { stateChanged: true };
        }
        case "swapRevealedWithNeighbor": {
          const neighborChoice = resolveNeighborChoice(player.playerId, payload);
          if ("error" in neighborChoice) return neighborChoice;
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return scenarioError("validate.category.unknown");
          const neighbor = neighborChoice.neighborId ? players.get(neighborChoice.neighborId) : undefined;
          if (!neighbor) return scenarioError("error.neighbor.notFound");

          const targetCardInstanceId = String(payload.targetCardInstanceId ?? "");
          const sourceCardInstanceId = String(payload.sourceCardInstanceId ?? "");
          const yourCard = getSelectedRevealedCard(player, categoryKey, sourceCardInstanceId);
          const theirCard = getSelectedRevealedCard(neighbor, categoryKey, targetCardInstanceId);
          if (!yourCard || !theirCard) {
            return scenarioError("error.swap.invalidCards");
          }

          const temp = { id: yourCard.id, labelShort: yourCard.labelShort, missing: yourCard.missing };
          yourCard.id = theirCard.id;
          yourCard.labelShort = theirCard.labelShort;
          yourCard.missing = theirCard.missing;
          theirCard.id = temp.id;
          theirCard.labelShort = temp.labelShort;
          theirCard.missing = temp.missing;

          markSpecialUsed();
          emitEvent("info", "event.swap.revealedWithNeighbor", { name: player.name, target: neighbor.name });
          return { stateChanged: true };
        }
        case "replaceRevealedCard": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!target || target.status !== "alive") return scenarioError("error.target.notAlive");
          if (!deckName) return scenarioError("validate.category.unknown");

          const targetCardInstanceId = String(payload.targetCardInstanceId ?? "");
          const revealedCard = getSelectedRevealedCard(target, categoryKey, targetCardInstanceId);
          if (!revealedCard) return scenarioError("error.target.noRevealedCategory");

          const newCard = drawCardFromDeck(deckName, deckPools, rng);
          if (!newCard) return scenarioError("error.deck.emptyCategory", { deckName });

          revealedCard.id = newCard.id;
          revealedCard.labelShort = newCard.labelShort;
          revealedCard.missing = false;

          markSpecialUsed();
          emitEvent("info", "event.card.replaceRevealed", { name: player.name, target: target.name });
          return { stateChanged: true };
        }
        case "discardRevealedAndDealHidden": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!target || target.status !== "alive") return scenarioError("error.target.notAlive");
          if (!deckName) return scenarioError("validate.category.unknown");

          const targetCardInstanceId = String(payload.targetCardInstanceId ?? "");
          const revealedCard = getSelectedRevealedCard(target, categoryKey, targetCardInstanceId);
          if (!revealedCard) return scenarioError("error.target.noRevealedCategory");

          const newCard = drawCardFromDeck(deckName, deckPools, rng);
          if (!newCard) return scenarioError("error.deck.emptyCategory", { deckName });

          revealedCard.id = newCard.id;
          revealedCard.labelShort = newCard.labelShort;
          revealedCard.missing = false;
          revealedCard.revealed = false;

          markSpecialUsed();
          emitEvent("info", "event.card.discardRevealed", { name: player.name, target: target.name });
          return { stateChanged: true };
        }
        case "redealAllRevealed": {
          const categoryKey = String(def.effect.params?.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[categoryKey];
          if (!deckName) return scenarioError("validate.category.unknown");

          const revealedSlots: CardState[] = [];
          for (const target of alivePlayers()) {
            revealedSlots.push(...getRevealedCardsByCategory(target, categoryKey));
          }
          if (revealedSlots.length === 0) return scenarioError("error.redeal.none");

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

          markSpecialUsed();
          emitEvent("info", "event.redeal.category", { name: player.name, deckName });
          return { stateChanged: true };
        }
        case "replaceBunkerCard": {
          const resolved = resolveBunkerIndex(payload);
          if ("error" in resolved) return resolved;
          const target = world.bunker[resolved.index];
          if (!isBunkerCardPubliclyRevealed(target)) {
            return scenarioError("error.bunker.revealedOnly");
          }

          const occupiedIds = new Set(
            world.bunker.map((card) => card.id).filter((id): id is string => Boolean(id))
          );
          const replacement = pickBunkerReplacementCard(occupiedIds);
          if (!replacement) return scenarioError("error.bunker.noReplacement");

          target.id = replacement.id;
          target.title = replacement.title;
          target.description = replacement.description;
          target.text = replacement.text;
          target.imageId = replacement.imageId;
          target.isRevealed = true;
          target.revealedBy = player.playerId;
          target.revealedAtRound = target.revealedAtRound ?? round;

          markSpecialUsed();
          emitEvent("info", "event.bunker.replaced", { name: player.name });
          return { stateChanged: true };
        }
        case "discardBunkerCard": {
          const resolved = resolveBunkerIndex(payload, { allowRandom: true });
          if ("error" in resolved) return resolved;
          const target = world.bunker[resolved.index];
          if (!isBunkerCardPubliclyRevealed(target)) {
            return scenarioError("error.bunker.revealedOnly");
          }

          target.id = `bunker-discarded-${Date.now()}-${Math.floor(rng() * 1_000_000)}`;
          target.title = tDev("world.bunker.lost.title");
          target.description = tDev("world.bunker.lost.description");
          target.text = undefined;
          target.imageId = undefined;
          target.isRevealed = true;
          target.revealedBy = player.playerId;
          target.revealedAtRound = target.revealedAtRound ?? round;

          markSpecialUsed();
          emitEvent("info", "event.bunker.discardedBySpecial", { title: def.title });
          return { stateChanged: true };
        }
        case "stealBunkerCardToExiled": {
          const resolved = resolveBunkerIndex(payload, { allowRandom: true });
          if ("error" in resolved) return resolved;
          const target = world.bunker[resolved.index];
          if (!isBunkerCardPubliclyRevealed(target)) {
            return scenarioError("error.bunker.revealedOnly");
          }

          target.id = `bunker-stolen-${Date.now()}-${Math.floor(rng() * 1_000_000)}`;
          target.title = tDev("world.bunker.stolen.title");
          target.description = tDev("world.bunker.stolen.description");
          target.text = undefined;
          target.imageId = undefined;
          target.isRevealed = true;
          target.revealedBy = player.playerId;
          target.revealedAtRound = target.revealedAtRound ?? round;

          markSpecialUsed();
          emitEvent("info", "event.bunker.removedBySpecial", { title: def.title });
          return { stateChanged: true };
        }
        case "forceRevealCategoryForAll": {
          const category = String(payload.category ?? "");
          const deckName = CATEGORY_KEY_TO_DECK[category] ?? category;
          if (!deckName) return scenarioError("error.category.required");
          const forcedLabel =
            category === "facts1"
              ? FACTS_LABELS.facts1
              : category === "facts2"
                ? FACTS_LABELS.facts2
                : deckName;
          roundRules.forcedRevealCategory = forcedLabel;
          markSpecialUsed();
          emitEvent("info", "event.round.forceRevealCategory", { name: player.name, category: forcedLabel });
          return { stateChanged: true };
        }
        case "setRoundRule": {
          roundRules.noTalkUntilVoting = Boolean(def.effect.params?.noTalkUntilVoting ?? true);
          markSpecialUsed();
          emitEvent("info", "event.round.ruleSet", { name: player.name });
          return { stateChanged: true };
        }
        case "stealBaggage_and_giveSpecial": {
          const targetId = String(payload.targetPlayerId ?? "");
          const target = players.get(targetId);
          if (!target || target.status !== "alive") return scenarioError("error.target.notAlive");
          if (targetId === player.playerId && !canTargetSelf) return scenarioError("error.target.cannotSelf");

          const targetBaggage = getAnyCardsByCategory(target, tDev("deck.baggage"));
          if (targetBaggage.length === 0) return scenarioError("validate.target.noBaggage");
          const requestedBaggageCardId = String(payload.baggageCardId ?? "");
          const stolenCard =
            (requestedBaggageCardId
              ? targetBaggage.find((card) => card.instanceId === requestedBaggageCardId)
              : targetBaggage[0]) ?? null;
          if (!stolenCard) return scenarioError("error.baggage.pickSpecific");

          const giveCount = Number(def.effect.params?.giveSpecialCount ?? 1);
          if (specialPool.length < giveCount) {
            return scenarioError("validate.special.deckEmpty");
          }

          target.hand = target.hand.filter((card) => card !== stolenCard);
          player.hand.push({ ...stolenCard, instanceId: makeCardInstanceId(player.playerId) });

          const specialAssetId = resolveSpecialAssetId(def);
          target.hand.push({
            instanceId: makeCardInstanceId(target.playerId),
            id: specialAssetId,
            deck: tDev("deck.baggage"),
            labelShort: def.title,
            revealed: false,
            missing: !specialAssetId,
            publicBackCategory: SPECIAL_CATEGORY,
          });

          for (let i = 0; i < giveCount; i += 1) {
            const error = addSpecialToPlayer(target);
            if (error) return error;
          }

          player.specialConditions = player.specialConditions.filter((item) => item.instanceId !== special.instanceId);
          const stolenWasVisible = DEV_SHOW_ALL_PUBLIC || stolenCard.revealed;
          player.specialCategoryProxyCards = [
            {
              labelShort: stolenCard.labelShort,
              imgUrl: stolenWasVisible && stolenCard.id ? `/assets/${stolenCard.id}` : undefined,
              hidden: !stolenWasVisible,
              backCategory: tDev("deck.baggage"),
            },
          ];

          emitEvent("info", "event.baggage.stolen", { name: player.name, target: target.name });
          return { stateChanged: true };
        }
        case "addFinalThreat": {
          const threatKey = String(def.effect.params?.threatKey ?? def.id);
          finalThreats.push(threatKey);
          markSpecialUsed();
          emitEvent("info", "event.finalThreat.added", { name: player.name });
          return { stateChanged: true };
        }
        default:
          return scenarioError("error.effect.unsupported");
      }
    };

    const vote = (player: PlayerState, targetId: string): ScenarioActionResult => {
      if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
      if (votePhase !== "voting") return scenarioError("error.vote.collectionClosed");
      if (targetId === player.playerId) return scenarioError("error.vote.self");
      if (!votingState.candidates.has(targetId)) return scenarioError("error.vote.invalidCandidate");
      if (votingState.votes.has(player.playerId)) return scenarioError("error.vote.alreadySubmitted");
      if (votingState.revoteDisallowTargets.has(targetId)) return scenarioError("error.vote.disallowedCandidate");

      const target = players.get(targetId);
      if (!target || target.status !== "alive") return scenarioError("error.vote.candidateNotAlive");
      if (target.bannedAgainst.has(player.playerId)) {
        return scenarioError("error.vote.cannotAgainst");
      }
      if (votingState.disabledVoters.has(player.playerId)) {
        return scenarioError("error.vote.blocked");
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
        emitEvent("info", "event.vote.allCollectedManual");
        return { stateChanged: true };
      }
      enterVoteSpecialWindow();
      return { stateChanged: true };
    };

    const finalizeVotingWindow = (): ScenarioActionResult => {
      if (phase !== "voting" || !votingState) return scenarioError("error.voting.notNow");
      if (votePhase === "voting") {
        enterVoteSpecialWindow();
        return { stateChanged: true };
      }
      if (votePhase !== "voteSpecialWindow") return scenarioError("error.vote.specialWindowNotOpen");
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

    const isPubliclyVisibleCard = (card: CardState) => DEV_SHOW_ALL_PUBLIC || card.revealed;

    const buildPublicCategories = (player: PlayerState): PublicCategorySlot[] => {
      return CATEGORY_ORDER.map((category) => {
        if (category === SPECIAL_CATEGORY) {
          const cards = player.specialConditions
            .filter((condition) => (DEV_SHOW_ALL_PUBLIC ? true : condition.revealedPublic))
            .map((condition) => ({
              labelShort: condition.definition.title,
              imgUrl: resolveSpecialImgUrl(condition.definition),
              instanceId: condition.instanceId,
              hidden: false,
              backCategory: SPECIAL_CATEGORY,
            }))
            .concat(
              player.specialCategoryProxyCards.map((card, index) => ({
                labelShort: card.labelShort,
                imgUrl: card.imgUrl,
                instanceId: `proxy-special-${player.playerId}-${index}`,
                hidden: card.hidden ?? false,
                backCategory: card.backCategory ?? SPECIAL_CATEGORY,
              }))
            );
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
        const visibleCards = player.hand.filter((card) => {
          const matchDeck =
            cardMatchesDeck(card, deckInfo.deck) && (!deckInfo.slotKey || card.slotKey === deckInfo.slotKey);
          if (!matchDeck) return false;
          return isPubliclyVisibleCard(card);
        });
        const cards = visibleCards.map((card) => ({
          labelShort: card.labelShort,
          imgUrl: card.id ? `/assets/${card.id}` : undefined,
          instanceId: card.instanceId,
          hidden: false,
          backCategory: category,
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
        imgUrl: resolveSpecialImgUrl(condition.definition),
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
            targetName: players.get(info.targetId)?.name ?? tDev("fallback.unknown"),
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

    startRevealPhase(round);

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
            isBot: false,
          } satisfies PlayerState);

        const revealedThisRound = alivePlayers()
          .filter((p) => p.revealedThisRound)
          .map((p) => p.playerId);
        const disallowedVoteTargetIdsForYou = (() => {
          if (!votingState || votePhase !== "voting") return undefined;
          const restricted = new Set<string>();
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
          worldEvent: worldEvent ?? undefined,
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
              revealedCards: p.hand.filter((card) => isPubliclyVisibleCard(card)).map((card) => toCardRef(card)),
              revealedCount: p.hand.filter((card) => isPubliclyVisibleCard(card)).length,
              totalCards: p.hand.length,
              specialRevealed: DEV_SHOW_ALL_PUBLIC
                ? p.specialConditions.length > 0
                : p.specialConditions.some((item) => item.revealedPublic),
              categories: buildPublicCategories(p),
            })),
            revealedThisRound,
            revealLimit: alivePlayers().length,
            voting:
              votePhase && votingState
                ? { hasVoted: votingState.votes.has(playerId), disallowedBySpecial: disallowedVoteTargetIdsForYou }
                : undefined,
            votePhase: votePhase ?? null,
            votesPublic: buildVotesPublic(),
            votingProgress: buildVotingProgress(),
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
            threatModifier: getThreatModifierFromBunkerCards(),
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
        if (!player) return scenarioError("error.player.notFound");

        if (action.type === "markLeftBunker") {
          return markLeftBunker(action.payload.targetPlayerId);
        }
        if (action.type === "devAddPlayer") {
          return addDevPlayer(action.payload.name);
        }
        if (action.type === "devRemovePlayer") {
          return removeDevPlayer(action.payload.targetPlayerId);
        }
        if (action.type === "revealWorldThreat") {
          return revealWorldThreat(playerId, action.payload.index);
        }
        if (action.type === "devSkipRound") {
          return devSkipRound(playerId);
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
        if (player.status !== "alive") return scenarioError("error.player.excluded");
        if (phase === "ended") return scenarioError("error.game.alreadyEnded");

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
            return scenarioError("error.action.unknown");
        }
      },
    } as ScenarioSession;
  },
};
