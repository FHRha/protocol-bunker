import {
  getTargetCandidates,
  type CardRef,
  type CardInHand,
  type GameView,
  type LobbyBotLanguage,
  type PublicPlayerView,
  type ScenarioActionResult,
  type SpecialConditionInstance,
} from "@bunker/shared";
import fs from "node:fs";
import path from "node:path";
import type { Room } from "../core/types.js";
import { ASSETS_ROOT } from "../config/runtime.js";
import { getDisasterTextByAssetId } from "../assets/world_texts.js";
import { localizeSpecialConditionField } from "../locales/specialConditionLocale.js";
import { tServer, type ServerLocaleCode } from "../locales/serverLocale.js";
import { getHiddenRevealCandidates, pickRequiredRevealCard } from "./revealChoice.js";

export interface AiBotConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  log?: (event: string, details: Record<string, unknown>) => void;
}

export interface AiBotDecision {
  botPlayerId: string;
  action: "revealCard" | "continueRound" | "vote";
  explanation: string;
  explanationVars?: Record<string, string | number>;
  pendingSpecial?: AiPendingSpecialDecision;
  stateChanged: boolean;
}

interface AiModelDecision {
  action?: "revealCard" | "vote";
  cardInstanceId?: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  explanation?: string;
  specialCondition?: {
    use?: boolean;
    specialInstanceId?: string;
    delayMs?: number;
    reason?: string;
    targetPlayerId?: string;
    targetCardInstanceId?: string;
    sourceCardInstanceId?: string;
    category?: string;
    bunkerIndex?: number;
    specialId?: string;
    baggageCardId?: string;
  };
}

interface AiDecisionRequestResult {
  decision: AiModelDecision | null;
  fallbackReason?: string;
  status?: number;
  detail?: string;
}

export interface AiPendingSpecialDecision {
  specialInstanceId: string;
  delayMs: number;
  reason: string;
  payload: Record<string, unknown>;
}

const LANGUAGE_LABELS: Record<LobbyBotLanguage, string> = {
  ru: "Russian",
  en: "English",
};

const LANGUAGE_PROMPT_GUIDANCE: Record<LobbyBotLanguage, string> = {
  ru: [
    "Пиши explanation только по-русски, естественно и без смешения с английским.",
    "Названия карт в JSON уже переведены на этот язык. Используй их как есть и не смешивай с другим языком.",
    `Сделай explanation человеческим: 2-3 предложения, примерно 300-450 символов, без канцелярита и без повторения служебных слов из JSON.`,
  ].join(" "),
  en: [
    "Write explanation only in English, naturally and without mixing in Russian.",
    "Card names in the JSON are already localized to this language. Use them as-is and do not switch languages.",
    `Keep explanation human-like: 2-3 sentences, about 300-450 characters, no jargon and no repetition of JSON field names.`,
  ].join(" "),
};

const LANGUAGE_LOCALES: Record<LobbyBotLanguage, ServerLocaleCode> = {
  ru: "ru",
  en: "en",
};
const SPECIAL_BASE_USE_CHANCE = 0.22;
const SPECIAL_REPEAT_DECAY = 0.45;
const AI_GATEWAY_MAX_TIMEOUT_MS = 45_000;
const AI_EXPLANATION_MIN_CHARS = 300;
const AI_EXPLANATION_MAX_CHARS = 450;
const aiRequestsInFlight = new WeakMap<Room, Set<string>>();

type AiCardLocaleDictionary = {
  decks: Record<string, string>;
  cards: Record<string, string>;
};

type AiCardLocaleReverseDictionary = {
  decks: Map<string, string>;
  cards: Map<string, string>;
};

const AI_CARD_LOCALE_DICTIONARIES: Record<LobbyBotLanguage, AiCardLocaleDictionary> = {
  ru: readCardLocaleDictionary(ASSETS_ROOT, "ru"),
  en: readCardLocaleDictionary(ASSETS_ROOT, "en"),
};

const AI_CARD_LOCALE_REVERSE_DICTIONARIES: Record<LobbyBotLanguage, AiCardLocaleReverseDictionary> = {
  ru: buildReverseCardLocaleDictionary(AI_CARD_LOCALE_DICTIONARIES.ru),
  en: buildReverseCardLocaleDictionary(AI_CARD_LOCALE_DICTIONARIES.en),
};

function asChanged(result: ScenarioActionResult): boolean {
  return !result.error && Boolean(result.stateChanged);
}

function trimText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function readCardLocaleDictionary(assetsRoot: string, locale: ServerLocaleCode): AiCardLocaleDictionary {
  const candidatePaths = [
    path.resolve(assetsRoot, "..", "locales", "cards", `${locale}.json`),
    path.resolve(assetsRoot, "..", "..", "locales", "cards", `${locale}.json`),
    path.resolve(assetsRoot, "..", "locales", `${locale}.json`),
    path.resolve(assetsRoot, "..", "..", "locales", `${locale}.json`),
    path.join(assetsRoot, "locales", "cards", `${locale}.json`),
    path.join(assetsRoot, "decks", "locales", `${locale}.json`),
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) continue;
    try {
      const raw = fs.readFileSync(candidatePath, "utf8");
      const parsed = JSON.parse(raw) as { decks?: unknown; cards?: unknown };
      return {
        decks: parsed.decks && typeof parsed.decks === "object" ? (parsed.decks as Record<string, string>) : {},
        cards: parsed.cards && typeof parsed.cards === "object" ? (parsed.cards as Record<string, string>) : {},
      };
    } catch {
      // Fall through to the next candidate path.
    }
  }

  return { decks: {}, cards: {} };
}

function buildReverseCardLocaleDictionary(dictionary: AiCardLocaleDictionary): AiCardLocaleReverseDictionary {
  const decks = new Map<string, string>();
  const cards = new Map<string, string>();
  for (const [key, value] of Object.entries(dictionary.decks)) {
    decks.set(normalizePromptLabel(value), key);
  }
  for (const [key, value] of Object.entries(dictionary.cards)) {
    cards.set(normalizePromptLabel(value), key);
  }
  return { decks, cards };
}

function normalizeCardKey(value: string): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

  function normalizePromptLabel(value: string): string {
    return String(value ?? "")
      .trim()
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

function resolveCardKeyFromCardId(cardId: string): { deckId: string; cardId: string } | null {
  const raw = String(cardId ?? "").trim();
  if (!raw) return null;

  if (raw.includes("/")) {
    const parts = raw.split("/").filter(Boolean);
    const decksIndex = parts.findIndex((part) => part.toLowerCase() === "decks");
    if (decksIndex >= 0) {
      const tail = parts.slice(decksIndex + 1);
      if (tail.length >= 2) {
        const deckId = normalizeCardKey(tail[0] ?? "");
        const cardIdPart = normalizeCardKey(tail.slice(1).join("/").replace(/\.[a-z0-9]{2,4}$/i, ""));
        return deckId && cardIdPart ? { deckId, cardId: cardIdPart } : null;
      }
    }
  }

  const normalized = normalizeCardKey(raw);
  const knownDecks = ["profession", "health", "hobby", "baggage", "fact", "biology", "special", "bunker", "disaster", "threat", "back"];
  for (const deckId of knownDecks) {
    if (normalized.startsWith(`${deckId}-`)) return { deckId, cardId: normalized.slice(deckId.length + 1) };
    if (normalized.startsWith(`${deckId}.`)) return { deckId, cardId: normalized.slice(deckId.length + 1) };
    if (normalized === deckId) return { deckId, cardId: "" };
  }

  return null;
}

function localizeCardTextForLanguage(assetId: string | undefined, fallbackText: string, language: LobbyBotLanguage): string {
  const dict = AI_CARD_LOCALE_DICTIONARIES[language];
  const fallbackLabel = String(fallbackText || assetId || "");
  const key = assetId ? resolveCardKeyFromCardId(assetId) : null;
  if (!key) return fallbackLabel;
  const cardKey = key.cardId ? `${key.deckId}.${key.cardId}` : key.deckId;
  return dict.cards[cardKey] ?? fallbackLabel ?? dict.decks[key.deckId] ?? String(assetId ?? "");
}

function localizeVisibleLabelTextForLanguage(value: string | undefined, language: LobbyBotLanguage): string {
  const fallback = String(value ?? "").trim();
  if (!fallback) return fallback;
  const normalized = normalizePromptLabel(fallback);
  const reverse = AI_CARD_LOCALE_REVERSE_DICTIONARIES.en.cards.get(normalized) ?? AI_CARD_LOCALE_REVERSE_DICTIONARIES.ru.cards.get(normalized);
  if (!reverse) {
    const deckReverse = AI_CARD_LOCALE_REVERSE_DICTIONARIES.en.decks.get(normalized) ?? AI_CARD_LOCALE_REVERSE_DICTIONARIES.ru.decks.get(normalized);
    if (!deckReverse) return fallback;
    return AI_CARD_LOCALE_DICTIONARIES[language].decks[deckReverse] ?? fallback;
  }
  return AI_CARD_LOCALE_DICTIONARIES[language].cards[reverse] ?? fallback;
}

function localizeCardLabelForLanguage(card: CardRef | undefined, language: LobbyBotLanguage): string {
  if (!card) return "";
  return localizeCardTextForLanguage(card.id, String(card.labelShort || card.id || card.deck || ""), language);
}

function localizeVisibleCardPayload(
  view: GameView,
  card: CardInHand,
  language: LobbyBotLanguage
): Pick<CardInHand, "id" | "instanceId" | "deck" | "labelShort" | "revealed"> & { category?: string } {
  return {
    id: card.id,
    instanceId: card.instanceId,
    deck: card.deck,
    labelShort: localizeCardLabelForLanguage(card, language),
    revealed: card.revealed,
    category: localizeCardCategoryLabel(getCardCategoryForPrompt(view, card), language),
  };
}

function fallbackExplanation(language: LobbyBotLanguage): string {
  return tServer(LANGUAGE_LOCALES[language], "match.bot.ai.fallback");
}

function getCardLabel(card: CardInHand | undefined, language: LobbyBotLanguage): string {
  return localizeCardLabelForLanguage(card, language);
}

function localizeCategoryCardLabelForLanguage(card: { instanceId?: string; labelShort: string }, language: LobbyBotLanguage, instanceLabelById?: Map<string, string>): string {
  if (card.instanceId && instanceLabelById?.has(card.instanceId)) {
    return instanceLabelById.get(card.instanceId) ?? card.labelShort;
  }
  return localizeVisibleLabelTextForLanguage(card.labelShort, language);
}

function getVisibleCards(view: GameView, language: LobbyBotLanguage): Array<Pick<CardInHand, "id" | "instanceId" | "deck" | "labelShort" | "revealed"> & { category?: string }> {
  return view.you.hand.map((card) => localizeVisibleCardPayload(view, card, language));
}

function getCardCategoryForPrompt(view: GameView, card: CardInHand): string {
  return (view.you.categories ?? []).find((slot) => slot.cards.some((entry) => entry.instanceId === card.instanceId))?.category ?? card.deck;
}

function localizeCardCategoryLabel(category: string, language: LobbyBotLanguage): string {
  const deckKey = normalizeCardKey(category);
  const dict = AI_CARD_LOCALE_DICTIONARIES[language];
  return dict.decks[deckKey] ?? category;
}

function localizeYouCategoriesForLanguage(view: GameView, language: LobbyBotLanguage): Array<{
  category: string;
  cards: Array<{ id?: string; instanceId: string; labelShort: string; revealed: boolean; imgUrl?: string }>;
}> {
  const handLabelByInstanceId = new Map<string, string>(
    view.you.hand
      .filter((card): card is CardInHand & { instanceId: string } => Boolean(card.instanceId))
      .map((card) => [card.instanceId, localizeCardLabelForLanguage(card, language)] as const)
  );
  const handIdByInstanceId = new Map<string, string>(
    view.you.hand
      .filter((card): card is CardInHand & { instanceId: string } => Boolean(card.instanceId))
      .map((card) => [card.instanceId, card.id] as const)
  );
  return (view.you.categories ?? []).map((slot) => ({
    category: localizeCardCategoryLabel(slot.category, language),
    cards: slot.cards.map((card) => ({
      id: handIdByInstanceId.get(card.instanceId),
      ...card,
      labelShort: localizeCategoryCardLabelForLanguage(card, language, handLabelByInstanceId),
    })),
  }));
}

function localizeVisiblePlayerCategoriesForLanguage(
  player: PublicPlayerView,
  language: LobbyBotLanguage,
  revealedLabelByInstanceId: Map<string, string>,
  revealedIdByInstanceId: Map<string, string>
): Array<{
  category: string;
  status: string;
  cards: Array<{ id?: string; labelShort: string; imgUrl?: string; instanceId?: string; hidden?: boolean; backCategory?: string }>;
}> {
  return (player.categories ?? []).map((slot) => ({
    category: localizeCardCategoryLabel(slot.category, language),
    status: slot.status,
    cards: slot.cards.map((card) => ({
      id: card.instanceId ? revealedIdByInstanceId.get(card.instanceId) : undefined,
      ...card,
      labelShort: localizeCategoryCardLabelForLanguage(card, language, revealedLabelByInstanceId),
    })),
  }));
}

function localizeWorldCardForLanguage<T extends { id: string; imageId?: string; title: string; description: string; text?: string }>(
  card: T,
  language: LobbyBotLanguage
): T {
  const assetId = card.imageId ?? card.id;
  return {
    ...card,
    title: localizeCardTextForLanguage(assetId, card.title, language),
    description: localizeCardTextForLanguage(assetId, card.description, language),
    ...(getDisasterTextByAssetId(assetId, language) ? { text: getDisasterTextByAssetId(assetId, language) } : {}),
  };
}

function getLegalRevealCards(view: GameView): CardInHand[] {
  const requiredCard = pickRequiredRevealCard(view);
  return requiredCard ? [requiredCard] : getHiddenRevealCandidates(view);
}

function buildFallbackRevealExplanation(view: GameView, card: CardInHand, language: LobbyBotLanguage): string {
  const cardLabel = card.id;
  const disaster = view.world?.disaster.title;
  if (language === "en") {
    return disaster
      ? `I reveal "${cardLabel}": this is the clearest visible link to ${disaster} right now.`
      : `I reveal "${cardLabel}": this gives the table concrete information to judge me.`;
  }
  return disaster
    ? `Раскрываю «${cardLabel}»: это сейчас понятнее всего связать с катастрофой «${disaster}».`
    : `Раскрываю «${cardLabel}»: так столу проще оценить мою роль.`;
}

function ensureRevealExplanationMentionsCard(explanation: string, card: CardInHand, language: LobbyBotLanguage): string {
  const cardLabel = card.id;
  if (!cardLabel) return explanation;
  const lowerExplanation = explanation.toLocaleLowerCase(language === "en" ? "en-US" : "ru-RU");
  if (lowerExplanation.includes(cardLabel.toLocaleLowerCase(language === "en" ? "en-US" : "ru-RU"))) return explanation;
  return language === "en" ? `I reveal "${cardLabel}". ${explanation}` : `Раскрываю «${cardLabel}». ${explanation}`;
}

function buildAlivePlayerOrder(view: GameView): string[] {
  return view.public.players.filter((player) => player.status === "alive").map((player) => player.playerId);
}

function normalizeCategoryKey(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/\u0451/g, "\u0435")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "fact" || normalized === "facts" || normalized === "факт" || normalized === "факты") return "facts";
  return normalized;
}

function categoryMatches(actual: string, expected: string): boolean {
  const actualKey = normalizeCategoryKey(actual);
  const expectedKey = normalizeCategoryKey(expected);
  if (actualKey === expectedKey) return true;
  return expectedKey === "facts" && (actualKey === "facts1" || actualKey === "facts2");
}

function countRevealedCategoryCards(view: GameView, category: string): number {
  return view.public.players.reduce((count, player) => {
    if (player.status !== "alive") return count;
    const slotCount = (player.categories ?? [])
      .filter((slot) => slot.status === "revealed" && categoryMatches(slot.category, category))
      .reduce((sum, slot) => sum + slot.cards.filter((card) => !card.hidden).length, 0);
    return count + slotCount;
  }, 0);
}

function countRevealedSpecialCards(view: GameView): number {
  return view.public.players.reduce((count, player) => {
    return (
      count +
      (player.categories ?? [])
        .filter((slot) => slot.status === "revealed" && slot.category === "special")
        .reduce((sum, slot) => sum + slot.cards.filter((card) => !card.hidden).length, 0)
    );
  }, 0);
}

function passesSpecialBoardRequirements(special: SpecialConditionInstance, view: GameView): boolean {
  const effectType = String(special.effect?.type ?? "");
  const category = String(special.effect?.params?.category ?? "");
  if (effectType === "forceRevealCategoryForAll") {
    if (view.phase !== "reveal" && view.phase !== "reveal_discussion") return false;
    if (view.public.roundRules?.forcedRevealCategory) return false;
    return true;
  }
  if (effectType === "redealAllRevealed") {
    return Boolean(category) && countRevealedCategoryCards(view, category) >= 2;
  }
  if (
    effectType === "swapRevealedWithNeighbor" ||
    effectType === "replaceRevealedCard" ||
    effectType === "discardRevealedAndDealHidden"
  ) {
    return Boolean(category) && countRevealedCategoryCards(view, category) > 0;
  }
  return true;
}

function shouldConsiderSpecial(view: GameView): boolean {
  return Math.random() <= SPECIAL_BASE_USE_CHANCE * SPECIAL_REPEAT_DECAY ** countRevealedSpecialCards(view);
}

function buildSpecialCandidates(scenarioId: string | undefined, view: GameView, language: LobbyBotLanguage): Array<{
  specialInstanceId: string;
  title: string;
  text: string;
  trigger: string;
  effectType: string;
  choiceKind: string;
  targetScope?: string;
  targetCandidates: Array<Pick<PublicPlayerView, "playerId" | "name" | "status" | "revealedCount">>;
}> {
  const aliveOrder = buildAlivePlayerOrder(view);
  const aliveSet = new Set(aliveOrder);
  if (!shouldConsiderSpecial(view)) return [];
  return (view.you.specialConditions ?? [])
    .filter((special) => isSpecialAllowedForAi(special, view))
    .map((special) => {
      const scope = special.targetScope;
      const candidateIds = scope && scope !== "self" ? getTargetCandidates(scope, view.you.playerId, aliveOrder, aliveSet) : [];
      return {
        specialInstanceId: special.instanceId,
        title: localizeSpecialConditionField(scenarioId, special.id, "title", special.title, language === "en" ? "en" : "ru"),
        text: localizeSpecialConditionField(scenarioId, special.id, "text", special.text, language === "en" ? "en" : "ru"),
        trigger: special.trigger,
        effectType: String(special.effect?.type ?? ""),
        choiceKind: special.choiceKind ?? (special.needsChoice ? "player" : "none"),
        targetScope: scope,
        targetCandidates:
          scope === "self"
            ? view.public.players.filter((player) => player.playerId === view.you.playerId)
            : candidateIds
                .map((id) => view.public.players.find((player) => player.playerId === id))
                .filter((player): player is PublicPlayerView => player !== undefined)
                .map(({ playerId, name, status, revealedCount }) => ({ playerId, name, status, revealedCount })),
      };
    });
}

function isSpecialAllowedForAi(special: SpecialConditionInstance, view: GameView): boolean {
  if (special.used || !special.implemented || special.pendingActivation) return false;
  if (special.trigger === "secret_onEliminate" || special.trigger === "onOwnerEliminated") return false;
  if (special.trigger === "onVote" && view.phase !== "voting") return false;
  if (special.effect?.type === "forceRevote" && view.public.votePhase !== "voteSpecialWindow") return false;
  if (!passesSpecialBoardRequirements(special, view)) return false;
  const choiceKind = special.choiceKind ?? (special.needsChoice ? "player" : "none");
  if (choiceKind === "category" || choiceKind === "bunker" || choiceKind === "special") return false;
  const categoryKey = String(special.effect?.params?.category ?? "");
  const needsCardChoice =
    categoryKey &&
    (special.effect.type === "swapRevealedWithNeighbor" ||
      special.effect.type === "replaceRevealedCard" ||
      special.effect.type === "discardRevealedAndDealHidden");
  if (needsCardChoice) return false;
  return view.phase === "voting" || view.phase === "reveal_discussion" || view.phase === "reveal";
}

function buildPrompt(scenarioId: string | undefined, view: GameView, language: LobbyBotLanguage): string {
  const legalRevealCards = getLegalRevealCards(view).map((card) => ({
    id: card.id,
    cardInstanceId: card.instanceId,
    category: localizeCardCategoryLabel(getCardCategoryForPrompt(view, card), language),
    labelShort: localizeCardLabelForLanguage(card, language),
    deck: card.deck,
  }));
  const revealedLabelByInstanceId = new Map<string, string>(
    view.public.players.flatMap((player) =>
      player.revealedCards
        .filter((card): card is CardRef & { instanceId: string } => Boolean(card.instanceId))
        .map((card) => [card.instanceId, localizeCardLabelForLanguage(card, language)] as const)
    )
  );
  const revealedIdByInstanceId = new Map<string, string>(
    view.public.players.flatMap((player) =>
      player.revealedCards
        .filter((card): card is CardRef & { instanceId: string } => Boolean(card.instanceId))
        .map((card) => [card.instanceId, card.id] as const)
    )
  );
  const visiblePlayers = view.public.players.map((player) => ({
    playerId: player.playerId,
    name: player.name,
    status: player.status,
    revealedCount: player.revealedCount,
    revealedCards: player.revealedCards.map((card) => ({
      id: card.id,
      deck: card.deck,
      labelShort: localizeCardLabelForLanguage(card, language),
    })),
    categories: localizeVisiblePlayerCategoriesForLanguage(player, language, revealedLabelByInstanceId, revealedIdByInstanceId),
  }));
  const payload = {
    language: LANGUAGE_LABELS[language],
    phase: view.phase,
    round: view.round,
    currentTurnPlayerId: view.public.currentTurnPlayerId,
    canContinue: Boolean(view.public.canContinue),
    roundRules: view.public.roundRules,
    votePhase: view.public.votePhase,
    hasVoted: Boolean(view.public.voting?.hasVoted),
    you: {
      playerId: view.you.playerId,
      name: view.you.name,
      hand: getVisibleCards(view, language),
      legalRevealCards,
      categories: localizeYouCategoriesForLanguage(view, language),
    },
    world: view.world
      ? {
          disaster: localizeWorldCardForLanguage(view.world.disaster, language),
          revealedThreats: view.world.threats
            .filter((card) => card.isRevealed)
            .map((card) => localizeWorldCardForLanguage(card, language)),
          revealedBunker: view.world.bunker
            .filter((card) => card.isRevealed)
            .map((card) => localizeWorldCardForLanguage(card, language)),
        }
      : undefined,
    visiblePlayers,
    voteCandidateIds: view.public.voteCandidateIds ?? [],
    disallowedVoteTargetIds: view.public.disallowedVoteTargetIdsForYou ?? [],
    specialActionContext: {
      rule: "Optional. If a useful special condition is available, set specialCondition.use=true. The server starts delayMs only after this JSON is received.",
      delayMsRange: { min: 1500, max: 12000 },
      availableSpecials: buildSpecialCandidates(scenarioId, view, language),
    },
  };

  return [
    "You are an AI player in a social survival game called Bunker.",
    "Use only the visible JSON state. Do not invent hidden cards or secret information.",
    LANGUAGE_PROMPT_GUIDANCE[language],
    "Return exactly one JSON object and keep the field names exactly as shown in the schema.",
    "Choose exactly one legal action for the current phase.",
    "In reveal phase, choose cardInstanceId only from you.legalRevealCards. If there is exactly one legalRevealCards item, use exactly that cardInstanceId.",
    `Reveal explanation should sound like a real player talking. Use the selected card id exactly as shown in you.legalRevealCards.id, and use card ids from categories when you refer to open cards. Explain why this card matters now, mention the disaster or the visible world when helpful, and stay between ${AI_EXPLANATION_MIN_CHARS} and ${AI_EXPLANATION_MAX_CHARS} characters. Do not use labelShort here. Avoid generic phrases like 'first card' or 'no forced reveal'.`,
    "In voting phase, choose one legal targetPlayerId. You may mention the player's name in explanation, but targetPlayerId is authoritative.",
    `Voting explanation should sound like a real player talking. Mention concrete visible cards and player names when relevant, and stay between ${AI_EXPLANATION_MIN_CHARS} and ${AI_EXPLANATION_MAX_CHARS} characters.`,
    "If voteCandidateIds is not empty, targetPlayerId must be one of voteCandidateIds.",
    "Optional special condition block: if it helps your position or timing, choose one available special condition. Use only listed specialInstanceId and targetCandidates.",
    "For specialCondition.delayMs, choose a human-like delay in milliseconds. Use 0-12000, usually 1500-7000.",
    "Never choose continueRound. The server handles round continuation separately.",
    "Return only JSON with this shape and no extra text before or after it:",
    '{"action":"revealCard|vote","cardInstanceId":"...","targetPlayerId":"...","explanation":"short human-like reason","specialCondition":{"use":false,"specialInstanceId":"...","delayMs":3500,"reason":"short reason","targetPlayerId":"..."}}',
    JSON.stringify(payload),
  ].join("\n");
}

function parseJsonObject(text: string): AiModelDecision | null {
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as AiModelDecision;
  } catch {
    return null;
  }
}

async function requestAiDecision(
  scenarioId: string | undefined,
  view: GameView,
  config: AiBotConfig,
  language: LobbyBotLanguage
): Promise<AiDecisionRequestResult> {
  if (!config.baseUrl || !config.apiKey || !config.model) {
    return { decision: null, fallbackReason: "missing_config" };
  }
  const controller = new AbortController();
  const effectiveTimeoutMs = Math.min(Math.max(1_000, config.timeoutMs), AI_GATEWAY_MAX_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content: "Return valid JSON only. Never reveal hidden information.",
          },
          {
            role: "user",
            content: buildPrompt(scenarioId, view, language),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { decision: null, fallbackReason: "http_error", status: response.status };
    }
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content.trim()) {
      return { decision: null, fallbackReason: "empty_response" };
    }
    const decision = parseJsonObject(content);
    if (!decision) {
      return { decision: null, fallbackReason: "parse_error", detail: `contentLength=${content.length}` };
    }
    return { decision };
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timeout" : "request_error";
    const detail = error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160);
    return { decision: null, fallbackReason: reason, detail };
  } finally {
    clearTimeout(timeout);
  }
}

function pickFallbackModelDecision(view: GameView): AiModelDecision | null {
  if (view.phase === "reveal" && view.public.currentTurnPlayerId === view.you.playerId) {
    const card = getLegalRevealCards(view)[0];
    return card ? { action: "revealCard", cardInstanceId: card.instanceId } : null;
  }
  if (view.phase === "voting" && view.public.votePhase === "voting" && !view.public.voting?.hasVoted) {
    const disallowed = new Set(view.public.disallowedVoteTargetIdsForYou ?? []);
    const candidates = new Set(view.public.voteCandidateIds ?? []);
    const target = view.public.players.find(
      (player) =>
        player.playerId !== view.you.playerId &&
        player.status === "alive" &&
        !disallowed.has(player.playerId) &&
        (candidates.size === 0 || candidates.has(player.playerId))
    );
    return target ? { action: "vote", targetPlayerId: target.playerId, targetPlayerName: target.name } : null;
  }
  return null;
}

function clampSpecialDelayMs(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(12_000, parsed));
}

function buildAiPendingSpecial(view: GameView, decision: AiModelDecision): AiPendingSpecialDecision | undefined {
  const specialDecision = decision.specialCondition;
  if (!specialDecision?.use) return undefined;
  if (!shouldConsiderSpecial(view)) return undefined;
  const special = view.you.specialConditions.find((entry) => entry.instanceId === specialDecision.specialInstanceId);
  if (!special || !isSpecialAllowedForAi(special, view)) return undefined;
  const payload = buildAiSpecialPayload(view, special, specialDecision);
  if (!payload) return undefined;
  return {
    specialInstanceId: special.instanceId,
    delayMs: clampSpecialDelayMs(specialDecision.delayMs),
    reason: trimText(specialDecision.reason, 180),
    payload,
  };
}

function buildAiSpecialPayload(
  view: GameView,
  special: SpecialConditionInstance,
  decision: NonNullable<AiModelDecision["specialCondition"]>
): Record<string, unknown> | null {
  const choiceKind = special.choiceKind ?? (special.needsChoice ? "player" : "none");
  if (choiceKind === "none") return {};
  if (choiceKind !== "player" && choiceKind !== "neighbor") return null;
  const scope = special.targetScope;
  if (!scope) return null;
  if (scope === "self") return { targetPlayerId: view.you.playerId };
  const aliveOrder = buildAlivePlayerOrder(view);
  const aliveSet = new Set(aliveOrder);
  let candidateIds = getTargetCandidates(scope, view.you.playerId, aliveOrder, aliveSet);
  if (!special.allowSelfTarget && scope !== "any_including_self") {
    candidateIds = candidateIds.filter((id) => id !== view.you.playerId);
  }
  const targetPlayerId = String(decision.targetPlayerId ?? "");
  if (!candidateIds.includes(targetPlayerId)) return null;
  return { targetPlayerId };
}

function getSelfPublicStatus(view: GameView): PublicPlayerView["status"] | undefined {
  return view.public.players.find((player) => player.playerId === view.you.playerId)?.status;
}

function applyAutoContinueDecision(room: Room, view: GameView): AiBotDecision | null {
  if (!room.session) return null;
  if (view.phase !== "reveal_discussion" || !view.public.canContinue) return null;
  const result = room.session.handleAction(view.you.playerId, { type: "continueRound", payload: {} });
  if (result.error) return null;
  return {
    botPlayerId: view.you.playerId,
    action: "continueRound",
    explanation: "",
    stateChanged: asChanged(result),
  };
}

function applyModelDecision(room: Room, view: GameView, decision: AiModelDecision, language: LobbyBotLanguage): AiBotDecision | null {
  if (!room.session) return null;

  if (decision.action === "revealCard" && view.phase === "reveal" && view.public.currentTurnPlayerId === view.you.playerId) {
    const card = getLegalRevealCards(view).find((entry) => entry.instanceId === decision.cardInstanceId);
    if (!card?.instanceId) return null;
    const explanation = String(decision.explanation ?? "").trim()
      ? ensureRevealExplanationMentionsCard(String(decision.explanation).trim(), card, language)
      : buildFallbackRevealExplanation(view, card, language);
    const result = room.session.handleAction(view.you.playerId, { type: "revealCard", payload: { cardId: card.instanceId } });
    if (result.error) return null;
    return {
      botPlayerId: view.you.playerId,
      action: "revealCard",
      explanation,
      explanationVars: { cardId: card.id, cardInstanceId: card.instanceId },
      pendingSpecial: buildAiPendingSpecial(view, decision),
      stateChanged: asChanged(result),
    };
  }

  if (decision.action === "vote" && view.phase === "voting" && view.public.votePhase === "voting" && !view.public.voting?.hasVoted) {
    const explanation = String(decision.explanation ?? "").trim() || fallbackExplanation(language);
    const disallowed = new Set(view.public.disallowedVoteTargetIdsForYou ?? []);
    const candidates = new Set(view.public.voteCandidateIds ?? []);
    const targetId = view.public.players.find(
      (player) =>
        player.playerId === decision.targetPlayerId &&
        player.status === "alive" &&
        !disallowed.has(player.playerId) &&
        (candidates.size === 0 || candidates.has(player.playerId))
    )?.playerId;
    if (!targetId) return null;
    const targetName = view.public.players.find((player) => player.playerId === targetId)?.name;
    const fallbackName = typeof decision.targetPlayerName === "string" ? decision.targetPlayerName.trim() : "";
    if (targetName) {
      decision.targetPlayerName = targetName;
    } else if (!fallbackName) {
      decision.targetPlayerName = targetId;
    }
    const result = room.session.handleAction(view.you.playerId, { type: "vote", payload: { targetPlayerId: targetId } });
    if (result.error) return null;
    return {
      botPlayerId: view.you.playerId,
      action: "vote",
      explanation,
      pendingSpecial: buildAiPendingSpecial(view, decision),
      stateChanged: asChanged(result),
    };
  }

  return null;
}

function getAiRequestsInFlight(room: Room): Set<string> {
  let requests = aiRequestsInFlight.get(room);
  if (!requests) {
    requests = new Set();
    aiRequestsInFlight.set(room, requests);
  }
  return requests;
}

export function hasAiBotRequestInFlight(room: Room, playerId: string): boolean {
  return aiRequestsInFlight.get(room)?.has(playerId) ?? false;
}

export async function runAiBotStep(room: Room, config: AiBotConfig): Promise<AiBotDecision | null> {
  if (!room.session || room.phase !== "game") return null;
  const language = room.settings.bots.aiLanguage;
  const bots = Array.from(room.players.values()).filter((player) => player.isBot && player.botType === "ai" && !player.leftBunker);

  for (const bot of bots) {
    if (hasAiBotRequestInFlight(room, bot.playerId)) continue;
    const view = room.session.getGameView(bot.playerId);
    if (getSelfPublicStatus(view) !== "alive") continue;
    const autoContinue = applyAutoContinueDecision(room, view);
    if (autoContinue) return autoContinue;

    const fallback = pickFallbackModelDecision(view);
    if (!fallback) continue;
    config.log?.("ai-request", {
      room: room.code,
      playerId: bot.playerId,
      phase: view.phase,
      votePhase: view.public.votePhase,
      model: config.model || "unset",
    });
    const inFlight = getAiRequestsInFlight(room);
    inFlight.add(bot.playerId);
    let requestResult: AiDecisionRequestResult;
    try {
      requestResult = await requestAiDecision(room.scenarioId, view, config, language);
    } finally {
      inFlight.delete(bot.playerId);
    }
    if (requestResult.decision) {
      config.log?.("ai-decision", {
        room: room.code,
        playerId: bot.playerId,
        action: requestResult.decision.action ?? "unset",
      });
      const applied = applyModelDecision(room, view, requestResult.decision, language);
      if (applied) return applied;
      config.log?.("ai-fallback", {
        room: room.code,
        playerId: bot.playerId,
        reason: "invalid_model_decision",
        action: requestResult.decision.action ?? "unset",
      });
    } else {
      config.log?.("ai-fallback", {
        room: room.code,
        playerId: bot.playerId,
        reason: requestResult.fallbackReason ?? "unknown",
        status: requestResult.status,
        detail: requestResult.detail,
      });
    }
    return applyModelDecision(room, view, fallback, language);
  }

  return null;
}
