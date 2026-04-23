import EyeIcon from "../components/EyeIcon";

type OverlayLinkRowProps = {
  label: string;
  value: string;
  hidden: boolean;
  hiddenValueLabel: string;
  unavailableLabel: string;
  showSecretLabel: string;
  hideSecretLabel: string;
  openButtonLabel: string;
  copyButtonLabel: string;
  onToggleHidden: () => void;
  onOpen: () => void;
  onCopy: () => void;
  disableOpen?: boolean;
  disableCopy?: boolean;
};

export function OverlayLinkRow({
  label,
  value,
  hidden,
  hiddenValueLabel,
  unavailableLabel,
  showSecretLabel,
  hideSecretLabel,
  openButtonLabel,
  copyButtonLabel,
  onToggleHidden,
  onOpen,
  onCopy,
  disableOpen = false,
  disableCopy = false,
}: OverlayLinkRowProps) {
  const visibleValue = value || "—";
  const title = hidden ? showSecretLabel : value || unavailableLabel;
  const displayValue = hidden ? hiddenValueLabel : visibleValue;

  return (
    <div className="obs-link-row">
      <div className="obs-link-main">
        <div className="obs-link-label">{label}</div>
        <div className={`secret-value obs-link-value${hidden ? " maskedText" : ""}`} title={title}>
          {displayValue}
        </div>
      </div>
      <div className="secret-actions">
        <button
          type="button"
          className="ghost iconButton"
          aria-label={hidden ? showSecretLabel : hideSecretLabel}
          title={hidden ? showSecretLabel : hideSecretLabel}
          onClick={onToggleHidden}
        >
          <EyeIcon open={!hidden} />
        </button>
        <button type="button" className="ghost button-small" disabled={disableOpen} onClick={onOpen}>
          {openButtonLabel}
        </button>
        <button type="button" className="ghost button-small" disabled={disableCopy} onClick={onCopy}>
          {copyButtonLabel}
        </button>
      </div>
    </div>
  );
}
