type RouteIssuePanelProps = {
  appTitle: string;
  title: string;
  message: string;
  exitLabel: string;
  onExit: () => void;
};

export default function RouteIssuePanel({
  appTitle,
  title,
  message,
  exitLabel,
  onExit,
}: RouteIssuePanelProps) {
  return (
    <section className="panel game-loading forbiddenStatePanel">
      <div className="forbiddenStateCard" role="alert">
        <div className="forbiddenStateEyebrow">{appTitle}</div>
        <h3 className="forbiddenStateTitle">{title}</h3>
        <p className="forbiddenStateMessage">{message}</p>
        <div className="forbiddenStateActions">
          <button type="button" className="forbiddenStateButton" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    </section>
  );
}
