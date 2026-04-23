import { getCardBackUrl, getCardFaceUrl } from "../cards";
import { shouldShowCardFront } from "../game/cardFacePolicy";

interface SpectatorWorldCardTileProps {
  revealed: boolean;
  imageId?: string;
  label: string;
  backDeck?: string;
  cardLocale: "ru" | "en";
}

export function SpectatorWorldCardTile({
  revealed,
  imageId,
  label,
  backDeck,
  cardLocale,
}: SpectatorWorldCardTileProps) {
  const frontVisible = shouldShowCardFront(
    {
      isRevealed: revealed,
      frontId: imageId,
    },
    { mode: "spectator" }
  );
  const faceSrc = frontVisible ? getCardFaceUrl(imageId) : undefined;
  const backSrc = backDeck ? getCardBackUrl(backDeck, cardLocale) : undefined;

  if (faceSrc) {
    return (
      <div className="card-tile" title={label}>
        <img src={faceSrc} alt={label} loading="lazy" decoding="async" />
      </div>
    );
  }

  if (frontVisible) {
    return (
      <div className="card-tile fallback" title={label}>
        <span>{label}</span>
      </div>
    );
  }

  if (backSrc) {
    return (
      <div className="card-tile" title={label}>
        <img src={backSrc} alt={label} loading="lazy" decoding="async" />
      </div>
    );
  }

  return (
    <div className="card-tile fallback" title={label}>
      <span>{label}</span>
    </div>
  );
}
