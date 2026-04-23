export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeVotesByRound(votes: number[]): number[] {
  const normalized = votes.map((value) => clampInt(value, 0, 9));
  if (normalized.length === 0) {
    return [0];
  }
  return normalized;
}

export function sumVotes(votes: number[]): number {
  return votes.reduce((acc, value) => acc + value, 0);
}

export function fitVotesByTotal(votes: number[], requiredVotes: number): number[] {
  const next = normalizeVotesByRound(votes);
  const target = clampInt(requiredVotes, 0, 64);
  const roundsCount = next.length;
  let diff = target - sumVotes(next);

  if (diff > 0 && roundsCount > 0) {
    while (diff > 0) {
      let changedInCycle = false;
      for (let step = 0; step < roundsCount && diff > 0; step += 1) {
        const index = roundsCount - 1 - step;
        if (next[index] >= 9) continue;
        next[index] += 1;
        diff -= 1;
        changedInCycle = true;
      }
      if (!changedInCycle) break;
    }
    return next;
  }

  if (diff < 0 && roundsCount > 0) {
    let remainingToRemove = Math.abs(diff);
    while (remainingToRemove > 0) {
      let changedInCycle = false;
      for (let step = 0; step < roundsCount && remainingToRemove > 0; step += 1) {
        const index = roundsCount - 1 - step;
        if (next[index] <= 0) continue;
        next[index] -= 1;
        remainingToRemove -= 1;
        changedInCycle = true;
      }
      if (!changedInCycle) break;
    }
  }

  return next;
}

export function generateVotesByDefault(requiredVotes: number, currentVotes: number[]): number[] {
  const target = clampInt(requiredVotes, 0, 64);
  const current = normalizeVotesByRound(currentVotes);
  const leadingZeroCount = (() => {
    let count = 0;
    for (const value of current) {
      if (value !== 0) break;
      count += 1;
    }
    return count;
  })();
  const minLength = Math.max(1, current.length, leadingZeroCount + target);
  const generated: number[] = Array.from({ length: minLength }, () => 0);
  let remaining = target;
  for (let index = leadingZeroCount; index < generated.length && remaining > 0; index += 1) {
    generated[index] = Math.min(1, remaining);
    remaining -= generated[index];
  }
  while (remaining > 0) {
    const add = Math.min(1, remaining);
    generated.push(add);
    remaining -= add;
  }
  if (generated.length === 0) {
    generated.push(0);
  }
  return generated;
}

export function parseVotesSchedule(text: string): number[] {
  const tokens = text
    .split(/[\/,\s]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [0];
  }
  return tokens.map((token) => {
    const value = Number(token);
    if (!Number.isFinite(value)) return 0;
    return clampInt(value, 0, 9);
  });
}

export function buildRevealPlan(roundsCount: number, targetReveals: number): number[] {
  const rounds = Math.max(1, clampInt(roundsCount, 1, 64));
  const target = clampInt(targetReveals, 5, 7);
  const plan = Array.from({ length: rounds }, () => 0);
  const baseOnes = Math.min(rounds, target);
  for (let index = 0; index < baseOnes; index += 1) {
    plan[index] = 1;
  }
  let remaining = target - baseOnes;
  for (let index = rounds - 1; index >= 0 && remaining > 0; index -= 1) {
    if (plan[index] >= 2) continue;
    plan[index] += 1;
    remaining -= 1;
  }
  return plan;
}
