import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import type { AssetCatalog, ScenarioAction, ScenarioContext, ScenarioSession } from "@bunker/shared";
import { scenario as devScenario } from "../src/dev_test";

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

const DECK_PROFESSION = "Профессия";
const DECK_HEALTH = "Здоровье";
const DECK_HOBBY = "Хобби";
const DECK_BAGGAGE = "Багаж";
const DECK_FACTS = "Факты";
const DECK_BIOLOGY = "Биология";

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
    Катастрофа: makeDeck("Катастрофа", 12),
    Бункер: makeDeck("Бункер", 16),
    Угроза: makeDeck("Угроза", 16),
    "Особые условия": makeDeck("Особые условия", 40),
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
    run(session, "p1", { type: "finalizeVoting" });
  }
  const after = getHostView(session);
  if (after.phase === "voting" && after.public.votePhase === "voteSpecialWindow") {
    run(session, "p1", { type: "finalizeVoting" });
  }
};

const hasRevealedDeckCard = (session: ScenarioSession, playerId: string, deck: string) => {
  const view = session.getGameView(playerId);
  return view.you.hand.some((card) => card.deck === deck && card.revealed);
};

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
  run(session, "p1", { type: "continueRound" });
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
  it("validates secret_onEliminate definitions against trigger contract", () => {
    const specials = readImplementedSpecials().filter((entry) => entry.trigger === "secret_onEliminate");
    const allowedConditions = new Set([
      "leftNeighborEliminated",
      "rightNeighborEliminated",
      "youngestByRevealedAgeEliminated",
      "oldestByRevealedAgeEliminated",
      "firstRevealedHealthEliminated",
    ]);

    expect(specials.length).toBeGreaterThan(0);
    for (const special of specials) {
      expect(special.effect.type).toBe("forcedWastedVoteOnNextVoting");
      const condition = String(special.effect.params?.condition ?? "");
      expect(allowedConditions.has(condition)).toBe(true);
    }
  });

  it("applies every implemented special from catalog with expected preconditions", () => {
    const specials = readImplementedSpecials().filter((entry) => entry.trigger !== "secret_onEliminate");
    expect(specials.length).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const special of specials) {
      const session = devScenario.createSession(makeContext(9));
      const actorId = special.effect.type === "swapRevealedWithNeighbor" ? "p3" : "p1";
      const targetId = "p2";

      try {
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
        if (result.error) {
          failures.push(`${special.title}: ${result.error}`);
          continue;
        }
        if (!result.stateChanged) {
          failures.push(`${special.title}: action returned no state change`);
        }
      } catch (error) {
        failures.push(`${special.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("secret_onEliminate reveals card and forces self-vote on next voting", () => {
    vi.useFakeTimers();
    try {
      const session = devScenario.createSession(makeContext(7));
      const leftSecret = readImplementedSpecials().find(
        (entry) =>
          entry.trigger === "secret_onEliminate" &&
          String(entry.effect.params?.condition ?? "") === "firstRevealedHealthEliminated"
      );
      expect(leftSecret).toBeTruthy();
      if (!leftSecret) return;

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
          replacementCardId: leftSecret.id,
        },
      });

      ensureRevealForPlayerDeck(session, "p2", DECK_HEALTH);

      finalizeCurrentVoting(session, {
        p1: "p2",
        p2: "p3",
        p3: "p2",
        p4: "p2",
        p5: "p2",
        p6: "p2",
        p7: "p2",
      });
      vi.advanceTimersByTime(2_500);

      ensureVotingCollectionPhase(session);
      const firstTriggeredVoting = session.getGameView("p1");
      expect(firstTriggeredVoting.public.votePhase).toBe("voting");
      const revealedSecret = firstTriggeredVoting.you.specialConditions.find(
        (entry) => entry.title === leftSecret.title
      );
      expect(revealedSecret).toBeTruthy();
      const voteP1Cycle1 = firstTriggeredVoting.public.votesPublic?.find((entry) => entry.voterId === "p1");
      expect(voteP1Cycle1?.status).toBe("voted");
      expect(voteP1Cycle1?.targetId).toBe("p1");
    } finally {
      vi.useRealTimers();
    }
  });
});
