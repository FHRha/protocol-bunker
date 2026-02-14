import crypto from "node:crypto";

export function createSeededRng(seed: string): () => number {
  let state = hashStringToInt(seed);
  if (state === 0) state = 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function createRandomRng(): () => number {
  return () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
}

function hashStringToInt(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
