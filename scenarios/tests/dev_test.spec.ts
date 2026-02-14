import { describe, expect, it } from "vitest";
import type { AssetCatalog, ScenarioContext } from "@bunker/shared";
import { scenario as devScenario } from "../src/dev_test";

const makeRng = (seed = 1) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) % 0xffffffff;
    return state / 0xffffffff;
  };
};

const makeDeck = (name: string, count: number) =>
  Array.from({ length: count }, (_, idx) => ({
    id: `decks/${name}/${name}_${idx + 1}.jpg`,
    deck: name,
    labelShort: `${name} ${idx + 1}`,
  }));

const makeAssets = (): AssetCatalog => ({
  decks: {
    Профессия: makeDeck("Профессия", 12),
    Здоровье: makeDeck("Здоровье", 12),
    Хобби: makeDeck("Хобби", 12),
    Багаж: makeDeck("Багаж", 12),
    Факты: makeDeck("Факты", 12),
    Биология: makeDeck("Биология", 12),
  },
});

const makeContext = (players: Array<{ playerId: string; name: string }>): ScenarioContext => ({
  roomCode: "TEST",
  createdAt: Date.now(),
  rng: makeRng(123),
  assets: makeAssets(),
  players,
  hostId: players[0]?.playerId ?? "host",
  settings: {
    enableRevealDiscussionTimer: false,
    revealDiscussionSeconds: 30,
    enablePreVoteDiscussionTimer: false,
    preVoteDiscussionSeconds: 30,
    enablePostVoteDiscussionTimer: false,
    postVoteDiscussionSeconds: 30,
    continuePermission: "host_only",
    revealTimeoutAction: "random_card",
    revealsBeforeVoting: 2,
    specialUsage: "anytime",
    maxPlayers: 12,
    finalThreatReveal: "host",
  },
});

describe("Dev Test Scenario", () => {
  it("раздаёт уникальные карты без повторов", () => {
    const ctx = makeContext([
      { playerId: "p1", name: "A" },
      { playerId: "p2", name: "B" },
      { playerId: "p3", name: "C" },
    ]);
    const session = devScenario.createSession(ctx);

    const allCards = new Map<string, Set<string>>();
    const specialIds = new Set<string>();
    let totalSpecials = 0;
    for (const player of ctx.players) {
      const view = session.getGameView(player.playerId);
      view.you.hand.forEach((card) => {
        if (!card.id) return;
        const set = allCards.get(card.deck) ?? new Set<string>();
        if (set.has(card.id)) {
          throw new Error(`Duplicate card in deck ${card.deck}: ${card.id}`);
        }
        set.add(card.id);
        allCards.set(card.deck, set);
      });

      view.you.specialConditions.forEach((special) => {
        totalSpecials += 1;
        if (specialIds.has(special.id)) {
          throw new Error(`Duplicate special condition: ${special.id}`);
        }
        specialIds.add(special.id);
      });
    }
    expect(allCards.size).toBeGreaterThan(0);
    expect(specialIds.size).toBe(totalSpecials);
  });

  it("devAddPlayer добавляет игрока и сохраняет уникальность", () => {
    const ctx = makeContext([
      { playerId: "p1", name: "A" },
      { playerId: "p2", name: "B" },
    ]);
    const session = devScenario.createSession(ctx);
    const before = session.getGameView("p1").public.players.map((p) => p.playerId);

    const addResult = session.handleAction("p1", { type: "devAddPlayer", payload: {} });
    expect(addResult.error).toBeUndefined();

    const afterPlayers = session.getGameView("p1").public.players.map((p) => p.playerId);
    expect(afterPlayers.length).toBe(before.length + 1);

    const newId = afterPlayers.find((id) => !before.includes(id));
    expect(newId).toBeTruthy();

    if (newId) {
      const view = session.getGameView(newId);
      expect(view.you.hand.length).toBeGreaterThan(0);
    }
  });

  it("devRemovePlayer удаляет игрока без ошибок", () => {
    const ctx = makeContext([
      { playerId: "p1", name: "A" },
      { playerId: "p2", name: "B" },
    ]);
    const session = devScenario.createSession(ctx);
    session.handleAction("p1", { type: "devAddPlayer", payload: {} });
    const players = session.getGameView("p1").public.players;
    const removeTarget = players.find((p) => p.playerId !== "p1");
    expect(removeTarget).toBeTruthy();
    if (!removeTarget) return;

    const removeResult = session.handleAction("p1", {
      type: "devRemovePlayer",
      payload: { targetPlayerId: removeTarget.playerId },
    });
    expect(removeResult.error).toBeUndefined();

    const updated = session.getGameView("p1").public.players.map((p) => p.playerId);
    expect(updated.includes(removeTarget.playerId)).toBe(false);
  });
});
