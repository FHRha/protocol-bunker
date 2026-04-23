import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { AssetCatalog, ScenarioAction, ScenarioContext, ScenarioSession } from "@bunker/shared";
import { scenario as classicScenario } from "../src/classic";
import { scenario as devScenario } from "../src/dev_test";
import { tClassic } from "../src/classicLocale";

type SpecialDef = {
  id: string;
  title: string;
  trigger: string;
  implemented: boolean;
  requires?: string[];
  effect: {
    type: string;
    params?: Record<string, unknown>;
  };
};

// Use localized deck names via tClassic()
const DECK_PROFESSION = tClassic("deck.profession");
const DECK_HEALTH = tClassic("deck.health");
const DECK_HOBBY = tClassic("deck.hobby");
const DECK_BAGGAGE = tClassic("deck.baggage");
const DECK_FACTS = tClassic("deck.fact");
const DECK_BIOLOGY = tClassic("deck.biology");
const DECK_SPECIAL = tClassic("deck.special");
const DECK_BUNKER = tClassic("deck.bunker");
const DECK_DISASTER = tClassic("deck.disaster");
const DECK_THREAT = tClassic("deck.threat");

const CATEGORY_KEY_TO_DECK: Record<string, string> = {
  profession: DECK_PROFESSION,
  health: DECK_HEALTH,
  hobby: DECK_HOBBY,
  baggage: DECK_BAGGAGE,
  facts: DECK_FACTS,
  facts1: DECK_FACTS,
  facts2: DECK_FACTS,
  biology: DECK_BIOLOGY,
};

const VOTING_WINDOW_EFFECTS = new Set([
  "banVoteAgainst",
  "disableVote",
  "voteWeight",
  "forceRevote",
  "doubleVotesAgainst_and_disableSelfVote",
]);

const makeRng = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 0xffffffff;
    return state / 0xffffffff;
  };
};

const makeDeck = (name: string, count: number) =>
  Array.from({ length: count }, (_, idx) => ({
    id: `decks/${name}/${name}_${idx + 1}.png`,
    deck: name,
    labelShort: `${name} ${idx + 1}`,
  }));

const makeAssets = (): AssetCatalog => ({
  decks: {
    [DECK_PROFESSION]: makeDeck(DECK_PROFESSION, 24),
    [DECK_HEALTH]: makeDeck(DECK_HEALTH, 24),
    [DECK_HOBBY]: makeDeck(DECK_HOBBY, 24),
    [DECK_BAGGAGE]: makeDeck(DECK_BAGGAGE, 24),
    [DECK_FACTS]: makeDeck(DECK_FACTS, 24),
    [DECK_BIOLOGY]: makeDeck(DECK_BIOLOGY, 24),
    [DECK_SPECIAL]: makeDeck(DECK_SPECIAL, 40),
    [DECK_BUNKER]: makeDeck(DECK_BUNKER, 16),
    [DECK_DISASTER]: makeDeck(DECK_DISASTER, 12),
    [DECK_THREAT]: makeDeck(DECK_THREAT, 16),
  },
});

const makePlayers = (count = 5) =>
  Array.from({ length: count }, (_, idx) => {
    const id = `p${idx + 1}`;
    return {
      playerId: id,
      name: `Player ${idx + 1}`,
    };
  });

const makeContext = (playerCount = 5): ScenarioContext => {
  const players = makePlayers(playerCount);
  return {
    roomCode: "TEST",
    createdAt: Date.now(),
    rng: makeRng(777),
    assets: makeAssets(),
    players,
    hostId: players[0]?.playerId ?? "p1",
    settings: {
      enableRevealDiscussionTimer: false,
      revealDiscussionSeconds: 30,
      enablePreVoteDiscussionTimer: false,
      preVoteDiscussionSeconds: 30,
      enablePostVoteDiscussionTimer: false,
      postVoteDiscussionSeconds: 30,
      automationMode: "auto",
      continuePermission: "host_only",
      revealTimeoutAction: "random_card",
      revealsBeforeVoting: 2,
      specialUsage: "anytime",
      maxPlayers: 12,
      finalThreatReveal: "host",
      forcedDisasterId: "random",
      cardLocale: "ru",
    },
    onStateChange: () => {},
  };
};

const readImplementedSpecials = (): SpecialDef[] => {
  const testsDir = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.resolve(testsDir, "..", "classic", "SPECIAL_CONDITIONS.json");
  const all = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as SpecialDef[];
  return all.filter((item) => item.implemented);
};

const getHostView = (session: ScenarioSession) => session.getGameView("p1");

const getAlivePlayerIds = (session: ScenarioSession) =>
  getHostView(session).public.players.filter((p) => p.status === "alive").map((p) => p.playerId);

const run = (session: ScenarioSession, actorId: string, action: ScenarioAction): void => {
  const result = session.handleAction(actorId, action);
  if (result.error) {
    throw new Error(`Action failed (${action.type} by ${actorId}): ${result.error}`);
  }
};

const runFinalizeVotingWithFallback = (session: ScenarioSession) => {
  const actorIds = [
    "p1",
    ...getHostView(session).public.players.map((player) => player.playerId).filter((id) => id !== "p1"),
  ];
  let lastError = "unknown";
  for (const actorId of actorIds) {
    const result = session.handleAction(actorId, { type: "finalizeVoting", payload: {} });
    if (!result.error) return;
    lastError = result.error;
  }
  throw new Error(`Action failed (finalizeVoting): ${lastError}`);
};

const runContinueRoundWithFallback = (session: ScenarioSession) => {
  const actorIds = [
    "p1",
    ...getHostView(session).public.players.map((player) => player.playerId).filter((id) => id !== "p1"),
  ];
  const candidates = actorIds.filter((actorId) => session.getGameView(actorId).public.canContinue);
  if (candidates.length === 0) return;
  let lastError = "unknown";
  for (const actorId of candidates) {
    const result = session.handleAction(actorId, { type: "continueRound" });
    if (!result.error) return;
    lastError = result.error;
  }
  throw new Error(`Action failed (continueRound): ${lastError}`);
};

const castVotesUntilWindow = (session: ScenarioSession, preferredTargets: Record<string, string>) => {
  for (let guard = 0; guard < 20; guard += 1) {
    const hostView = getHostView(session);
    if (hostView.phase !== "voting" || hostView.public.votePhase !== "voting") return;
    const alive = getAlivePlayerIds(session);
    let sentAny = false;
    for (const voterId of alive) {
      const currentHostView = getHostView(session);
      if (currentHostView.phase !== "voting" || currentHostView.public.votePhase !== "voting") return;
      const voterView = session.getGameView(voterId);
      if (voterView.public.voting?.hasVoted) continue;
      const targetPlayerId = preferredTargets[voterId] ?? alive.find((id) => id !== voterId) ?? voterId;
      run(session, voterId, { type: "vote", payload: { targetPlayerId } });
      sentAny = true;
    }
    if (!sentAny) return;
  }
};

const ensureVotingCollectionPhase = (session: ScenarioSession) => {
  let lastState = "unknown";
  for (let guard = 0; guard < 50; guard += 1) {
    const hostView = getHostView(session);
    const votePhase = hostView.public.votePhase ?? null;
    lastState = `phase=${hostView.phase}, votePhase=${votePhase}`;
    if (hostView.phase === "voting" && votePhase === "voting") return;
    if (hostView.phase === "reveal") {
      run(session, "p1", { type: "devSkipRound", payload: {} });
      continue;
    }
    if (hostView.phase === "reveal_discussion") {
      run(session, "p1", { type: "continueRound" });
      continue;
    }
    if (hostView.phase === "voting" && votePhase === "voteSpecialWindow") return;
    if (hostView.phase === "resolution") {
      vi.advanceTimersByTime(2_500);
      continue;
    }
    throw new Error(`Cannot reach voting collection from phase=${hostView.phase}, votePhase=${votePhase}`);
  }
  throw new Error(`Failed to reach voting collection phase. Last state: ${lastState}`);
};

const finalizeCurrentVoting = (session: ScenarioSession, preferredTargets: Record<string, string>) => {
  ensureVotingCollectionPhase(session);
  const before = getHostView(session);
  if (before.phase === "voting" && before.public.votePhase === "voting") {
    castVotesUntilWindow(session, preferredTargets);
  }
  const mid = getHostView(session);
  if (mid.phase === "voting" && mid.public.votePhase === "voting") {
    runFinalizeVotingWithFallback(session);
  }
  const after = getHostView(session);
  if (after.phase === "voting" && after.public.votePhase === "voteSpecialWindow") {
    runFinalizeVotingWithFallback(session);
  }
};

const hasRevealedDeckCard = (session: ScenarioSession, playerId: string, deck: string) => {
  const view = session.getGameView(playerId);
  return view.you.hand.some((card) => card.deck === deck && card.revealed);
};

const getRevealedDeckCards = (session: ScenarioSession, playerId: string, deck: string) =>
  session.getGameView(playerId).you.hand.filter((card) => card.deck === deck && card.revealed);

const getDeckCards = (session: ScenarioSession, playerId: string, deck: string) =>
  session.getGameView(playerId).you.hand.filter((card) => card.deck === deck);

const advanceOneTurnWithReveal = (session: ScenarioSession, preferredDeckByPlayerId?: Record<string, string>) => {
  const hostView = getHostView(session);
  if (hostView.phase !== "reveal") {
    if (hostView.phase === "reveal_discussion") {
      run(session, "p1", { type: "continueRound" });
      return;
    }
    throw new Error(`Expected reveal/reveal_discussion, got: ${hostView.phase}`);
  }
  const turnId = hostView.public.currentTurnPlayerId;
  if (!turnId) throw new Error("No current turn player in reveal phase.");
  const preferredDeck = preferredDeckByPlayerId?.[turnId];
  const view = session.getGameView(turnId);
  const card =
    (preferredDeck
      ? view.you.hand.find((entry) => entry.deck === preferredDeck && !entry.revealed)
      : null) ?? view.you.hand.find((entry) => !entry.revealed);
  if (!card) throw new Error(`No hidden cards to reveal for ${turnId}.`);
  run(session, turnId, { type: "revealCard", payload: { cardId: card.instanceId } });
  runContinueRoundWithFallback(session);
};

const ensureRevealForPlayerDeck = (session: ScenarioSession, playerId: string, deck: string) => {
  if (hasRevealedDeckCard(session, playerId, deck)) return;
  for (let guard = 0; guard < 30; guard += 1) {
    const hostView = getHostView(session);
    if (hostView.phase === "voting") {
      throw new Error(`Reached voting before revealing ${deck} for ${playerId}.`);
    }
    if (hostView.phase === "reveal" || hostView.phase === "reveal_discussion") {
      advanceOneTurnWithReveal(session, { [playerId]: deck });
      if (hasRevealedDeckCard(session, playerId, deck)) return;
      continue;
    }
    throw new Error(`Unexpected phase while preparing reveal: ${hostView.phase}`);
  }
  throw new Error(`Failed to reveal ${deck} for ${playerId}.`);
};

const ensureRevealCountForPlayerDeck = (
  session: ScenarioSession,
  playerId: string,
  deck: string,
  minCount: number
) => {
  if (session.getGameView(playerId).you.hand.filter((card) => card.deck === deck && card.revealed).length >= minCount)
    return;
  for (let guard = 0; guard < 80; guard += 1) {
    const hostView = getHostView(session);
    if (hostView.phase === "voting") {
      const alive = getAlivePlayerIds(session);
      const protectedIds = new Set([playerId, "p1"]);
      const preferredTarget =
        alive.find((id) => !protectedIds.has(id)) ?? alive.find((id) => id !== "p1") ?? alive[0] ?? playerId;
      const preferredVotes: Record<string, string> = {};
      for (const voterId of alive) {
        if (preferredTarget !== voterId) {
          preferredVotes[voterId] = preferredTarget;
          continue;
        }
        preferredVotes[voterId] =
          alive.find((id) => id !== voterId && !protectedIds.has(id)) ??
          alive.find((id) => id !== voterId) ??
          voterId;
      }
      finalizeCurrentVoting(session, preferredVotes);
      if (session.getGameView(playerId).you.hand.filter((card) => card.deck === deck && card.revealed).length >= minCount)
        return;
      continue;
    }
    if (hostView.phase === "resolution") {
      vi.advanceTimersByTime(2_500);
      if (session.getGameView(playerId).you.hand.filter((card) => card.deck === deck && card.revealed).length >= minCount)
        return;
      continue;
    }
    if (hostView.phase === "reveal" || hostView.phase === "reveal_discussion") {
      advanceOneTurnWithReveal(session, { [playerId]: deck });
      if (session.getGameView(playerId).you.hand.filter((card) => card.deck === deck && card.revealed).length >= minCount)
        return;
      continue;
    }
    throw new Error(`Unexpected phase while preparing ${deck} x${minCount}: ${hostView.phase}`);
  }
  throw new Error(`Failed to reveal ${minCount} cards from ${deck} for ${playerId}.`);
};

const ensureVoteSpecialWindow = (session: ScenarioSession) => {
  for (let guard = 0; guard < 40; guard += 1) {
    const hostView = getHostView(session);
    const votePhase = hostView.public.votePhase ?? null;
    if (hostView.phase === "voting" && votePhase === "voteSpecialWindow") return;

    if (hostView.phase === "reveal") {
      run(session, "p1", { type: "devSkipRound", payload: {} });
      continue;
    }
    if (hostView.phase === "reveal_discussion") {
      run(session, "p1", { type: "continueRound" });
      continue;
    }
    if (hostView.phase === "voting" && votePhase === "voting") {
      castVotesUntilWindow(session, {});
      continue;
    }
    throw new Error(`Cannot reach voteSpecialWindow from phase=${hostView.phase}, votePhase=${votePhase}`);
  }
  throw new Error("Failed to reach voteSpecialWindow.");
};

const buildPreferredVotesForTargetElimination = (
  session: ScenarioSession,
  targetId: string,
  protectedIds: string[] = []
) => {
  const alive = getAlivePlayerIds(session);
  const protectedSet = new Set<string>([targetId, ...protectedIds]);
  const fallback =
    alive.find((id) => !protectedSet.has(id)) ?? alive.find((id) => id !== targetId) ?? alive[0] ?? targetId;
  const preferredVotes: Record<string, string> = {};
  for (const voterId of alive) {
    if (voterId === targetId) {
      preferredVotes[voterId] = fallback === voterId ? targetId : fallback;
      continue;
    }
    preferredVotes[voterId] = targetId;
  }
  return preferredVotes;
};

const eliminatePlayerByVoting = (session: ScenarioSession, targetId: string) => {
  const preferredVotes = buildPreferredVotesForTargetElimination(session, targetId, ["p1"]);
  finalizeCurrentVoting(session, preferredVotes);
  vi.advanceTimersByTime(2_500);
};

const getSecretTriggerTarget = (condition: string): string => {
  if (condition === "leftNeighborEliminated") return "p9";
  if (condition === "rightNeighborEliminated") return "p2";
  if (condition === "youngestByRevealedAgeEliminated") return "p2";
  if (condition === "oldestByRevealedAgeEliminated") return "p2";
  if (condition === "firstRevealedHealthEliminated") return "p2";
  throw new Error(`Unsupported secret condition: ${condition}`);
};

const assertSecretOnEliminateRuntime = (
  createSession: (ctx: ScenarioContext) => ScenarioSession,
  special: SpecialDef
) => {
  const condition = String(special.effect.params?.condition ?? "");
  const targetId = getSecretTriggerTarget(condition);

  vi.useFakeTimers();
  try {
    const session = createSession(makeContext(9));
    const hostView = session.getGameView("p1");
    const hostSpecial = hostView.you.specialConditions[0];
    expect(hostSpecial).toBeTruthy();
    if (!hostSpecial) return;

    run(session, "p1", {
      type: "adminReplacePlayerCard",
      payload: {
        targetPlayerId: "p1",
        targetArea: "special",
        cardInstanceId: hostSpecial.instanceId,
        replacementMode: "specific",
        replacementCardId: special.id,
      },
    });

    if (condition === "youngestByRevealedAgeEliminated" || condition === "oldestByRevealedAgeEliminated") {
      ensureRevealForPlayerDeck(session, targetId, DECK_BIOLOGY);
    } else if (condition === "firstRevealedHealthEliminated") {
      ensureRevealForPlayerDeck(session, targetId, DECK_HEALTH);
    }

    eliminatePlayerByVoting(session, targetId);

    const triggeredAfterElimination = session.getGameView("p1");
    const revealedSecret = triggeredAfterElimination.you.specialConditions.find(
      (entry) => entry.title === special.title
    );
    expect(revealedSecret?.used).toBe(true);

    ensureVotingCollectionPhase(session);
    const triggeredVoting = session.getGameView("p1");
    const forcedVote = triggeredVoting.public.votesPublic?.find((entry) => entry.voterId === "p1");
    expect(forcedVote?.status).toBe("voted");
    expect(forcedVote?.targetId).toBe("p1");
  } finally {
    vi.useRealTimers();
  }
};

const prepareByRequirements = (session: ScenarioSession, special: SpecialDef, actorId: string, targetId: string) => {
  const requires = new Set(special.requires ?? []);
  if (requires.has("targetHasRevealedHealth")) {
    ensureRevealForPlayerDeck(session, targetId, DECK_HEALTH);
  }
  if (requires.has("targetHasRevealedProfession")) {
    ensureRevealForPlayerDeck(session, targetId, DECK_PROFESSION);
  }
  if (requires.has("targetHasRevealedSameCategory")) {
    const key = String(special.effect.params?.category ?? "");
    const deck = CATEGORY_KEY_TO_DECK[key];
    if (!deck) throw new Error(`Unknown category key for swap: ${key}`);
    ensureRevealForPlayerDeck(session, actorId, deck);
    ensureRevealForPlayerDeck(session, "p2", deck);
  }
  if (requires.has("ageFieldAvailable") || requires.has("someRevealedAges")) {
    ensureRevealForPlayerDeck(session, targetId, DECK_BIOLOGY);
  }
  if (requires.has("trackFirstRevealHealth")) {
    ensureRevealForPlayerDeck(session, targetId, DECK_HEALTH);
  }
};

const buildPayload = (session: ScenarioSession, special: SpecialDef, targetId: string) => {
  const payload: Record<string, unknown> = {};
  const effectType = special.effect.type;
  const categoryKey = String(special.effect.params?.category ?? "");

  if (effectType === "swapRevealedWithNeighbor") {
    payload.side = "left";
  }
  if (
    effectType === "banVoteAgainst" ||
    effectType === "disableVote" ||
    effectType === "doubleVotesAgainst_and_disableSelfVote" ||
    effectType === "replaceRevealedCard" ||
    effectType === "discardRevealedAndDealHidden" ||
    effectType === "stealBaggage_and_giveSpecial"
  ) {
    payload.targetPlayerId = targetId;
  }
  if (
    effectType === "replaceBunkerCard" ||
    effectType === "discardBunkerCard" ||
    effectType === "stealBunkerCardToExiled"
  ) {
    run(session, "p1", {
      type: "adminSetWorldCardReveal",
      payload: { kind: "bunker", index: 0, revealed: true },
    });
    payload.bunkerIndex = 0;
  }
  if (effectType === "forceRevealCategoryForAll") {
    payload.category = "profession";
  }
  if (effectType === "stealBaggage_and_giveSpecial") {
    const targetView = session.getGameView(targetId);
    const baggageCard = targetView.you.hand.find((card) => card.deck === DECK_BAGGAGE);
    if (!baggageCard) throw new Error("No baggage card on target.");
    payload.baggageCardId = baggageCard.instanceId;
  }
  if ((effectType === "replaceRevealedCard" || effectType === "discardRevealedAndDealHidden") && !CATEGORY_KEY_TO_DECK[categoryKey]) {
    throw new Error(`No category deck for ${effectType}.`);
  }
  return payload;
};

describe("Special conditions contract", () => {
  const implementedSpecials = readImplementedSpecials();
  const secretOnEliminateSpecials = implementedSpecials.filter((entry) => entry.trigger === "secret_onEliminate");
  const regularSpecials = implementedSpecials.filter((entry) => entry.trigger !== "secret_onEliminate");
  const allowedSecretConditions = new Set([
    "leftNeighborEliminated",
    "rightNeighborEliminated",
    "youngestByRevealedAgeEliminated",
    "oldestByRevealedAgeEliminated",
    "firstRevealedHealthEliminated",
  ]);

  it("has implemented specials for per-card coverage", () => {
    expect(implementedSpecials.length).toBeGreaterThan(0);
    expect(regularSpecials.length).toBeGreaterThan(0);
    expect(secretOnEliminateSpecials.length).toBeGreaterThan(0);
  });

  for (const special of secretOnEliminateSpecials) {
    it(`validates secret_onEliminate card contract: ${special.title}`, () => {
      expect(special.effect.type).toBe("forcedWastedVoteOnNextVoting");
      const condition = String(special.effect.params?.condition ?? "");
      expect(allowedSecretConditions.has(condition)).toBe(true);
    });
  }

  for (const special of regularSpecials) {
    it(`applies special card: ${special.title}`, () => {
      const session = devScenario.createSession(makeContext(9));
      const actorId = special.effect.type === "swapRevealedWithNeighbor" ? "p3" : "p1";
      const targetId = "p2";

      if (VOTING_WINDOW_EFFECTS.has(special.effect.type)) {
        ensureVoteSpecialWindow(session);
      }
      prepareByRequirements(session, special, actorId, targetId);
      const payload = buildPayload(session, special, targetId);
      const result = session.handleAction("p1", {
        type: "adminApplySpecial",
        payload: {
          actorPlayerId: actorId,
          specialId: special.id,
          payload,
        },
      });
      expect(result.error).toBeUndefined();
      expect(result.stateChanged).toBe(true);
    });
  }

  it("validates category-card effects declaration (including facts multi-slot support)", () => {
    const effectsWithCategoryPick = readImplementedSpecials().filter((entry) =>
      ["swapRevealedWithNeighbor", "replaceRevealedCard", "discardRevealedAndDealHidden"].includes(
        entry.effect.type
      )
    );
    expect(effectsWithCategoryPick.length).toBeGreaterThan(0);

    let factsCategoryCount = 0;
    for (const special of effectsWithCategoryPick) {
      const categoryKey = String(special.effect.params?.category ?? "").trim();
      expect(Boolean(CATEGORY_KEY_TO_DECK[categoryKey])).toBe(true);
      if (categoryKey === "facts") {
        factsCategoryCount += 1;
      }
      if (special.effect.type === "swapRevealedWithNeighbor") {
        expect((special.requires ?? []).includes("targetHasRevealedSameCategory")).toBe(true);
      }
    }
    expect(factsCategoryCount).toBeGreaterThan(0);
  });

  it("supports explicit selection of every revealed facts card in swap payload", () => {
    vi.useFakeTimers();
    try {
      const swapFacts = readImplementedSpecials().find(
        (entry) =>
          entry.effect.type === "swapRevealedWithNeighbor" && String(entry.effect.params?.category ?? "") === "facts"
      );
      expect(swapFacts).toBeTruthy();
      if (!swapFacts) return;

      const combinations: Array<[number, number]> = [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ];

      for (const [sourceIndex, targetIndex] of combinations) {
        const context = makeContext(9);
        context.settings.revealsBeforeVoting = 99;
        context.settings.continuePermission = "everyone";
        const session = devScenario.createSession(context);
        ensureRevealCountForPlayerDeck(session, "p3", DECK_FACTS, 2);
        ensureRevealCountForPlayerDeck(session, "p2", DECK_FACTS, 2);

        const actorRevealed = getRevealedDeckCards(session, "p3", DECK_FACTS);
        const targetRevealed = getRevealedDeckCards(session, "p2", DECK_FACTS);
        expect(actorRevealed.length).toBeGreaterThanOrEqual(2);
        expect(targetRevealed.length).toBeGreaterThanOrEqual(2);

        const actorCard = actorRevealed[sourceIndex];
        const targetCard = targetRevealed[targetIndex];
        expect(actorCard).toBeTruthy();
        expect(targetCard).toBeTruthy();
        if (!actorCard || !targetCard) {
          continue;
        }

        const actorBefore = actorCard.labelShort;
        const targetBefore = targetCard.labelShort;

        const result = session.handleAction("p1", {
          type: "adminApplySpecial",
          payload: {
            actorPlayerId: "p3",
            specialId: swapFacts.id,
            payload: {
              side: "left",
              sourceCardInstanceId: actorCard.instanceId,
              targetCardInstanceId: targetCard.instanceId,
            },
          },
        });
        expect(result.error).toBeUndefined();
        expect(result.stateChanged).toBe(true);

        const actorAfter = getRevealedDeckCards(session, "p3", DECK_FACTS).find(
          (card) => card.instanceId === actorCard.instanceId
        );
        const targetAfter = getRevealedDeckCards(session, "p2", DECK_FACTS).find(
          (card) => card.instanceId === targetCard.instanceId
        );
        expect(actorAfter?.labelShort).toBe(targetBefore);
        expect(targetAfter?.labelShort).toBe(actorBefore);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("supports explicit selection when player has multiple baggage cards", () => {
    const stealBaggage = readImplementedSpecials().find((entry) => entry.effect.type === "stealBaggage_and_giveSpecial");
    const swapBaggage = readImplementedSpecials().find(
      (entry) =>
        entry.effect.type === "swapRevealedWithNeighbor" && String(entry.effect.params?.category ?? "") === "baggage"
    );
    expect(stealBaggage).toBeTruthy();
    expect(swapBaggage).toBeTruthy();
    if (!stealBaggage || !swapBaggage) return;

    const session = devScenario.createSession(makeContext(9));

    // p3 gains an extra baggage from p4; p2 gains an extra baggage from p5.
    const stealByP3 = session.handleAction("p1", {
      type: "adminApplySpecial",
      payload: {
        actorPlayerId: "p3",
        specialId: stealBaggage.id,
        payload: { targetPlayerId: "p4" },
      },
    });
    expect(stealByP3.error).toBeUndefined();
    expect(stealByP3.stateChanged).toBe(true);

    const stealByP2 = session.handleAction("p1", {
      type: "adminApplySpecial",
      payload: {
        actorPlayerId: "p2",
        specialId: stealBaggage.id,
        payload: { targetPlayerId: "p5" },
      },
    });
    expect(stealByP2.error).toBeUndefined();
    expect(stealByP2.stateChanged).toBe(true);

    const p3Baggage = getDeckCards(session, "p3", DECK_BAGGAGE);
    const p2Baggage = getDeckCards(session, "p2", DECK_BAGGAGE);
    expect(p3Baggage.length).toBeGreaterThanOrEqual(2);
    expect(p2Baggage.length).toBeGreaterThanOrEqual(2);

    const sourceCard = p3Baggage[1] ?? p3Baggage[0];
    const targetCard = p2Baggage[0];
    expect(sourceCard).toBeTruthy();
    expect(targetCard).toBeTruthy();
    if (!sourceCard || !targetCard) return;

    const sourceBefore = sourceCard.labelShort;
    const targetBefore = targetCard.labelShort;

    const swapResult = session.handleAction("p1", {
      type: "adminApplySpecial",
      payload: {
        actorPlayerId: "p3",
        specialId: swapBaggage.id,
        payload: {
          side: "left",
          sourceCardInstanceId: sourceCard.instanceId,
          targetCardInstanceId: targetCard.instanceId,
        },
      },
    });
    expect(swapResult.error).toBeUndefined();
    expect(swapResult.stateChanged).toBe(true);

    const sourceAfter = getDeckCards(session, "p3", DECK_BAGGAGE).find(
      (card) => card.instanceId === sourceCard.instanceId
    );
    const targetAfter = getDeckCards(session, "p2", DECK_BAGGAGE).find(
      (card) => card.instanceId === targetCard.instanceId
    );
    expect(sourceAfter?.labelShort).toBe(targetBefore);
    expect(targetAfter?.labelShort).toBe(sourceBefore);
  });

  it("redeals revealed cards without duplicating cards", () => {
    const redealBaggage = readImplementedSpecials().find(
      (entry) =>
        entry.effect.type === "redealAllRevealed" && String(entry.effect.params?.category ?? "") === "baggage"
    );
    expect(redealBaggage).toBeTruthy();
    if (!redealBaggage) return;

    const session = classicScenario.createSession(makeContext(6));
    for (const playerId of ["p1", "p2", "p3", "p4"]) {
      ensureRevealForPlayerDeck(session, playerId, DECK_BAGGAGE);
    }

    const before = ["p1", "p2", "p3", "p4"].flatMap((playerId) =>
      getRevealedDeckCards(session, playerId, DECK_BAGGAGE).map((card) => card.labelShort)
    );
    expect(new Set(before).size).toBe(before.length);

    const result = session.handleAction("p1", {
      type: "adminApplySpecial",
      payload: {
        actorPlayerId: "p1",
        specialId: redealBaggage.id,
        payload: {},
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.stateChanged).toBe(true);

    const after = ["p1", "p2", "p3", "p4"].flatMap((playerId) =>
      getRevealedDeckCards(session, playerId, DECK_BAGGAGE).map((card) => card.labelShort)
    );
    expect(after).toHaveLength(before.length);
    expect(new Set(after).size).toBe(after.length);
    expect(new Set(after)).toEqual(new Set(before));
  });

  for (const special of secretOnEliminateSpecials) {
    it(`runtime secret_onEliminate trigger works [dev]: ${special.title}`, () => {
      assertSecretOnEliminateRuntime(devScenario.createSession, special);
    });
  }

  for (const special of secretOnEliminateSpecials) {
    it(`runtime secret_onEliminate trigger works [classic]: ${special.title}`, () => {
      assertSecretOnEliminateRuntime(classicScenario.createSession, special);
    });
  }
});
