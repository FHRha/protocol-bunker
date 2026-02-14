export type CardFaceContext = {
  mode: "player" | "host" | "spectator";
  control?: boolean;
  viewer?: boolean;
};

type UnknownCard = {
  revealed?: boolean;
  faceUp?: boolean;
  isRevealed?: boolean;
  status?: string;
  frontId?: string;
  cardIdFront?: string;
};

function asRecord(card: unknown): UnknownCard {
  if (!card || typeof card !== "object") return {};
  return card as UnknownCard;
}

export function shouldShowCardFront(card: unknown, ctx: CardFaceContext): boolean {
  const source = asRecord(card);
  const byFlag =
    source.revealed === true ||
    source.faceUp === true ||
    source.isRevealed === true ||
    source.status === "revealed";
  const byExplicitFrontRef = Boolean(source.frontId || source.cardIdFront);

  if (ctx.mode === "spectator") {
    return byFlag || byExplicitFrontRef;
  }

  return byFlag;
}

