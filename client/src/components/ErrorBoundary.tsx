import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      // Keep detailed logs in dev only.
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error, errorInfo);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    this.props.onReset?.();
    window.location.assign("/");
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="fatalErrorScreen" role="alert">
        <div className="fatalErrorCard">
          <h2>Что-то пошло не так</h2>
          <p className="muted">{this.state.errorMessage ?? "Неизвестная ошибка интерфейса."}</p>
          <div className="fatalErrorActions">
            <button className="primary" onClick={this.handleReload}>
              Перезагрузить страницу
            </button>
            <button className="ghost" onClick={this.handleHome}>
              Выйти в меню
            </button>
          </div>
        </div>
      </div>
    );
  }
}
