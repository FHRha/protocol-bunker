export interface GameHintsText {
  hintWsOffline: string;
  hintObserverMode: string;
  hintRoundStartReveal: string;
  hintOpenVoteModal: string;
  hintVoteAlreadyDone: string;
  hintFinalizeVoteHost: string;
  hintFinalizeVoteWait: string;
  hintPickCard: string;
  hintRevealSelected: string;
  hintContinueRound: string;
  hintWaitTurn: string;
  hintRevealThreats: string;
  hintDecideOutcome: string;
}

export type GameHintLevel = "info" | "action" | "warning";

export interface GameContextHint {
  id: string;
  text: string;
  level: GameHintLevel;
}

export interface BuildGameHintsParams {
  wsInteractive: boolean;
  phase: string;
  votePhase: string | null;
  youStatus: "alive" | "eliminated" | "left_bunker";
  round: number;
  roundRevealedCount: number;
  canReveal: boolean;
  selectedCardId: string | null;
  canRevealSelectedCard: boolean;
  canContinueRound: boolean;
  canOpenVotingModal: boolean;
  canVote: boolean;
  showFinalizeVoting: boolean;
  canRevealThreats: boolean;
  postGameActive: boolean;
  canDecidePostGameOutcome: boolean;
}

function pushHint(target: GameContextHint[], hint: GameContextHint) {
  if (target.some((entry) => entry.id === hint.id)) return;
  target.push(hint);
}

export function buildGameContextHints(params: BuildGameHintsParams, textSource: GameHintsText): GameContextHint[] {
  const hints: GameContextHint[] = [];

  if (!params.wsInteractive) {
    pushHint(hints, {
      id: "ws-offline",
      text: textSource.hintWsOffline,
      level: "warning",
    });
    return hints;
  }

  if (params.postGameActive && params.canDecidePostGameOutcome) {
    pushHint(hints, {
      id: "decide-outcome",
      text: textSource.hintDecideOutcome,
      level: "action",
    });
    return hints;
  }

  if (params.youStatus !== "alive") {
    pushHint(hints, {
      id: "observer-mode",
      text: textSource.hintObserverMode,
      level: "info",
    });
    return hints;
  }

  if (
    (params.phase === "reveal" || params.phase === "reveal_discussion") &&
    params.round <= 1 &&
    params.roundRevealedCount === 0 &&
    params.canReveal
  ) {
    pushHint(hints, {
      id: "round-start-reveal",
      text: textSource.hintRoundStartReveal,
      level: "action",
    });
  }

  if (params.votePhase === "voting") {
    if (params.canOpenVotingModal && params.canVote) {
      pushHint(hints, {
        id: "open-vote-modal",
        text: textSource.hintOpenVoteModal,
        level: "action",
      });
    } else if (!params.canVote) {
      pushHint(hints, {
        id: "vote-already-done",
        text: textSource.hintVoteAlreadyDone,
        level: "info",
      });
    }
  }

  if (params.votePhase === "voteSpecialWindow") {
    if (params.showFinalizeVoting) {
      pushHint(hints, {
        id: "finalize-vote-host",
        text: textSource.hintFinalizeVoteHost,
        level: "action",
      });
    } else {
      pushHint(hints, {
        id: "finalize-vote-wait",
        text: textSource.hintFinalizeVoteWait,
        level: "info",
      });
    }
  }

  if (params.phase === "reveal" || params.phase === "reveal_discussion") {
    if (params.canReveal && !params.selectedCardId) {
      pushHint(hints, {
        id: "pick-card",
        text: textSource.hintPickCard,
        level: "action",
      });
    } else if (params.canReveal && params.selectedCardId && params.canRevealSelectedCard) {
      pushHint(hints, {
        id: "reveal-selected",
        text: textSource.hintRevealSelected,
        level: "action",
      });
    } else if (!params.canReveal && params.canContinueRound) {
      pushHint(hints, {
        id: "continue-round",
        text: textSource.hintContinueRound,
        level: "action",
      });
    } else if (!params.canReveal) {
      pushHint(hints, {
        id: "wait-turn",
        text: textSource.hintWaitTurn,
        level: "info",
      });
    }
  }

  if (params.phase === "ended" && params.canRevealThreats) {
    pushHint(hints, {
      id: "reveal-threats",
      text: textSource.hintRevealThreats,
      level: "action",
    });
  }

  return hints.slice(0, 2);
}

