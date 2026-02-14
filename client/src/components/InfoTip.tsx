interface InfoTipProps {
  text: string;
  ariaLabel?: string;
}

export default function InfoTip({ text, ariaLabel }: InfoTipProps) {
  return (
    <span
      className="infoTip"
      tabIndex={0}
      role="button"
      aria-label={ariaLabel ?? text}
      data-tip={text}
    >
      i
    </span>
  );
}
