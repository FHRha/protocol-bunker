import assert from "node:assert/strict";
import test from "node:test";

const { runAiBotStep } = await import("../server/dist/bots/ai.js");
const { runRuleBasedBotStep } = await import("../server/dist/bots/ruleBased.js");

const botPlayerId = "bot-ai";

function createRoom(view, actions, botType = "ai", aiLanguage = "en") {
  return {
    code: "TEST",
    phase: "game",
    settings: {
      bots: {
        aiLanguage,
      },
    },
    players: new Map([
      [
        botPlayerId,
        {
          playerId: botPlayerId,
          name: "AI Bot",
          isBot: true,
          botType,
          leftBunker: false,
        },
      ],
    ]),
    session: {
      getGameView(playerId) {
        assert.equal(playerId, botPlayerId);
        return view;
      },
      handleAction(playerId, action) {
        assert.equal(playerId, botPlayerId);
        actions.push(action);
        return { stateChanged: true };
      },
    },
  };
}

function createView(overrides) {
  return {
    phase: "reveal",
    round: 1,
    public: {
      players: [
        { playerId: botPlayerId, name: "AI Bot", status: "alive", revealedCount: 0, revealedCards: [] },
        { playerId: "player-1", name: "Player 1", status: "alive", revealedCount: 2, revealedCards: [] },
      ],
      currentTurnPlayerId: botPlayerId,
      canContinue: false,
      votePhase: undefined,
      voting: undefined,
      disallowedVoteTargetIdsForYou: [],
      roundRules: {},
    },
    you: {
      playerId: botPlayerId,
      name: "AI Bot",
      hand: [
        { instanceId: "card-1", id: "profession-doctor", deck: "profession", labelShort: "Doctor", revealed: false },
        { instanceId: "card-2", id: "health-cough", deck: "health", labelShort: "Cough", revealed: false },
      ],
      categories: [
        { category: "profession", cards: [{ instanceId: "card-1", labelShort: "Doctor", revealed: false }] },
        { category: "health", cards: [{ instanceId: "card-2", labelShort: "Cough", revealed: false }] },
      ],
      specialConditions: [],
    },
    world: {
      disaster: { title: "Pandemic", description: "Virus spread.", text: "" },
      threats: [],
      bunker: [],
    },
    ...overrides,
  };
}

function createFetchMock(decision, calls) {
  return async (_url, request) => {
    calls.push(JSON.parse(String(request.body ?? "{}")));
    return {
      ok: true,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(decision),
              },
            },
          ],
        };
      },
    };
  };
}

const config = {
  baseUrl: "http://ai-gateway.test/v1",
  apiKey: "test-key",
  model: "test-model",
  timeoutMs: 1000,
};

test("ai bot calls model once to choose a reveal card", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock(
    { action: "revealCard", cardInstanceId: "card-2", explanation: 'I reveal "profession-doctor". Health matters here.' },
    fetchCalls
  );
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await runAiBotStep(createRoom(createView(), actions), config);

  assert.equal(fetchCalls.length, 1);
  const promptPayload = JSON.parse(fetchCalls[0].messages[1].content.split("\n").at(-1));
  assert.equal(promptPayload.you.hand[0].id, "profession-doctor");
  assert.deepEqual(promptPayload.you.legalRevealCards.map((card) => card.cardInstanceId), ["card-1"]);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "revealCard", payload: { cardId: "card-1" } });
  assert.equal(result?.action, "revealCard");
  assert.match(result?.explanation ?? "", /profession-doctor/);
});

test("ai bot prioritizes forced reveal category over first profession", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock(
    { action: "revealCard", cardInstanceId: "card-1", explanation: "Profession is usually first." },
    fetchCalls
  );
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const view = createView({
    public: {
      ...createView().public,
      roundRules: { forcedRevealCategory: "health" },
    },
  });
  const result = await runAiBotStep(createRoom(view, actions), config);

  assert.equal(fetchCalls.length, 1);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "revealCard", payload: { cardId: "card-2" } });
  assert.equal(result?.action, "revealCard");
});

test("rule based bot prioritizes forced reveal category over first profession", () => {
  const actions = [];
  const view = createView({
    public: {
      ...createView().public,
      roundRules: { forcedRevealCategory: "health" },
    },
  });
  const result = runRuleBasedBotStep(createRoom(view, actions, "rule_based"));

  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "revealCard", payload: { cardId: "card-2" } });
  assert.equal(result?.decision?.action, "revealCard");
});

test("ai bot continues reveal discussion without calling model", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock({ action: "vote", targetPlayerId: "player-1" }, fetchCalls);
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const view = createView({
    phase: "reveal_discussion",
    public: {
      ...createView().public,
      canContinue: true,
    },
  });
  const result = await runAiBotStep(createRoom(view, actions), config);

  assert.equal(fetchCalls.length, 0);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "continueRound", payload: {} });
  assert.equal(result?.action, "continueRound");
  assert.equal(result?.explanation, "");
});

test("ai bot calls model once to choose a vote target", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock(
    { action: "vote", targetPlayerId: "player-1", explanation: "Player 1 has the most visible risk." },
    fetchCalls
  );
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const view = createView({
    phase: "voting",
    public: {
      ...createView().public,
      currentTurnPlayerId: undefined,
      votePhase: "voting",
      voting: { hasVoted: false },
    },
  });
  const result = await runAiBotStep(createRoom(view, actions), config);

  assert.equal(fetchCalls.length, 1);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "vote", payload: { targetPlayerId: "player-1" } });
  assert.equal(result?.action, "vote");
  assert.equal(result?.explanation, "Player 1 has the most visible risk.");
});

test("ai bot prompt switches to russian language guidance when lobby language is ru", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock(
    { action: "revealCard", cardInstanceId: "card-1", explanation: "Я раскрываю profession-philosopher. Это помогает пережить ситуацию." },
    fetchCalls
  );
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const view = createView({
    public: {
      ...createView().public,
      players: [
        { playerId: botPlayerId, name: "AI Bot", status: "alive", revealedCount: 0, revealedCards: [] },
        { playerId: "player-1", name: "Игрок 1", status: "alive", revealedCount: 2, revealedCards: [] },
      ],
    },
    you: {
      ...createView().you,
      hand: [
        { instanceId: "card-1", id: "profession-philosopher", deck: "profession", labelShort: "Философ", revealed: false },
        { instanceId: "card-2", id: "health-cough", deck: "health", labelShort: "Кашель", revealed: false },
      ],
      categories: [
        { category: "profession", cards: [{ instanceId: "card-1", labelShort: "Философ", revealed: false }] },
        { category: "health", cards: [{ instanceId: "card-2", labelShort: "Кашель", revealed: false }] },
      ],
    },
  });

  const result = await runAiBotStep(createRoom(view, actions, "ai", "ru"), config);

  assert.equal(fetchCalls.length, 1);
  const prompt = fetchCalls[0].messages[1].content;
  assert.match(prompt, /Пиши explanation только по-русски/i);
  assert.match(prompt, /Return only JSON with this shape and no extra text before or after it/i);
  assert.equal(actions.length, 1);
  assert.equal(result?.action, "revealCard");
  assert.equal(result?.explanation, "Я раскрываю profession-philosopher. Это помогает пережить ситуацию.");
});

test("ai bot localizes russian card labels to english when lobby language is en", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = createFetchMock(
    { action: "revealCard", cardInstanceId: "card-1", explanation: "I can use profession-programmist to support our survival." },
    fetchCalls
  );
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const view = createView({
    you: {
      ...createView().you,
      hand: [
        { instanceId: "card-1", id: "profession-programmist", deck: "profession", labelShort: "Программист", revealed: false },
        { instanceId: "card-2", id: "health-cough", deck: "health", labelShort: "Кашель", revealed: false },
      ],
      categories: [
        { category: "profession", cards: [{ instanceId: "card-1", labelShort: "Программист", revealed: false }] },
        { category: "health", cards: [{ instanceId: "card-2", labelShort: "Кашель", revealed: false }] },
      ],
    },
    public: {
      ...createView().public,
      players: [
        { playerId: botPlayerId, name: "AI Bot", status: "alive", revealedCount: 0, revealedCards: [] },
        {
          playerId: "player-1",
          name: "Игрок 1",
          status: "alive",
          revealedCount: 2,
          revealedCards: [],
          categories: [
            { category: "profession", status: "revealed", cards: [{ instanceId: "card-1", labelShort: "Программист" }] },
          ],
        },
      ],
    },
  });

  const result = await runAiBotStep(createRoom(view, actions, "ai", "en"), config);

  assert.equal(fetchCalls.length, 1);
  const prompt = fetchCalls[0].messages[1].content;
  assert.match(prompt, /Programmer/);
  assert.doesNotMatch(prompt, /Программист/);
  assert.match(prompt, /"you"/s);
  assert.match(prompt, /"id":"profession-programmist"/);
  assert.match(prompt, /"labelShort":"Programmer"/);
  assert.match(prompt, /"visiblePlayers"/s);
  assert.match(prompt, /"categories":\[/s);
  assert.equal(actions.length, 1);
  assert.equal(result?.action, "revealCard");
  assert.equal(result?.explanation, 'I can use profession-programmist to support our survival.');
});

test("ai bot preserves long explanation without server-side truncation", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const previousFetch = globalThis.fetch;
  const longExplanation =
    'I reveal "profession-doctor". Doctor is my best protection here because it keeps the group stable, covers the current risk pattern, and avoids a fragile reveal path while the table is still reading the situation.';
  globalThis.fetch = createFetchMock(
    { action: "revealCard", cardInstanceId: "card-1", explanation: longExplanation },
    fetchCalls
  );
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await runAiBotStep(createRoom(createView(), actions), config);

  assert.equal(fetchCalls.length, 1);
  const prompt = fetchCalls[0].messages[1].content;
  assert.match(prompt, /stay between 300 and 450 characters/i);
  assert.match(prompt, /human-like: 2-3 sentences/i);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "revealCard", payload: { cardId: "card-1" } });
  assert.equal(result?.action, "revealCard");
  assert.equal(result?.explanation, longExplanation);
});

test("ai bot logs fallback reason when gateway rejects request", async (t) => {
  const fetchCalls = [];
  const actions = [];
  const logs = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, request) => {
    fetchCalls.push(JSON.parse(String(request.body ?? "{}")));
    return {
      ok: false,
      status: 429,
      async json() {
        return {};
      },
    };
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const result = await runAiBotStep(createRoom(createView(), actions), {
    ...config,
    log: (event, details) => logs.push({ event, details }),
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0], { type: "revealCard", payload: { cardId: "card-1" } });
  assert.equal(result?.action, "revealCard");
  assert.ok(
    logs.some(
      (entry) =>
        entry.event === "ai-fallback" &&
        entry.details.reason === "http_error" &&
        entry.details.status === 429
    )
  );
});

test("ai bot does not start duplicate model request while previous request is in flight", async (t) => {
  const fetchCalls = [];
  const actions = [];
  let resolveFetch;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (_url, request) => {
    fetchCalls.push(JSON.parse(String(request.body ?? "{}")));
    await new Promise((resolve) => {
      resolveFetch = resolve;
    });
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: JSON.stringify({ action: "revealCard", cardInstanceId: "card-1" }) } }],
        };
      },
    };
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const room = createRoom(createView(), actions);
  const first = runAiBotStep(room, config);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = await runAiBotStep(room, config);
  assert.equal(second, null);
  assert.equal(fetchCalls.length, 1);
  resolveFetch();
  const result = await first;

  assert.equal(fetchCalls.length, 1);
  assert.equal(actions.length, 1);
  assert.equal(result?.action, "revealCard");
});
