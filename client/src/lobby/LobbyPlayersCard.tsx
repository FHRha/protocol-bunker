import type { RoomState } from "@bunker/shared";

type LobbyPlayer = RoomState["players"][number];

interface LobbyPlayersCardProps {
  title: string;
  visiblePlayers: LobbyPlayer[];
  hostId: string;
  controlId: string | null;
  hostMarker: string;
  controlMarker: string;
  offlineMarker: string;
  extraPlayers: number;
  playerExtraText: string | null;
  canControl: boolean;
  kickCandidatesCount: number;
  kickTitle: string;
  kickButton: string;
  controlsDisabled: boolean;
  transferHostTitle: string;
  transferHostTargetId: string;
  transferHostCandidates: LobbyPlayer[];
  transferHostSelectPlaceholder: string;
  transferHostButton: string;
  startButton: string;
  canStart: boolean;
  isClassic: boolean;
  rulesNeedMinPlayers: string;
  hostOnlyHint: string;
  wsHint: string | null;
  getLobbyPlayerName: (player: LobbyPlayer) => string;
  onOpenKickModal: () => void;
  onTransferHostTargetChange: (value: string) => void;
  onTransferHost: (playerId: string) => void;
  onStart: () => void;
}

export function LobbyPlayersCard({
  title,
  visiblePlayers,
  hostId,
  controlId,
  hostMarker,
  controlMarker,
  offlineMarker,
  extraPlayers,
  playerExtraText,
  canControl,
  kickCandidatesCount,
  kickTitle,
  kickButton,
  controlsDisabled,
  transferHostTitle,
  transferHostTargetId,
  transferHostCandidates,
  transferHostSelectPlaceholder,
  transferHostButton,
  startButton,
  canStart,
  isClassic,
  rulesNeedMinPlayers,
  hostOnlyHint,
  wsHint,
  getLobbyPlayerName,
  onOpenKickModal,
  onTransferHostTargetChange,
  onTransferHost,
  onStart,
}: LobbyPlayersCardProps) {
  return (
    <section className="lobbyCard lobbyCard--players playersCard">
      <div className="lobbyCardHeader">
        <h3 className="lobbyCardTitle">{title}</h3>
      </div>
      <div className="lobbyCardBody">
        <ul className="player-list compact">
          {visiblePlayers.map((player) => {
            const safeName = getLobbyPlayerName(player);
            return (
              <li key={player.playerId}>
                {safeName}
                {player.playerId === hostId ? hostMarker : ""}
                {player.playerId === controlId ? controlMarker : ""}
                {player.connected ? "" : offlineMarker}
              </li>
            );
          })}
        </ul>
        {extraPlayers > 0 && playerExtraText ? <div className="muted player-extra">{playerExtraText}</div> : null}

        {canControl && kickCandidatesCount > 0 ? (
          <div className="formRow">
            <span>{kickTitle}</span>
            <div className="formControlRow">
              <button className="ghost button-small" disabled={controlsDisabled} onClick={onOpenKickModal}>
                {kickButton}
              </button>
            </div>
          </div>
        ) : null}

        {canControl ? (
          <div className="formRow formRow--transferHost">
            <span>{transferHostTitle}</span>
            <div className="formControlRow formControlRow--transferHost">
              <select
                value={transferHostTargetId}
                disabled={controlsDisabled || transferHostCandidates.length === 0}
                onChange={(event) => onTransferHostTargetChange(event.target.value)}
              >
                {transferHostCandidates.length === 0 ? (
                  <option value="" disabled>
                    {transferHostSelectPlaceholder}
                  </option>
                ) : null}
                {transferHostCandidates.map((player) => {
                  const safeName = getLobbyPlayerName(player);
                  return (
                    <option key={player.playerId} value={player.playerId}>
                      {safeName}
                      {player.playerId === controlId ? controlMarker : ""}
                    </option>
                  );
                })}
              </select>
              <button
                className="ghost button-small"
                disabled={!transferHostTargetId || controlsDisabled || transferHostCandidates.length === 0}
                onClick={() => {
                  if (!transferHostTargetId || controlsDisabled) return;
                  onTransferHost(transferHostTargetId);
                }}
              >
                {transferHostButton}
              </button>
            </div>
          </div>
        ) : null}

        {canControl ? (
          <div className="start-row">
            <button className="primary button-small" disabled={!canStart || controlsDisabled} onClick={onStart}>
              {startButton}
            </button>
            {!canStart && isClassic ? <span className="muted">{rulesNeedMinPlayers}</span> : null}
            {wsHint ? <span className="muted wsDisabledHint">{wsHint}</span> : null}
          </div>
        ) : (
          <div className="muted playerOnlyHint">{hostOnlyHint}</div>
        )}
      </div>
    </section>
  );
}
