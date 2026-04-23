import { useEffect, useState } from "react";

interface CardTileProps {
  src?: string;
  fallback: string;
  overlayLabel?: string;
}

export function CardTile({ src, fallback, overlayLabel }: CardTileProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="card-tile fallback">
        <span>{fallback}</span>
      </div>
    );
  }

  return (
    <div className="card-tile">
      <img
        src={src}
        alt={overlayLabel ?? fallback}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      {overlayLabel ? <span className="card-tile-label">{overlayLabel}</span> : null}
    </div>
  );
}
