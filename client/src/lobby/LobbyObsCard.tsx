import { OverlayLinkRow } from "./OverlayLinkRow";

interface LobbyObsTexts {
  obsLinksTitle: string;
  spectatorLinkHint: string;
  obsLinksLoading: string;
  obsLinksUnavailable: string;
  spectatorLinkTitle: string;
  externalLabel: string;
  hiddenValue: string;
  showSecret: string;
  hideSecret: string;
  openButton: string;
  externalLinksHint: string;
  obsOverlayViewSectionTitle: string;
  obsOverlayControlSectionTitle: string;
}

interface LobbyObsCardProps {
  text: LobbyObsTexts;
  showHints: boolean;
  overlayLinksLoading: boolean;
  overlayLinksError: string | null;
  hasOverlayLinks: boolean;
  showSpectatorLinks: boolean;
  spectatorAccessMode: "permanent" | "1" | "2" | "5" | "10";
  setSpectatorAccessMode: (value: "permanent" | "1" | "2" | "5" | "10") => void;
  showLanLinks: boolean;
  spectatorHidden: boolean;
  spectatorUrlLan: string;
  spectatorUrlExternal: string;
  overlayViewHidden: boolean;
  overlayViewUrlLan: string;
  overlayViewUrlExternal: string;
  overlayControlHidden: boolean;
  overlayControlUrlLan: string;
  overlayControlUrlExternal: string;
  copyLabel: (key: string) => string;
  onToggleSpectatorHidden: () => void;
  onToggleOverlayViewHidden: () => void;
  onToggleOverlayControlHidden: () => void;
  onCopySpectator: (variant: "lan" | "external") => void;
  onCopyOverlayView: (variant: "lan" | "external") => void;
  onCopyOverlayControl: (variant: "lan" | "external") => void;
}

export function LobbyObsCard({
  text,
  showHints,
  overlayLinksLoading,
  overlayLinksError,
  hasOverlayLinks,
  showSpectatorLinks,
  spectatorAccessMode,
  setSpectatorAccessMode,
  showLanLinks,
  spectatorHidden,
  spectatorUrlLan,
  spectatorUrlExternal,
  overlayViewHidden,
  overlayViewUrlLan,
  overlayViewUrlExternal,
  overlayControlHidden,
  overlayControlUrlLan,
  overlayControlUrlExternal,
  copyLabel,
  onToggleSpectatorHidden,
  onToggleOverlayViewHidden,
  onToggleOverlayControlHidden,
  onCopySpectator,
  onCopyOverlayView,
  onCopyOverlayControl,
}: LobbyObsCardProps) {
  return (
    <section className="lobbyCard lobbyObsCard obsCard">
      <div className="lobbyCardHeader">
        <h3 className="lobbyCardTitle">{text.obsLinksTitle}</h3>
      </div>
      <div className="lobbyCardBody">
        {showHints ? <div className="muted">{text.spectatorLinkHint}</div> : null}
        {overlayLinksLoading ? <div className="muted">{text.obsLinksLoading}</div> : null}
        {!overlayLinksLoading && overlayLinksError ? (
          <div className="muted">{overlayLinksError || text.obsLinksUnavailable}</div>
        ) : null}
        {!overlayLinksLoading && hasOverlayLinks ? (
          <>
            {showSpectatorLinks ? (
              <section className="linksSection">
                <h4 className="linksSectionTitle">{text.spectatorLinkTitle}</h4>
                <div className="formRow" style={{ marginBottom: 8 }}>
                  <span>Доступ по зрительской ссылке</span>
                  <div className="formControlRow">
                    <select
                      value={spectatorAccessMode}
                      onChange={(event) =>
                        setSpectatorAccessMode(event.target.value as "permanent" | "1" | "2" | "5" | "10")
                      }
                    >
                      <option value="permanent">Постоянная</option>
                      <option value="1">Лимит: 1 зритель</option>
                      <option value="2">Лимит: 2 зрителя</option>
                      <option value="5">Лимит: 5 зрителей</option>
                      <option value="10">Лимит: 10 зрителей</option>
                    </select>
                  </div>
                </div>
                <div className="obs-links-list">
                  {showLanLinks ? (
                    <OverlayLinkRow
                      label="LAN"
                      value={spectatorUrlLan}
                      hidden={spectatorHidden}
                      hiddenValueLabel={text.hiddenValue}
                      unavailableLabel={text.obsLinksUnavailable}
                      showSecretLabel={text.showSecret}
                      hideSecretLabel={text.hideSecret}
                      openButtonLabel={text.openButton}
                      copyButtonLabel={copyLabel("spectatorLan")}
                      onToggleHidden={onToggleSpectatorHidden}
                      onOpen={() => {
                        if (spectatorUrlLan) {
                          window.open(spectatorUrlLan, "_blank", "noopener,noreferrer");
                        }
                      }}
                      onCopy={() => onCopySpectator("lan")}
                      disableOpen={!spectatorUrlLan}
                      disableCopy={!spectatorUrlLan}
                    />
                  ) : null}
                  {spectatorUrlExternal ? (
                    <OverlayLinkRow
                      label={text.externalLabel}
                      value={spectatorUrlExternal}
                      hidden={spectatorHidden}
                      hiddenValueLabel={text.hiddenValue}
                      unavailableLabel={text.obsLinksUnavailable}
                      showSecretLabel={text.showSecret}
                      hideSecretLabel={text.hideSecret}
                      openButtonLabel={text.openButton}
                      copyButtonLabel={copyLabel("spectatorExternal")}
                      onToggleHidden={onToggleSpectatorHidden}
                      onOpen={() => {
                        window.open(spectatorUrlExternal, "_blank", "noopener,noreferrer");
                      }}
                      onCopy={() => onCopySpectator("external")}
                    />
                  ) : showHints ? (
                    <div className="muted linksSectionHint">{text.externalLinksHint}</div>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="linksSection">
              <h4 className="linksSectionTitle">{text.obsOverlayViewSectionTitle}</h4>
              <div className="obs-links-list">
                {showLanLinks ? (
                  <OverlayLinkRow
                    label="LAN"
                    value={overlayViewUrlLan}
                    hidden={overlayViewHidden}
                    hiddenValueLabel={text.hiddenValue}
                    unavailableLabel={text.obsLinksUnavailable}
                    showSecretLabel={text.showSecret}
                    hideSecretLabel={text.hideSecret}
                    openButtonLabel={text.openButton}
                    copyButtonLabel={copyLabel("overlayViewLan")}
                    onToggleHidden={onToggleOverlayViewHidden}
                    onOpen={() => {
                      if (overlayViewUrlLan) {
                        window.open(overlayViewUrlLan, "_blank", "noopener,noreferrer");
                      }
                    }}
                    onCopy={() => onCopyOverlayView("lan")}
                    disableOpen={!overlayViewUrlLan}
                    disableCopy={!overlayViewUrlLan}
                  />
                ) : null}
                {overlayViewUrlExternal ? (
                  <OverlayLinkRow
                    label={text.externalLabel}
                    value={overlayViewUrlExternal}
                    hidden={overlayViewHidden}
                    hiddenValueLabel={text.hiddenValue}
                    unavailableLabel={text.obsLinksUnavailable}
                    showSecretLabel={text.showSecret}
                    hideSecretLabel={text.hideSecret}
                    openButtonLabel={text.openButton}
                    copyButtonLabel={copyLabel("overlayViewExternal")}
                    onToggleHidden={onToggleOverlayViewHidden}
                    onOpen={() => {
                      window.open(overlayViewUrlExternal, "_blank", "noopener,noreferrer");
                    }}
                    onCopy={() => onCopyOverlayView("external")}
                  />
                ) : showHints ? (
                  <div className="muted linksSectionHint">{text.externalLinksHint}</div>
                ) : null}
              </div>
            </section>

            <section className="linksSection">
              <h4 className="linksSectionTitle">{text.obsOverlayControlSectionTitle}</h4>
              <div className="obs-links-list">
                {showLanLinks ? (
                  <OverlayLinkRow
                    label="LAN"
                    value={overlayControlUrlLan}
                    hidden={overlayControlHidden}
                    hiddenValueLabel={text.hiddenValue}
                    unavailableLabel={text.obsLinksUnavailable}
                    showSecretLabel={text.showSecret}
                    hideSecretLabel={text.hideSecret}
                    openButtonLabel={text.openButton}
                    copyButtonLabel={copyLabel("overlayControlLan")}
                    onToggleHidden={onToggleOverlayControlHidden}
                    onOpen={() => {
                      if (overlayControlUrlLan) {
                        window.open(overlayControlUrlLan, "_blank", "noopener,noreferrer");
                      }
                    }}
                    onCopy={() => onCopyOverlayControl("lan")}
                    disableOpen={!overlayControlUrlLan}
                    disableCopy={!overlayControlUrlLan}
                  />
                ) : null}
                {overlayControlUrlExternal ? (
                  <OverlayLinkRow
                    label={text.externalLabel}
                    value={overlayControlUrlExternal}
                    hidden={overlayControlHidden}
                    hiddenValueLabel={text.hiddenValue}
                    unavailableLabel={text.obsLinksUnavailable}
                    showSecretLabel={text.showSecret}
                    hideSecretLabel={text.hideSecret}
                    openButtonLabel={text.openButton}
                    copyButtonLabel={copyLabel("overlayControlExternal")}
                    onToggleHidden={onToggleOverlayControlHidden}
                    onOpen={() => {
                      window.open(overlayControlUrlExternal, "_blank", "noopener,noreferrer");
                    }}
                    onCopy={() => onCopyOverlayControl("external")}
                  />
                ) : showHints ? (
                  <div className="muted linksSectionHint">{text.externalLinksHint}</div>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
