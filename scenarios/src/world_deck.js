import { formatLabelShort, } from "@bunker/shared";
import { buildDeckAccess } from "./deck_identity.js";
const WORLD_COUNTS = [
    { min: 4, max: 4, bunker: 5, threats: 3 },
    { min: 5, max: 6, bunker: 5, threats: 4 },
    { min: 7, max: 9, bunker: 5, threats: 5 },
    { min: 10, max: 16, bunker: 5, threats: 6 },
];
const buildAssetPool = (...decks) => {
    const byId = new Map();
    for (const deck of decks) {
        for (const card of deck) {
            if (!card?.id || byId.has(card.id))
                continue;
            byId.set(card.id, card);
        }
    }
    return Array.from(byId.values());
};
const pickAssetFromDeck = (deck, rng) => {
    if (deck.length === 0)
        return null;
    const index = Math.floor(rng() * deck.length);
    return deck[index] ?? deck[0] ?? null;
};
const makeEmergencyWorldCard = (kind, index) => {
    const suffix = index !== undefined ? `_${index + 1}` : "";
    return {
        kind,
        id: `${kind}_missing${suffix}`,
        title: formatLabelShort(kind),
        description: formatLabelShort(kind),
    };
};
const makeUniqueWorldCardId = (existing, preferredId) => {
    let candidate = preferredId || `card_${existing.size + 1}`;
    if (!existing.has(candidate)) {
        existing.add(candidate);
        return candidate;
    }
    let seq = 2;
    while (existing.has(`${candidate}__${seq}`)) {
        seq += 1;
    }
    const unique = `${candidate}__${seq}`;
    existing.add(unique);
    return unique;
};
const toWorldCardFromAsset = (kind, card) => ({
    kind,
    id: card.id,
    title: card.labelShort,
    description: card.labelShort,
    imageId: card.id,
});
const pickFromAssets = (deck, kind, rng, fallbackPool) => {
    const picked = pickAssetFromDeck(deck, rng) ?? pickAssetFromDeck(fallbackPool, rng);
    if (!picked)
        return makeEmergencyWorldCard(kind);
    return toWorldCardFromAsset(kind, picked);
};
const pickFromAssetsById = (deck, kind, cardId) => {
    if (deck.length === 0)
        return null;
    const card = deck.find((entry) => entry.id === cardId);
    if (!card)
        return null;
    return toWorldCardFromAsset(kind, card);
};
const drawManyFromAssets = (deckCards, kind, count, rng, fallbackPool) => {
    const deck = deckCards.slice();
    const backup = fallbackPool.slice();
    const result = [];
    const usedIds = new Set();
    for (let i = 0; i < count; i += 1) {
        let picked = null;
        if (deck.length > 0) {
            const index = Math.floor(rng() * deck.length);
            const [card] = deck.splice(index, 1);
            picked = card ?? null;
        }
        else if (backup.length > 0) {
            const index = Math.floor(rng() * backup.length);
            const [card] = backup.splice(index, 1);
            picked = card ?? null;
        }
        if (picked) {
            const mapped = toWorldCardFromAsset(kind, picked);
            result.push({
                ...mapped,
                id: makeUniqueWorldCardId(usedIds, mapped.id),
            });
            continue;
        }
        const emergency = makeEmergencyWorldCard(kind, i);
        result.push({
            ...emergency,
            id: makeUniqueWorldCardId(usedIds, emergency.id),
        });
    }
    return result;
};
export const getWorldCounts = (playerCount) => {
    const row = WORLD_COUNTS.find((entry) => playerCount >= entry.min && playerCount <= entry.max);
    if (row)
        return { bunker: row.bunker, threats: row.threats };
    const last = WORLD_COUNTS[WORLD_COUNTS.length - 1];
    return { bunker: last.bunker, threats: last.threats };
};
const toFaced = (card, revealed) => ({
    ...card,
    isRevealed: revealed,
});
export const rollWorldFromAssets = (assets, rng, playerCount, forcedDisasterId) => {
    const deckAccess = buildDeckAccess(assets);
    // Use deck IDs only - buildDeckAccess will resolve to correct localized label
    const disasterDeck = deckAccess.getDeckCards("disaster");
    const bunkerDeck = deckAccess.getDeckCards("bunker");
    const threatDeck = deckAccess.getDeckCards("threat");
    const disasterFallbackPool = buildAssetPool(disasterDeck, bunkerDeck, threatDeck);
    const bunkerFallbackPool = buildAssetPool(bunkerDeck, disasterDeck, threatDeck);
    const threatFallbackPool = buildAssetPool(threatDeck, bunkerDeck, disasterDeck);
    const counts = getWorldCounts(playerCount);
    const forcedDisaster = forcedDisasterId && forcedDisasterId !== "random"
        ? pickFromAssetsById(disasterDeck, "disaster", forcedDisasterId)
        : null;
    const disaster = forcedDisaster ?? pickFromAssets(disasterDeck, "disaster", rng, disasterFallbackPool);
    const bunker = drawManyFromAssets(bunkerDeck, "bunker", counts.bunker, rng, bunkerFallbackPool).map((card) => toFaced(card, false));
    const threats = drawManyFromAssets(threatDeck, "threat", counts.threats + 1, rng, threatFallbackPool).map((card) => toFaced(card, false));
    return {
        disaster,
        bunker,
        threats,
        counts,
    };
};
