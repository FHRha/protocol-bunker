import Modal from "../components/Modal";
import type { DialogCardOption, SpecialDialogState } from "./gamePageTypes";

type GameTextLike = {
  t: (key: string, params?: Record<string, unknown>) => string;
};

type GameLocaleLike = {
  specialDialogSummaryWithSource: (source: string, target: string) => string;
  specialDialogSummaryTargetOnly: (target: string) => string;
};

interface GameSpecialDialogProps {
  mobile: boolean;
  specialDialog: SpecialDialogState | null;
  closeSpecialDialog: () => void;
  gameText: GameTextLike;
  gameLocale: GameLocaleLike;
  isPlayerCardPickerDialog: boolean;
  dialogSelection: string;
  selectDialogPlayer: (playerId: string) => void;
  dialogSourceCardSelection: string;
  setDialogSourceCardSelection: (value: string) => void;
  dialogSourceCards: DialogCardOption[];
  dialogTargetCardSelection: string;
  setDialogTargetCardSelection: (value: string) => void;
  dialogTargetCards: DialogCardOption[];
  selectedSourceCardHint: string;
  selectedTargetCardHint: string;
  canSubmitSpecialDialog: boolean;
  submitSpecialDialog: () => void;
}

export function GameSpecialDialog({
  mobile,
  specialDialog,
  closeSpecialDialog,
  gameText,
  gameLocale,
  isPlayerCardPickerDialog,
  dialogSelection,
  selectDialogPlayer,
  dialogSourceCardSelection,
  setDialogSourceCardSelection,
  dialogSourceCards,
  dialogTargetCardSelection,
  setDialogTargetCardSelection,
  dialogTargetCards,
  selectedSourceCardHint,
  selectedTargetCardHint,
  canSubmitSpecialDialog,
  submitSpecialDialog,
}: GameSpecialDialogProps) {
  if (!specialDialog) return null;

  const content = (
    <>
      {specialDialog.description ? (
        <div className={mobile ? "muted mobile-special-description" : "muted"}>{specialDialog.description}</div>
      ) : null}
      <div className={mobile ? "mobile-special-body" : undefined}>
        {specialDialog.options.length === 0 ? (
          <div className="muted">{gameText.t("noTargetCandidates")}</div>
        ) : (
          <>
            {isPlayerCardPickerDialog && specialDialog.cardPicker?.requireSourceCard ? (
              <>
                <div className="muted">{gameText.t("specialDialogStepOwnCard")}</div>
                <select
                  value={dialogSourceCardSelection}
                  onChange={(event) => setDialogSourceCardSelection(event.target.value)}
                  disabled={dialogSourceCards.length === 0}
                >
                  <option value="" disabled>
                    {gameText.t("specialDialogPlaceholderOwnCard")}
                  </option>
                  {dialogSourceCards.map((card) => (
                    <option key={card.instanceId} value={card.instanceId}>
                      {card.hint}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            {isPlayerCardPickerDialog && specialDialog.cardPicker?.requireSourceCard ? (
              <div className="muted">{gameText.t("specialDialogStepPlayer")}</div>
            ) : null}

            {mobile ? (
              <div className="mobile-special-options">
                {specialDialog.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`mobile-special-option${dialogSelection === option.id ? " selected" : ""}`}
                    onClick={() => selectDialogPlayer(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={dialogSelection}
                onChange={(event) => selectDialogPlayer(event.target.value)}
                disabled={specialDialog.options.length === 0}
              >
                <option value="" disabled>
                  {isPlayerCardPickerDialog && specialDialog.cardPicker?.requireSourceCard
                    ? gameText.t("specialDialogPlaceholderPlayer")
                    : gameText.t("modalSelect")}
                </option>
                {specialDialog.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {isPlayerCardPickerDialog && dialogSelection ? (
              <>
                {specialDialog.cardPicker?.requireSourceCard ? (
                  <div className="muted">{gameText.t("specialDialogStepTargetCard")}</div>
                ) : (
                  <div className="muted">{gameText.t("specialDialogLabelTargetCard")}</div>
                )}
                <select
                  value={dialogTargetCardSelection}
                  onChange={(event) => setDialogTargetCardSelection(event.target.value)}
                  disabled={dialogTargetCards.length === 0}
                >
                  <option value="" disabled>
                    {gameText.t("specialDialogPlaceholderTargetCard")}
                  </option>
                  {dialogTargetCards.map((card) => (
                    <option key={card.instanceId} value={card.instanceId}>
                      {card.hint}
                    </option>
                  ))}
                </select>
                {selectedTargetCardHint ? (
                  <div className="muted">
                    {specialDialog.cardPicker?.requireSourceCard && selectedSourceCardHint
                      ? gameLocale.specialDialogSummaryWithSource(selectedSourceCardHint, selectedTargetCardHint)
                      : gameLocale.specialDialogSummaryTargetOnly(selectedTargetCardHint)}
                  </div>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </div>
    </>
  );

  if (!mobile) {
    return (
      <Modal open={true} title={specialDialog.title} onClose={closeSpecialDialog} dismissible={true}>
        {content}
        <div className="modal-actions">
          <button className="ghost" onClick={closeSpecialDialog}>
            {gameText.t("modalCancel")}
          </button>
          <button className="primary" disabled={!canSubmitSpecialDialog} onClick={submitSpecialDialog}>
            {gameText.t("modalApply")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <div className="mobile-special-backdrop" onClick={closeSpecialDialog}>
      <div className="mobile-special-panel" onClick={(event) => event.stopPropagation()}>
        <div className="mobile-special-header">
          <div className="mobile-special-title">{specialDialog.title}</div>
          <button className="icon-button" onClick={closeSpecialDialog} aria-label={gameText.t("closeButton")}>
            x
          </button>
        </div>
        {content}
        <div className="mobile-special-footer">
          <button className="ghost" onClick={closeSpecialDialog}>
            {gameText.t("modalCancel")}
          </button>
          <button className="primary" disabled={!canSubmitSpecialDialog} onClick={submitSpecialDialog}>
            {gameText.t("modalApply")}
          </button>
        </div>
      </div>
    </div>
  );
}
