import { describe, expect, it } from "vitest";
import { computeTargetScope, getTargetCandidates } from "@bunker/shared";

describe("special targeting scope parser", () => {
  it("maps 'у любого игрока' phrases to any_including_self", () => {
    expect(computeTargetScope(undefined, "Сбрось открытую карту здоровья у любого игрока.")).toBe(
      "any_including_self"
    );
    expect(computeTargetScope("choose player", "Примени у любого живого игрока")).toBe(
      "any_including_self"
    );
  });

  it("keeps 'кроме себя' as any_alive", () => {
    expect(computeTargetScope("choose player", "Выбери любого игрока кроме себя")).toBe("any_alive");
    expect(computeTargetScope(undefined, "Голосуй не себя")).toBe("any_alive");
  });
});

describe("special targeting candidates", () => {
  it("includes actor in any_including_self scope", () => {
    const actorId = "p1";
    const order = ["p1", "p2", "p3"];
    const alive = new Set(order);
    const candidates = getTargetCandidates("any_including_self", actorId, order, alive);
    expect(candidates).toContain("p1");
    expect(candidates).toEqual(expect.arrayContaining(["p2", "p3"]));
  });

  it("excludes actor in any_alive scope", () => {
    const actorId = "p1";
    const order = ["p1", "p2", "p3"];
    const alive = new Set(order);
    const candidates = getTargetCandidates("any_alive", actorId, order, alive);
    expect(candidates).not.toContain("p1");
    expect(candidates).toEqual(expect.arrayContaining(["p2", "p3"]));
  });
});
