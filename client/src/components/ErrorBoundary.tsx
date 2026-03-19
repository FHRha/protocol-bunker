import React from "react";
import { useUiLocaleNamespace } from "../localization";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
}

class ErrorBoundaryInner extends React.Component<
  ErrorBoundaryProps & {
    fatalErrorTitle: string;
    fatalErrorUnknown: string;
    fatalErrorReload: string;
    errorScreenExitToMenu: string;
  },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
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
          <h2>{this.props.fatalErrorTitle}</h2>
          <p className="muted">{this.state.errorMessage ?? this.props.fatalErrorUnknown}</p>
          <div className="fatalErrorActions">
            <button className="primary" onClick={this.handleReload}>
              {this.props.fatalErrorReload}
            </button>
            <button className="ghost" onClick={this.handleHome}>
              {this.props.errorScreenExitToMenu}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function ErrorBoundary(props: ErrorBoundaryProps) {
  const text = useUiLocaleNamespace("reconnect", { fallbacks: ["common", "misc"] });

  return (
    <ErrorBoundaryInner
      {...props}
      fatalErrorTitle={text.t("fatalErrorTitle")}
      fatalErrorUnknown={text.t("fatalErrorUnknown")}
      fatalErrorReload={text.t("fatalErrorReload")}
      errorScreenExitToMenu={text.t("errorScreenExitToMenu")}
    />
  );
}
