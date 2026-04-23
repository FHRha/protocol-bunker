import type { GameView, RoomState } from "@bunker/shared";
import Modal from "../components/Modal";

type TransferHostCandidate = RoomState["players"][number];
type DevKickCandidate = GameView["public"]["players"][number];

type AppModalLocale = {
  confirmActionTitle: string;
  modalCancel: string;
  modalApply: string;
  transferHostTitle: string;
  transferHostSelectPlaceholder: string;
  transferHostSelectLabel: string;
  transferHostAgreeLabel: string;
  transferHostButton: string;
  exitConfirmTitle: string;
  exitConfirmText: string;
  exitButton: string;
  devKickTitle: string;
  devKickNoTargets: string;
  devKickSelectPlaceholder: string;
  devKickAgreeLabel: string;
  devKickConfirm: string;
};

type AppModalLayerProps = {
  locale: AppModalLocale;
  dangerConfirmMessage: string | null;
  onResolveDangerConfirm: (value: boolean) => void;
  transferHostOpen: boolean;
  transferHostEnabled: boolean;
  transferHostCandidates: TransferHostCandidate[];
  transferHostTargetId: string;
  transferHostAgree: boolean;
  onTransferHostTargetIdChange: (value: string) => void;
  onTransferHostAgreeChange: (value: boolean) => void;
  onCloseTransferHost: () => void;
  onSubmitTransferHost: () => void;
  exitConfirmOpen: boolean;
  onCloseExitConfirm: () => void;
  onConfirmExit: () => void;
  devKickOpen: boolean;
  devKickCandidates: DevKickCandidate[];
  devKickTargetId: string;
  devKickAgree: boolean;
  onDevKickTargetIdChange: (value: string) => void;
  onDevKickAgreeChange: (value: boolean) => void;
  onCloseDevKick: () => void;
  onSubmitDevKick: () => void;
};

export function AppModalLayer({
  locale,
  dangerConfirmMessage,
  onResolveDangerConfirm,
  transferHostOpen,
  transferHostEnabled,
  transferHostCandidates,
  transferHostTargetId,
  transferHostAgree,
  onTransferHostTargetIdChange,
  onTransferHostAgreeChange,
  onCloseTransferHost,
  onSubmitTransferHost,
  exitConfirmOpen,
  onCloseExitConfirm,
  onConfirmExit,
  devKickOpen,
  devKickCandidates,
  devKickTargetId,
  devKickAgree,
  onDevKickTargetIdChange,
  onDevKickAgreeChange,
  onCloseDevKick,
  onSubmitDevKick,
}: AppModalLayerProps) {
  return (
    <>
      <Modal
        open={Boolean(dangerConfirmMessage)}
        title={locale.confirmActionTitle}
        onClose={() => onResolveDangerConfirm(false)}
        dismissible={true}
      >
        <div className="muted">{dangerConfirmMessage}</div>
        <div className="modal-actions">
          <button className="ghost" onClick={() => onResolveDangerConfirm(false)}>
            {locale.modalCancel}
          </button>
          <button className="primary" onClick={() => onResolveDangerConfirm(true)}>
            {locale.modalApply}
          </button>
        </div>
      </Modal>

      <Modal
        open={transferHostOpen && transferHostEnabled}
        title={locale.transferHostTitle}
        onClose={onCloseTransferHost}
        dismissible={true}
      >
        {transferHostCandidates.length === 0 ? (
          <div className="muted">{locale.transferHostSelectPlaceholder}</div>
        ) : (
          <>
            <label className="topbar-menu-field">
              <span>{locale.transferHostSelectLabel}</span>
              <select
                value={transferHostTargetId}
                onChange={(event) => onTransferHostTargetIdChange(event.target.value)}
              >
                {transferHostCandidates.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="topbar-menu-checkbox">
              <input
                type="checkbox"
                checked={transferHostAgree}
                onChange={(event) => onTransferHostAgreeChange(event.target.checked)}
              />
              <span>{locale.transferHostAgreeLabel}</span>
            </label>
            <div className="modal-actions">
              <button className="ghost" onClick={onCloseTransferHost}>
                {locale.modalCancel}
              </button>
              <button
                className="primary"
                disabled={!transferHostTargetId || !transferHostAgree}
                onClick={onSubmitTransferHost}
              >
                {locale.transferHostButton}
              </button>
            </div>
          </>
        )}
      </Modal>

      <Modal
        open={exitConfirmOpen}
        title={locale.exitConfirmTitle}
        onClose={onCloseExitConfirm}
        dismissible={true}
      >
        <div className="muted">{locale.exitConfirmText}</div>
        <div className="modal-actions">
          <button className="ghost" onClick={onCloseExitConfirm}>
            {locale.modalCancel}
          </button>
          <button className="primary" onClick={onConfirmExit}>
            {locale.exitButton}
          </button>
        </div>
      </Modal>

      <Modal open={devKickOpen} title={locale.devKickTitle} onClose={onCloseDevKick} dismissible={true}>
        {devKickCandidates.length === 0 ? (
          <div className="muted">{locale.devKickNoTargets}</div>
        ) : (
          <>
            <select
              value={devKickTargetId}
              onChange={(event) => onDevKickTargetIdChange(event.target.value)}
            >
              <option value="" disabled>
                {locale.devKickSelectPlaceholder}
              </option>
              {devKickCandidates.map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.name}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="ghost" onClick={onCloseDevKick}>
                {locale.modalCancel}
              </button>
              <label className="topbar-menu-checkbox">
                <input
                  type="checkbox"
                  checked={devKickAgree}
                  onChange={(event) => onDevKickAgreeChange(event.target.checked)}
                />
                <span>{locale.devKickAgreeLabel}</span>
              </label>
              <button
                className="primary"
                disabled={!devKickTargetId || !devKickAgree}
                onClick={onSubmitDevKick}
              >
                {locale.devKickConfirm}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
