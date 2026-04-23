import type { GameSettings } from "@bunker/shared";
import InfoTip from "../components/InfoTip";

interface DisasterOption {
  id: string;
  title: string;
}

interface LobbySettingsTexts {
  settingsTitle: string;
  settingsTimersBlock: string;
  settingsRevealDiscussionTimer: string;
  settingsPreVoteTimer: string;
  settingsPostVoteTimer: string;
  settingsOtherBlock: string;
  settingsAutomationMode: string;
  settingsAutomationModeHint: string;
  settingsAutomationAuto: string;
  settingsAutomationSemi: string;
  settingsAutomationManual: string;
  settingsPresenterMode: string;
  settingsPresenterModeHint: string;
  settingsContinuePermission: string;
  settingsContinueHost: string;
  settingsContinueRevealer: string;
  settingsContinueAnyone: string;
  settingsRevealTimeoutAction: string;
  settingsRevealTimeoutRandom: string;
  settingsRevealTimeoutSkip: string;
  settingsSpecialUsage: string;
  settingsSpecialAnytime: string;
  settingsSpecialVotingOnly: string;
  settingsFinalThreatReveal: string;
  settingsThreatHost: string;
  settingsThreatAnyone: string;
  settingsForcedDisaster: string;
  settingsForcedDisasterRandom: string;
  settingsMaxPlayers: string;
  maxPlayersHint: string;
  settingsOn: string;
  settingsOff: string;
  presenterControlHint: string;
}

interface LobbySettingsCardProps {
  text: LobbySettingsTexts;
  canControl: boolean;
  controlsDisabled: boolean;
  settings: GameSettings;
  continueTipText: string;
  threatTipText: string;
  supportsForcedDisaster: boolean;
  normalizedForcedDisasterId: string;
  disasterOptions: DisasterOption[];
  forcedDisasterTitle: string;
  minPlayersLimit: number;
  wsHint: string | null;
  updateField: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  updateAutomationMode: (mode: GameSettings["automationMode"]) => void;
}

export function LobbySettingsCard({
  text,
  canControl,
  controlsDisabled,
  settings,
  continueTipText,
  threatTipText,
  supportsForcedDisaster,
  normalizedForcedDisasterId,
  disasterOptions,
  forcedDisasterTitle,
  minPlayersLimit,
  wsHint,
  updateField,
  updateAutomationMode,
}: LobbySettingsCardProps) {
  return (
    <section className="lobbyCard lobbyCard--settings settingsCard">
      <div className="lobbyCardHeader">
        <h3 className="lobbyCardTitle">{text.settingsTitle}</h3>
      </div>
      <div className="lobbyCardBody">
        {canControl ? (
          <fieldset className="settingsFieldset" disabled={controlsDisabled}>
            <div className="settings-grid compact">
              <div className="settings-section-title">{text.settingsTimersBlock}</div>
              <label className="formRow settingsRow--timer">
                <span className="settingsLabel">{text.settingsRevealDiscussionTimer}</span>
                <div className="formControlRow settingsControls">
                  <input
                    type="checkbox"
                    checked={settings.enableRevealDiscussionTimer}
                    onChange={(event) => updateField("enableRevealDiscussionTimer", event.target.checked)}
                  />
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={settings.revealDiscussionSeconds}
                    onChange={(event) => updateField("revealDiscussionSeconds", Number(event.target.value))}
                  />
                </div>
              </label>
              <label className="formRow settingsRow--timer">
                <span className="settingsLabel">{text.settingsPreVoteTimer}</span>
                <div className="formControlRow settingsControls">
                  <input
                    type="checkbox"
                    checked={settings.enablePreVoteDiscussionTimer}
                    onChange={(event) => updateField("enablePreVoteDiscussionTimer", event.target.checked)}
                  />
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={settings.preVoteDiscussionSeconds}
                    onChange={(event) => updateField("preVoteDiscussionSeconds", Number(event.target.value))}
                  />
                </div>
              </label>
              <label className="formRow settingsRow--timer">
                <span className="settingsLabel">{text.settingsPostVoteTimer}</span>
                <div className="formControlRow settingsControls">
                  <input
                    type="checkbox"
                    checked={settings.enablePostVoteDiscussionTimer}
                    onChange={(event) => updateField("enablePostVoteDiscussionTimer", event.target.checked)}
                  />
                  <input
                    type="number"
                    min={5}
                    max={600}
                    value={settings.postVoteDiscussionSeconds}
                    onChange={(event) => updateField("postVoteDiscussionSeconds", Number(event.target.value))}
                  />
                </div>
              </label>

              <div className="settings-section-title">{text.settingsOtherBlock}</div>
              <label className="formRow">
                <span className="settingsLabelWithTip">
                  <span>{text.settingsAutomationMode}</span>
                  <InfoTip text={text.settingsAutomationModeHint} />
                </span>
                <select
                  value={settings.automationMode}
                  onChange={(event) => updateAutomationMode(event.target.value as GameSettings["automationMode"])}
                >
                  <option value="auto">{text.settingsAutomationAuto}</option>
                  <option value="semi">{text.settingsAutomationSemi}</option>
                  <option value="manual">{text.settingsAutomationManual}</option>
                </select>
              </label>
              <div className="formRow settingsRow--overlayControl">
                <span className="settingsLabel settingsLabelWithTip">
                  <span>{text.settingsPresenterMode}</span>
                  <InfoTip text={text.settingsPresenterModeHint} />
                </span>
                <div className="formControlRow settingsControls checkboxLabel">
                  <div className="overlayControlCheckbox">
                    <input
                      type="checkbox"
                      checked={settings.enablePresenterMode}
                      onChange={(event) => updateField("enablePresenterMode", event.target.checked)}
                    />
                    <small className="muted">{text.settingsPresenterModeHint}</small>
                  </div>
                </div>
              </div>
              <label className="formRow">
                <span className="settingsLabelWithTip">
                  <span>{text.settingsContinuePermission}</span>
                  <InfoTip text={continueTipText} />
                </span>
                <select
                  value={settings.continuePermission}
                  onChange={(event) =>
                    updateField("continuePermission", event.target.value as GameSettings["continuePermission"])
                  }
                >
                  <option value="host_only">{text.settingsContinueHost}</option>
                  <option value="revealer_only">{text.settingsContinueRevealer}</option>
                  <option value="anyone">{text.settingsContinueAnyone}</option>
                </select>
              </label>
              <label className="formRow">
                <span>{text.settingsRevealTimeoutAction}</span>
                <select
                  value={settings.revealTimeoutAction}
                  onChange={(event) =>
                    updateField("revealTimeoutAction", event.target.value as GameSettings["revealTimeoutAction"])
                  }
                >
                  <option value="random_card">{text.settingsRevealTimeoutRandom}</option>
                  <option value="skip_player">{text.settingsRevealTimeoutSkip}</option>
                </select>
              </label>
              <label className="formRow">
                <span>{text.settingsSpecialUsage}</span>
                <select
                  value={settings.specialUsage}
                  onChange={(event) => updateField("specialUsage", event.target.value as GameSettings["specialUsage"])}
                >
                  <option value="anytime">{text.settingsSpecialAnytime}</option>
                  <option value="only_during_voting">{text.settingsSpecialVotingOnly}</option>
                </select>
              </label>
              <label className="formRow">
                <span className="settingsLabelWithTip">
                  <span>{text.settingsFinalThreatReveal}</span>
                  <InfoTip text={threatTipText} />
                </span>
                <select
                  value={settings.finalThreatReveal}
                  onChange={(event) =>
                    updateField("finalThreatReveal", event.target.value as GameSettings["finalThreatReveal"])
                  }
                >
                  <option value="host">{text.settingsThreatHost}</option>
                  <option value="anyone">{text.settingsThreatAnyone}</option>
                </select>
              </label>
              {supportsForcedDisaster ? (
                <label className="formRow">
                  <span>{text.settingsForcedDisaster}</span>
                  <select
                    value={normalizedForcedDisasterId}
                    onChange={(event) => updateField("forcedDisasterId", event.target.value)}
                  >
                    <option value="random">{text.settingsForcedDisasterRandom}</option>
                    {disasterOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="formRow">
                <span>{text.settingsMaxPlayers}</span>
                <div className="settingsMaxPlayersControl">
                  <input
                    type="number"
                    min={minPlayersLimit}
                    max={16}
                    value={settings.maxPlayers}
                    onChange={(event) =>
                      updateField("maxPlayers", Math.max(minPlayersLimit, Math.min(16, Number(event.target.value))) as GameSettings["maxPlayers"])
                    }
                  />
                  <small className="muted">{text.maxPlayersHint}</small>
                </div>
              </label>
            </div>
          </fieldset>
        ) : (
          <div className="settings-readonly compact">
            <div>
              {text.settingsAutomationMode}:{" "}
              {settings.automationMode === "manual"
                ? text.settingsAutomationManual
                : settings.automationMode === "semi"
                  ? text.settingsAutomationSemi
                  : text.settingsAutomationAuto}
            </div>
            <div>
              {text.settingsPresenterMode}: {settings.enablePresenterMode ? text.settingsOn : text.settingsOff}
            </div>
            <div>
              {text.settingsRevealDiscussionTimer}: {settings.enableRevealDiscussionTimer ? text.settingsOn : text.settingsOff} ({settings.revealDiscussionSeconds}s)
            </div>
            <div>
              {text.settingsPreVoteTimer}: {settings.enablePreVoteDiscussionTimer ? text.settingsOn : text.settingsOff} ({settings.preVoteDiscussionSeconds}s)
            </div>
            <div>
              {text.settingsPostVoteTimer}: {settings.enablePostVoteDiscussionTimer ? text.settingsOn : text.settingsOff} ({settings.postVoteDiscussionSeconds}s)
            </div>
            <div>
              {text.settingsContinuePermission}:{" "}
              {settings.continuePermission === "host_only"
                ? text.settingsContinueHost
                : settings.continuePermission === "revealer_only"
                  ? text.settingsContinueRevealer
                  : text.settingsContinueAnyone}
            </div>
            <div>
              {text.settingsRevealTimeoutAction}:{" "}
              {settings.revealTimeoutAction === "random_card" ? text.settingsRevealTimeoutRandom : text.settingsRevealTimeoutSkip}
            </div>
            <div>
              {text.settingsSpecialUsage}: {settings.specialUsage === "anytime" ? text.settingsSpecialAnytime : text.settingsSpecialVotingOnly}
            </div>
            <div>
              {text.settingsFinalThreatReveal}: {settings.finalThreatReveal === "anyone" ? text.settingsThreatAnyone : text.settingsThreatHost}
            </div>
            {supportsForcedDisaster ? (
              <div>
                {text.settingsForcedDisaster}: {forcedDisasterTitle}
              </div>
            ) : null}
            <div>
              {text.settingsMaxPlayers}: {settings.maxPlayers}
            </div>
          </div>
        )}
        {canControl && wsHint ? <div className="muted wsDisabledHint">{wsHint}</div> : null}
        {canControl && settings.enablePresenterMode ? (
          <div className="muted presenterHint">{text.presenterControlHint}</div>
        ) : null}
      </div>
    </section>
  );
}
