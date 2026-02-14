interface ErrorScreenProps {
  message: string;
  canRetry: boolean;
  reconnecting?: boolean;
  onRetry: () => void;
  onExitToMenu: () => void;
}

export default function ErrorScreen({
  message,
  canRetry,
  reconnecting = false,
  onRetry,
  onExitToMenu,
}: ErrorScreenProps) {
  return (
    <div className="errorScreen" role="alert">
      <div className="errorScreenCard">
        <h3>Ошибка подключения</h3>
        <div>{message}</div>
        {reconnecting ? <div className="muted">Ждём переподключения…</div> : null}
        <div className="errorScreenActions">
          {canRetry ? (
            <button className="primary" onClick={onRetry}>
              Повторить
            </button>
          ) : null}
          <button className="ghost" onClick={onExitToMenu}>
            Выйти в меню
          </button>
        </div>
      </div>
    </div>
  );
}
