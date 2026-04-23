import type { GameView } from "@bunker/shared";
import Modal from "../components/Modal";
import { getCategoryDisplayLabel, normalizeCategoryKey, type GameCategoryLabels } from "./categoryPresentation";

type GameTextLike = {
  t: (key: string, params?: Record<string, unknown>) => string;
};

type GameLocaleLike = GameCategoryLabels & {
  votingWeightHint: (weight: number) => string;
  voteAgainst: (name: string) => string;
  voteInvalid: (reason: string) => string;
  voteNotVoted: string;
  slotHidden: string;
};

interface GameVoteModalProps {
  open: boolean;
  onClose: () => void;
  gameText: GameTextLike;
  gameLocale: GameLocaleLike;
  votePhase: string | null;
  yourVoteLabel: string;
  yourVoteWeight: number;
  voteTargetId: string | null;
  setVoteTargetId: (value: string | null) => void;
  alivePlayers: GameView["public"]["players"];
  currentPlayerId?: string;
  disallowedVoteTargetSet: Set<string>;
  canVote: boolean;
  selectedVoteTargetDisallowed: boolean;
  onVote: (targetPlayerId: string) => void;
  categoryOrder: string[];
  selectedVotePlayer: GameView["public"]["players"][number] | null;
  votesPublic: NonNullable<GameView["public"]["votesPublic"]>;
  resolutionNote?: string;
  voteReasonText: (reasonCode?: string, reason?: string) => string;
}

export function GameVoteModal({
  open,
  onClose,
  gameText,
  gameLocale,
  votePhase,
  yourVoteLabel,
  yourVoteWeight,
  voteTargetId,
  setVoteTargetId,
  alivePlayers,
  currentPlayerId,
  disallowedVoteTargetSet,
  canVote,
  selectedVoteTargetDisallowed,
  onVote,
  categoryOrder,
  selectedVotePlayer,
  votesPublic,
  resolutionNote,
  voteReasonText,
}: GameVoteModalProps) {
  return (
    <Modal
      open={open}
      title={gameText.t("votingModalTitle")}
      onClose={onClose}
      dismissible={true}
      className="vote-modal"
    >
      {votePhase === "voting" ? (
        <div className="vote-modal-layout">
          <div className="vote-modal-section">
            <div className="muted">{yourVoteLabel}</div>
            {yourVoteWeight > 1 ? <div className="muted">{gameLocale.votingWeightHint(yourVoteWeight)}</div> : null}
            <select value={voteTargetId ?? ""} onChange={(event) => setVoteTargetId(event.target.value)}>
              <option value="" disabled>
                {gameText.t("selectPlayerPlaceholder")}
              </option>
              {alivePlayers
                .filter((player) => player.playerId !== currentPlayerId)
                .map((player) => (
                  <option
                    key={player.playerId}
                    value={player.playerId}
                    disabled={disallowedVoteTargetSet.has(player.playerId)}
                  >
                    {player.name}
                    {disallowedVoteTargetSet.has(player.playerId)
                      ? ` (${gameText.t("voteTargetBlockedPlanBSuffix")})`
                      : ""}
                  </option>
                ))}
            </select>
            <button
              className="primary"
              disabled={!canVote || !voteTargetId || selectedVoteTargetDisallowed}
              onClick={() => voteTargetId && onVote(voteTargetId)}
            >
              {gameText.t("voteButton")}
            </button>
            {!canVote ? <div className="muted">{gameText.t("alreadyVoted")}</div> : null}
            {canVote && selectedVoteTargetDisallowed ? (
              <div className="muted">{gameText.t("voteTargetBlockedPlanB")}</div>
            ) : null}
          </div>
          <div className="vote-modal-right">
            <div className="panel-subtitle">{gameText.t("voteCandidateTitle")}</div>
            {!voteTargetId ? (
              <div className="muted">{gameText.t("voteCandidateHint")}</div>
            ) : (
              <div className="vote-candidate-grid">
                {categoryOrder.map((category) => {
                  const slot = selectedVotePlayer?.categories.find(
                    (entry) => normalizeCategoryKey(entry.category) === category
                  );
                  const labels =
                    slot && slot.status === "revealed" && slot.cards.length > 0
                      ? slot.cards.map((card) => card.labelShort ?? "-").join(", ")
                      : gameLocale.slotHidden;
                  const categoryLabel = getCategoryDisplayLabel(normalizeCategoryKey(category), gameLocale);

                  return (
                    <div key={category} className="vote-candidate-card">
                      <span className="vote-candidate-text">
                        {categoryLabel}: {labels}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {votePhase === "voteResolve" ? (
        <div className="vote-modal-section">
          <div className="panel-subtitle">{gameText.t("votingResolveTitle")}</div>
          <div>{resolutionNote ?? gameText.t("votingResolveEmpty")}</div>
          <div className="vote-summary-list">
            {votesPublic.map((vote) => (
              <div key={vote.voterId} className="vote-summary-row">
                <span>{vote.voterName}</span>
                <span>
                  {(() => {
                    const reasonText = voteReasonText(vote.reasonCode, vote.reason);
                    if (vote.status === "voted" && vote.targetName) {
                      return reasonText
                        ? `${gameLocale.voteAgainst(vote.targetName)} (${reasonText})${(vote.weight ?? 1) > 1 ? ` x${vote.weight}` : ""}`
                        : `${gameLocale.voteAgainst(vote.targetName)}${(vote.weight ?? 1) > 1 ? ` x${vote.weight}` : ""}`;
                    }
                    if (vote.status === "invalid") {
                      return gameLocale.voteInvalid(reasonText || gameLocale.voteNotVoted);
                    }
                    return gameLocale.voteNotVoted;
                  })()}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
