import type { RoomState } from "@bunker/shared";
import Modal from "../components/Modal";

type LobbyPlayer = RoomState["players"][number];

interface LobbyKickModalProps {
  open: boolean;
  title: string;
  cancelLabel: string;
  noTargetsLabel: string;
  selectPlaceholder: string;
  agreeLabel: string;
  submitLabel: string;
  kickCandidates: LobbyPlayer[];
  kickTargetId: string;
  setKickTargetId: (value: string) => void;
  kickAgree: boolean;
  setKickAgree: (value: boolean) => void;
  controlsDisabled: boolean;
  getLobbyPlayerName: (player: LobbyPlayer) => string;
  onClose: () => void;
  onConfirm: (playerId: string) => void;
}

export function LobbyKickModal({
  open,
  title,
  cancelLabel,
  noTargetsLabel,
  selectPlaceholder,
  agreeLabel,
  submitLabel,
  kickCandidates,
  kickTargetId,
  setKickTargetId,
  kickAgree,
  setKickAgree,
  controlsDisabled,
  getLobbyPlayerName,
  onClose,
  onConfirm,
}: LobbyKickModalProps) {
  return (
    <Modal open={open} title={title} onClose={onClose} dismissible={true}>
      {kickCandidates.length === 0 ? (
        <div className="muted">{noTargetsLabel}</div>
      ) : (
        <>
          <label className="topbar-menu-field">
            <span>{selectPlaceholder}</span>
            <select
              value={kickTargetId}
              disabled={controlsDisabled}
              onChange={(event) => setKickTargetId(event.target.value)}
            >
              {kickCandidates.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {getLobbyPlayerName(player)}
                </option>
              ))}
            </select>
          </label>
          <label className="topbar-menu-checkbox">
            <input
              type="checkbox"
              checked={kickAgree}
              onChange={(event) => setKickAgree(event.target.checked)}
            />
            <span>{agreeLabel}</span>
          </label>
          <div className="modal-actions">
            <button className="ghost" onClick={onClose}>
              {cancelLabel}
            </button>
            <button
              className="primary"
              disabled={!kickTargetId || !kickAgree || controlsDisabled}
              onClick={() => {
                if (!kickTargetId || !kickAgree || controlsDisabled) return;
                onConfirm(kickTargetId);
              }}
            >
              {submitLabel}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
