import type { GameRuleset } from "./index.js";

export const RULESET_PRESET_COUNTS = Object.freeze(
  Array.from({ length: 13 }, (_, index) => index + 4)
);

const RULESET_MATRIX: Record<
  number,
  {
    votesPerRound: number[];
    totalExiles: number;
    bunkerSeats: number;
  }
> = {
  4: { votesPerRound: [0, 0, 0, 1, 1], totalExiles: 2, bunkerSeats: 2 },
  5: { votesPerRound: [0, 0, 1, 1, 1], totalExiles: 3, bunkerSeats: 2 },
  6: { votesPerRound: [0, 0, 1, 1, 1], totalExiles: 3, bunkerSeats: 3 },
  7: { votesPerRound: [0, 1, 1, 1, 1], totalExiles: 4, bunkerSeats: 3 },
  8: { votesPerRound: [0, 1, 1, 1, 1], totalExiles: 4, bunkerSeats: 4 },
  9: { votesPerRound: [0, 1, 1, 1, 2], totalExiles: 5, bunkerSeats: 4 },
  10: { votesPerRound: [0, 1, 1, 1, 2], totalExiles: 5, bunkerSeats: 5 },
  11: { votesPerRound: [0, 1, 1, 2, 2], totalExiles: 6, bunkerSeats: 5 },
  12: { votesPerRound: [0, 1, 1, 2, 2], totalExiles: 6, bunkerSeats: 6 },
  13: { votesPerRound: [0, 1, 2, 2, 2], totalExiles: 7, bunkerSeats: 6 },
  14: { votesPerRound: [0, 1, 2, 2, 2], totalExiles: 7, bunkerSeats: 7 },
  15: { votesPerRound: [0, 2, 2, 2, 2], totalExiles: 8, bunkerSeats: 7 },
  16: { votesPerRound: [0, 2, 2, 2, 2], totalExiles: 8, bunkerSeats: 8 },
};

export const RULESET_TABLE: Record<number, GameRuleset> = RULESET_PRESET_COUNTS.reduce(
  (acc, playerCount) => {
    const preset = RULESET_MATRIX[playerCount];
    if (!preset) {
      return acc;
    }
    acc[playerCount] = {
      playerCount,
      votesPerRound: [...preset.votesPerRound],
      totalExiles: preset.totalExiles,
      bunkerSeats: preset.bunkerSeats,
      rulesetMode: "preset",
      manualConfig: undefined,
    };
    return acc;
  },
  {} as Record<number, GameRuleset>
);

export const getRulesetForPlayerCount = (count: number): GameRuleset => {
  const clamped = Math.min(16, Math.max(4, Math.round(count)));
  const ruleset = RULESET_TABLE[clamped];
  if (!ruleset) {
    throw new Error(`Ruleset not found for player count: ${clamped}`);
  }
  return {
    playerCount: ruleset.playerCount,
    votesPerRound: [...ruleset.votesPerRound],
    totalExiles: ruleset.totalExiles,
    bunkerSeats: ruleset.bunkerSeats,
    rulesetMode: "preset",
    manualConfig: undefined,
  };
};
