import { useUiLocaleNamespace } from "../localization";

interface ErrorScreenProps {
  message: string;
  canRetry: boolean;
  reconnecting?: boolean;
  onRetry: () => void;
}

export default function ErrorScreen({
  message,
  canRetry,
  reconnecting = false,
  onRetry,
}: ErrorScreenProps) {
  const text = useUiLocaleNamespace("reconnect", { fallbacks: ["common"] });

  return (
    <div className="errorScreen" role="alert">
      <div className="errorScreenCard">
        <h3>{text.t("errorScreenTitle")}</h3>
        <div>{message}</div>
        {reconnecting ? <div className="muted">{text.t("errorScreenReconnecting")}</div> : null}
        <div className="errorScreenActions">
          {canRetry ? (
            <button className="primary" onClick={onRetry}>
              {text.t("retryButton")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
