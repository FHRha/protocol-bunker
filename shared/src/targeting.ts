import type { SpecialTargetScope } from "./index.js";
import { TARGETING_TERMS } from "./targetingLocale.js";

const includesAny = (value: string, terms: readonly string[]) => terms.some((term) => value.includes(term));

const normalize = (value?: string) => (value ?? "").toLowerCase();

export const computeTargetScope = (uiTargeting?: string, text?: string): SpecialTargetScope | null => {
  const targeting = normalize(uiTargeting);
  const body = `${targeting} ${normalize(text)}`.trim();

  if (!body) return null;
  if (includesAny(body, TARGETING_TERMS.noTarget)) return null;

  if (includesAny(body, TARGETING_TERMS.neighbors)) {
    return "neighbors";
  }

  if (includesAny(body, TARGETING_TERMS.selfOnly)) {
    return "self";
  }

  if (includesAny(body, TARGETING_TERMS.includingSelf)) {
    return "any_including_self";
  }

  if (includesAny(body, TARGETING_TERMS.notSelf)) {
    return "any_alive";
  }

  if (includesAny(body, TARGETING_TERMS.anyPlayer)) {
    return "any_including_self";
  }

  if (includesAny(targeting, TARGETING_TERMS.choose) || includesAny(body, TARGETING_TERMS.choose)) {
    return "any_alive";
  }

  return null;
};

export const computeNeighbors = (
  orderRing: string[],
  aliveSet: Set<string>,
  actorId: string
): { leftId?: string; rightId?: string } => {
  const total = orderRing.length;
  if (total <= 1) return {};
  const actorIndex = orderRing.indexOf(actorId);
  if (actorIndex === -1) return {};

  let rightId: string | undefined;
  let leftId: string | undefined;

  for (let step = 1; step < total; step += 1) {
    const idx = (actorIndex + step) % total;
    const candidate = orderRing[idx];
    if (candidate === actorId) break;
    if (aliveSet.has(candidate)) {
      rightId = candidate;
      break;
    }
  }

  for (let step = 1; step < total; step += 1) {
    const idx = (actorIndex - step + total) % total;
    const candidate = orderRing[idx];
    if (candidate === actorId) break;
    if (aliveSet.has(candidate)) {
      leftId = candidate;
      break;
    }
  }

  return { leftId, rightId };
};

export const getTargetCandidates = (
  scope: SpecialTargetScope,
  actorId: string,
  orderRing: string[],
  aliveSet: Set<string>
): string[] => {
  if (scope === "self") {
    return aliveSet.has(actorId) ? [actorId] : [];
  }

  if (scope === "neighbors") {
    const neighbors = computeNeighbors(orderRing, aliveSet, actorId);
    const candidates = new Set<string>();
    if (neighbors.leftId && neighbors.leftId !== actorId) candidates.add(neighbors.leftId);
    if (neighbors.rightId && neighbors.rightId !== actorId) candidates.add(neighbors.rightId);
    return Array.from(candidates);
  }

  if (scope === "any_including_self") {
    return Array.from(aliveSet.values());
  }

  return Array.from(aliveSet.values()).filter((id) => id !== actorId);
};
