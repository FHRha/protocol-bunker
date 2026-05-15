import { useEffect, useRef } from "react";
import type { MatchMessage } from "@bunker/shared";
import { GameMatchFeed } from "./GameMatchFeed";

interface GameMobileChatSheetProps {
  messages: MatchMessage[];
  title: string;
  emptyText: string;
  inputPlaceholder: string;
  activePlaceholder: string;
  closeLabel: string;
  onClose: () => void;
  onSendMessage: (text: string) => void;
}

export function GameMobileChatSheet({
  messages,
  title,
  emptyText,
  inputPlaceholder,
  activePlaceholder,
  closeLabel,
  onClose,
  onSendMessage,
}: GameMobileChatSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const panel = panelRef.current;
    if (!viewport || !panel) return;

    const updateViewportHeight = () => {
      const bottomInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      panel.style.setProperty("--mobile-chat-keyboard-offset", `${Math.ceil(bottomInset)}px`);
      panel.style.setProperty("--mobile-chat-viewport-height", `${Math.floor(viewport.height)}px`);
    };

    updateViewportHeight();
    viewport.addEventListener("resize", updateViewportHeight);
    viewport.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("orientationchange", updateViewportHeight);
    return () => {
      viewport.removeEventListener("resize", updateViewportHeight);
      viewport.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("orientationchange", updateViewportHeight);
    };
  }, []);

  return (
    <div className="mobile-chat-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="mobile-chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mobile-chat-header">
          <div>
            <div className="mobile-chat-title">{title}</div>
            <div className="muted">{messages.length}</div>
          </div>
          <button className="ghost button-small" type="button" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        <GameMatchFeed
          messages={messages}
          title={title}
          emptyText={emptyText}
          inputPlaceholder={inputPlaceholder}
          activePlaceholder={activePlaceholder}
          onSendMessage={onSendMessage}
          mobileSheet={true}
        />
      </div>
    </div>
  );
}
