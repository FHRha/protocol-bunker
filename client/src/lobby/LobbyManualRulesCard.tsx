import type { ManualRulesConfig } from "@bunker/shared";

interface LobbyManualTexts {
  manualModeTitle: string;
  rulesPresetLabel: string;
  manualFillFromTemplate: string;
  manualBunkerSlotsLabel: string;
  manualVotesRequired: (count: number) => string;
  manualRevealsRequiredLabel: string;
  manualRevealsRecommended: string;
  manualRevealsWarning: string;
  manualRevealsPlanLabel: string;
  votesByRoundLabel: string;
  manualRoundAdd: string;
  manualRoundRemove: string;
  manualGenerate: string;
  manualVotesFormatHint: string;
  manualVotesSumHint: (sum: number, required: number) => string;
  manualAdjust: string;
}

interface LobbyManualRulesCardProps {
  text: LobbyManualTexts;
  controlsDisabled: boolean;
  manualTemplatePlayers: number;
  setManualTemplatePlayers: (value: number) => void;
  rulesPresetOptions: number[];
  fillManualFromTemplate: () => void;
  manualConfig: ManualRulesConfig;
  requiredVotes: number;
  manualRevealNotRecommended: boolean;
  revealPlanText: string;
  updateManualConfig: (patch: Partial<ManualRulesConfig>) => void;
  manualVotesInput: string;
  setManualVotesInput: (value: string) => void;
  parseVotesSchedule: (text: string) => number[];
  generateVotesByDefault: (requiredVotes: number, currentVotes: number[]) => number[];
  fitVotesByTotal: (votesByRound: number[], requiredTotal: number) => number[];
  manualVotesMismatch: boolean;
  manualVotesSum: number;
  wsHint: string | null;
}

export function LobbyManualRulesCard({
  text,
  controlsDisabled,
  manualTemplatePlayers,
  setManualTemplatePlayers,
  rulesPresetOptions,
  fillManualFromTemplate,
  manualConfig,
  requiredVotes,
  manualRevealNotRecommended,
  revealPlanText,
  updateManualConfig,
  manualVotesInput,
  setManualVotesInput,
  parseVotesSchedule,
  generateVotesByDefault,
  fitVotesByTotal,
  manualVotesMismatch,
  manualVotesSum,
  wsHint,
}: LobbyManualRulesCardProps) {
  return (
    <section className="lobbyCard lobbyCard--manual manualCard">
      <div className="lobbyCardHeader">
        <h3 className="lobbyCardTitle">{text.manualModeTitle}</h3>
      </div>
      <div className="lobbyCardBody">
        <fieldset className="settingsFieldset" disabled={controlsDisabled}>
          <div className="manualRulesBuilder">
            <div className="manualRulesRow">
              <label>
                <span>{text.rulesPresetLabel}</span>
                <select value={manualTemplatePlayers} onChange={(event) => setManualTemplatePlayers(Number(event.target.value))}>
                  {rulesPresetOptions.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
              </label>
              <button className="ghost button-small" onClick={fillManualFromTemplate}>
                {text.manualFillFromTemplate}
              </button>
            </div>

            <div className="manualRulesRow manualRulesRow3Wide">
              <label>
                <span>{text.manualBunkerSlotsLabel}</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={manualConfig.bunkerSlots}
                  onChange={(event) => updateManualConfig({ bunkerSlots: Number(event.target.value) })}
                />
              </label>
              <div className="manualRequiredVotes" aria-live="polite">
                {text.manualVotesRequired(requiredVotes)}
              </div>
              <label className="manualRevealTargetField">
                <span>{text.manualRevealsRequiredLabel}</span>
                <select
                  value={manualConfig.targetReveals}
                  onChange={(event) => updateManualConfig({ targetReveals: Number(event.target.value) })}
                >
                  <option value={5}>5</option>
                  <option value={6}>6</option>
                  <option value={7}>7</option>
                </select>
              </label>
            </div>

            <div className="manualRevealMeta">
              <div className="manualRevealHint">{text.manualRevealsRecommended}</div>
              {manualRevealNotRecommended ? <div className="manualRevealWarning">{text.manualRevealsWarning}</div> : null}
              <div className="manualRevealPlan">
                {text.manualRevealsPlanLabel} <span className="nowrap">{revealPlanText}</span>
              </div>
            </div>

            <div className="manualVotesHeader">
              <div>{text.votesByRoundLabel}</div>
              <div className="manualVotesActions">
                <button
                  className="ghost button-small"
                  onClick={() => updateManualConfig({ votesByRound: [...manualConfig.votesByRound, 0] })}
                >
                  {text.manualRoundAdd}
                </button>
                <button
                  className="ghost button-small"
                  disabled={manualConfig.votesByRound.length <= 1}
                  onClick={() =>
                    updateManualConfig({
                      votesByRound: manualConfig.votesByRound.slice(0, Math.max(1, manualConfig.votesByRound.length - 1)),
                    })
                  }
                >
                  {text.manualRoundRemove}
                </button>
                <button
                  className="ghost button-small"
                  onClick={() =>
                    updateManualConfig({
                      votesByRound: generateVotesByDefault(requiredVotes, manualConfig.votesByRound),
                    })
                  }
                >
                  {text.manualGenerate}
                </button>
              </div>
            </div>

            <label className="manualVotesTextField">
              <span>{text.manualVotesFormatHint}</span>
              <input
                type="text"
                value={manualVotesInput}
                onChange={(event) => {
                  const value = event.target.value;
                  setManualVotesInput(value);
                  updateManualConfig({ votesByRound: parseVotesSchedule(value) });
                }}
              />
            </label>

            <div className="manualVotesInputs">
              {manualConfig.votesByRound.map((votes, index) => (
                <label key={`round-${index}`} className="manualVoteCell">
                  <span>R{index + 1}</span>
                  <input
                    type="number"
                    min={0}
                    max={9}
                    value={votes}
                    onChange={(event) => {
                      const next = [...manualConfig.votesByRound];
                      next[index] = Number(event.target.value);
                      updateManualConfig({ votesByRound: next });
                    }}
                  />
                </label>
              ))}
            </div>

            <div className={`manualVotesSummary${manualVotesMismatch ? " warning" : ""}`}>
              <span>{text.manualVotesSumHint(manualVotesSum, requiredVotes)}</span>
              {manualVotesMismatch ? (
                <button
                  className="ghost button-small"
                  onClick={() =>
                    updateManualConfig({
                      votesByRound: fitVotesByTotal(manualConfig.votesByRound, requiredVotes),
                    })
                  }
                >
                  {text.manualAdjust}
                </button>
              ) : null}
            </div>
          </div>
        </fieldset>
        {wsHint ? <div className="muted wsDisabledHint">{wsHint}</div> : null}
      </div>
    </section>
  );
}
