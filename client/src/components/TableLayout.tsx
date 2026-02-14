import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicPlayerView, WorldState30 } from "@bunker/shared";
import { ru } from "../i18n/ru";

interface TableLayoutProps {
  players: PublicPlayerView[];
  youId: string | null;
  selectedId?: string | null;
  onSelect?: (playerId: string) => void;
  world?: WorldState30;
  worldThreatsTotal?: number;
  onWorldClick?: () => void;
}

interface Size {
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function TableLayout({
  players,
  youId,
  selectedId,
  onSelect,
  world,
  worldThreatsTotal,
  onWorldClick,
}: TableLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [now, setNow] = useState(() => Date.now());
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateSize = () => {
      const next: Size = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
      setSize(next);
    };

    updateSize();

    const observer = new ResizeObserver(() => updateSize());
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    lastUpdateRef.current = Date.now();
  }, [players]);

  const orderedPlayers = useMemo(() => {
    if (!youId) return players;
    const index = players.findIndex((player) => player.playerId === youId);
    if (index === -1) return players;
    return [players[index], ...players.slice(index + 1), ...players.slice(0, index)];
  }, [players, youId]);

  const total = orderedPlayers.length || 1;
  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const base = Math.min(size.width, size.height);
  const cardSize = clamp(Math.round(base / (total > 6 ? 6.2 : 5.2)), 64, 110);
  const padding = 12;
  const radius = Math.max(0, base / 2 - cardSize / 2 - padding);
  let tableSize = clamp(Math.round(base * 0.45), 140, Math.round(base * 0.65));
  const maxTable = Math.max(120, radius * 1.4);
  if (tableSize > maxTable) tableSize = Math.round(maxTable);

  const startAngle = Math.PI / 2;
  const step = (Math.PI * 2) / total;

  const formatRemaining = (ms?: number) => {
    if (!ms || ms <= 0) return "";
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const worldThreatCountDisplay =
    world && typeof worldThreatsTotal === "number"
      ? Math.max(0, Math.min(world.threats.length, worldThreatsTotal))
      : world?.counts.threats;

  return (
    <div className="table-layout" ref={containerRef}>
      {size.width > 0 && size.height > 0 ? (
        <>
          <div
            className="table-surface"
            style={{
              width: tableSize,
              height: tableSize,
              left: centerX - tableSize / 2,
              top: centerY - tableSize / 2,
            }}
          >
            {world ? (
              <button type="button" className="table-world" onClick={onWorldClick}>
                <div className="table-world-title">
                  Бункер: {world.bunker.filter((card) => card.isRevealed).length}/{world.counts.bunker}
                </div>
                <div className="table-world-title">Катастрофа: {world.disaster.title}</div>
                <div className="table-world-title">
                  Угрозы:{" "}
                  {world.threats.some((card) => card.isRevealed)
                    ? `${world.threats.filter((card) => card.isRevealed).length}/${worldThreatCountDisplay}`
                    : "скрыто"}
                </div>
                <div className="table-world-hint">Нажми на центр стола, чтобы посмотреть карточки</div>
              </button>
            ) : null}
          </div>
          {orderedPlayers.map((player, index) => {
            const angle = startAngle + index * step;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            const left = x - cardSize / 2;
            const top = y - cardSize / 2;
            const isYou = player.playerId === youId;
            const isSelected = player.playerId === selectedId;
            const label = isYou ? `${player.name} (${ru.youBadge})` : player.name;
            const elapsed = now - lastUpdateRef.current;
            const remainingMs =
              player.kickRemainingMs && elapsed > 0
                ? Math.max(0, player.kickRemainingMs - elapsed)
                : player.kickRemainingMs;
            const remainingText =
              !player.connected && !player.leftBunker ? formatRemaining(remainingMs) : "";

            const className = [
              "table-seat",
              isYou ? "you" : "",
              isSelected ? "selected" : "",
              player.status === "eliminated" ? "eliminated" : "",
              player.status === "left_bunker" ? "left-bunker" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={player.playerId}
                type="button"
                className={className}
                style={{
                  width: cardSize,
                  height: cardSize,
                  left,
                  top,
                }}
                onClick={() => onSelect?.(player.playerId)}
              >
                <div className="seat-name">{label || `Игрок ${index + 1}`}</div>
                {remainingText ? (
                  <div className="seat-remaining">{ru.leftTimeLabel(remainingText)}</div>
                ) : null}
              </button>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
