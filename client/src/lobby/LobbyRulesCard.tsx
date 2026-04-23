import type { RoomState } from "@bunker/shared";

interface LobbyRulesCardProps {
  title: string;
  scenarioText: string;
  rulesModeLabel: string;
  canControl: boolean;
  isClassic: boolean;
  rulesMode: "auto" | "manual";
  rulesModeText: string;
  controlsDisabled: boolean;
  rulesModeAuto: string;
  rulesModeManual: string;
  onApplyRulesMode: (mode: "auto" | "manual") => void;
  playersText: string;
  seatsText: string;
  exilesText: string;
  votesLabel: string;
  votesValue: string;
}

export function LobbyRulesCard({
  title,
  scenarioText,
  rulesModeLabel,
  canControl,
  isClassic,
  rulesMode,
  rulesModeText,
  controlsDisabled,
  rulesModeAuto,
  rulesModeManual,
  onApplyRulesMode,
  playersText,
  seatsText,
  exilesText,
  votesLabel,
  votesValue,
}: LobbyRulesCardProps) {
  return (
    <section className="lobbyCard lobbyCard--rules rulesCard">
      <div className="lobbyCardHeader">
        <h3 className="lobbyCardTitle">{title}</h3>
      </div>
      <div className="lobbyCardBody">
        <div className="rulesTop">
          <div className="lobbyMetaLine">
            <span className="muted">{scenarioText}</span>
          </div>
          <div className="rulesModeBox">
            <div className="rulesModeLabel">{rulesModeLabel}</div>
            {canControl && isClassic ? (
              <select
                className="rulesModeSelect"
                value={rulesMode}
                disabled={controlsDisabled}
                onChange={(event) => onApplyRulesMode(event.target.value as "auto" | "manual")}
              >
                <option value="auto">{rulesModeAuto}</option>
                <option value="manual">{rulesModeManual}</option>
              </select>
            ) : (
              <div className="rulesModeValue">{rulesModeText}</div>
            )}
          </div>
        </div>
        <div className="rulesStats">
          <div className="ruleCell">{playersText}</div>
          <div className="ruleCell">{seatsText}</div>
          <div className="ruleCell ruleCellGhost" aria-hidden="true" />
          <div className="ruleCell">{exilesText}</div>
          <div className="ruleCell rulesSpan2">
            <span className="ruleFactLabel">{votesLabel}</span>
            <span className="ruleFactValue nowrap">{votesValue}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
