import { describe, expect, it } from "vitest";
import { getThreatDeltaFromBunkerCards } from "../src/threat_modifier";

describe("Threat modifier from bunker cards", () => {
  it("returns zero delta when no matching bunker cards are revealed", () => {
    const result = getThreatDeltaFromBunkerCards([
      { title: "Мастерская", isRevealed: true },
      { title: "Аптечки", isRevealed: true },
    ]);

    expect(result.delta).toBe(0);
    expect(result.reasons).toEqual([]);
  });

  it("adds +1 for 'ВМЕСТЕ НА 10 ЛЕТ'", () => {
    const result = getThreatDeltaFromBunkerCards([
      { title: "ВМЕСТЕ НА 10 ЛЕТ", isRevealed: true },
    ]);

    expect(result.delta).toBe(1);
    expect(result.reasons).toEqual(["ВМЕСТЕ НА 10 ЛЕТ"]);
  });

  it("adds -1 for 'ЗАГАДОЧНЫЙ ЖУРНАЛ'", () => {
    const result = getThreatDeltaFromBunkerCards([
      { title: "ЗАГАДОЧНЫЙ ЖУРНАЛ", isRevealed: true },
    ]);

    expect(result.delta).toBe(-1);
    expect(result.reasons).toEqual(["ЗАГАДОЧНЫЙ ЖУРНАЛ"]);
  });

  it("sums both modifiers when both cards are present", () => {
    const result = getThreatDeltaFromBunkerCards([
      { title: "ВМЕСТЕ НА 10 ЛЕТ", isRevealed: true },
      { title: "ЗАГАДОЧНЫЙ ЖУРНАЛ", isRevealed: true },
    ]);

    expect(result.delta).toBe(0);
    expect(result.reasons).toEqual(["ВМЕСТЕ НА 10 ЛЕТ", "ЗАГАДОЧНЫЙ ЖУРНАЛ"]);
  });

  it("ignores hidden cards", () => {
    const result = getThreatDeltaFromBunkerCards([
      { title: "ВМЕСТЕ НА 10 ЛЕТ", isRevealed: false },
      { title: "ЗАГАДОЧНЫЙ ЖУРНАЛ", isRevealed: false },
    ]);

    expect(result.delta).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});
