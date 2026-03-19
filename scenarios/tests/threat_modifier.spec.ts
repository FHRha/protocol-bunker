import { describe, expect, it } from "vitest";
import { getThreatDeltaFromBunkerCards } from "../src/threat_modifier";

describe("Threat modifier from bunker cards", () => {
  it("returns zero delta when no matching bunker cards are revealed", () => {
    const result = getThreatDeltaFromBunkerCards([
      { id: "decks/1x/ru/Bunker/bunker.masterskaya.png", title: "Workshop", isRevealed: true },
      { id: "decks/1x/ru/Bunker/bunker.aptechki.png", title: "First aid kits", isRevealed: true },
    ]);

    expect(result.delta).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("adds +1 for bunker.vmeste-na-10-let", () => {
    const result = getThreatDeltaFromBunkerCards([
      {
        id: "decks/1x/ru/Bunker/bunker.vmeste-na-10-let.png",
        title: "Together for 10 years",
        isRevealed: true,
      },
    ]);

    expect(result.delta).toBe(1);
    expect(result.reasons).toEqual(["Together for 10 years"]);
  });

  it("adds -1 for bunker.zagadochnyy-zhurnal", () => {
    const result = getThreatDeltaFromBunkerCards([
      {
        id: "decks/1x/ru/Bunker/bunker.zagadochnyy-zhurnal.png",
        title: "Mysterious journal",
        isRevealed: true,
      },
    ]);

    expect(result.delta).toBe(-1);
    expect(result.reasons).toEqual(["Mysterious journal"]);
  });

  it("sums both modifiers when both cards are present", () => {
    const result = getThreatDeltaFromBunkerCards([
      {
        id: "decks/1x/ru/Bunker/bunker.vmeste-na-10-let.png",
        title: "Together for 10 years",
        isRevealed: true,
      },
      {
        id: "decks/1x/ru/Bunker/bunker.zagadochnyy-zhurnal.png",
        title: "Mysterious journal",
        isRevealed: true,
      },
    ]);

    expect(result.delta).toBe(0);
    expect(result.reasons).toEqual(["Together for 10 years", "Mysterious journal"]);
  });

  it("ignores hidden cards", () => {
    const result = getThreatDeltaFromBunkerCards([
      {
        id: "decks/1x/ru/Bunker/bunker.vmeste-na-10-let.png",
        title: "Together for 10 years",
        isRevealed: false,
      },
      {
        id: "decks/1x/ru/Bunker/bunker.zagadochnyy-zhurnal.png",
        title: "Mysterious journal",
        isRevealed: false,
      },
    ]);

    expect(result.delta).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("falls back to title mapping when card id is unavailable", () => {
    const result = getThreatDeltaFromBunkerCards([{ title: "Mysterious journal", isRevealed: true, id: "" }]);

    expect(result.delta).toBe(-1);
    expect(result.reasons).toEqual(["Mysterious journal"]);
  });
});
