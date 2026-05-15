import { useEffect, useRef, useState } from "react";
import type { FormEvent, PointerEvent } from "react";
import type { MatchMessage } from "@bunker/shared";
import { TypewriterText } from "./TypewriterText";

interface GameMatchFeedProps {
  messages: MatchMessage[];
  title: string;
  emptyText: string;
  inputPlaceholder: string;
  activePlaceholder: string;
  onSendMessage: (text: string) => void;
  onExpandedChange?: (expanded: boolean) => void;
  mobileSheet?: boolean;
}

function formatMessageTime(createdAt: number): string {
  const date = new Date(createdAt);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const CHAT_AUTOSCROLL_RESUME_MS = 10_000;
const CHAT_SEND_COOLDOWN_MS = 1_200;
const CHAT_TYPEWRITER_SCROLL_TICK_MS = 80;
const CHAT_TYPEWRITER_SCROLL_MAX_MS = 3_000;

function scrollToBottom(element: HTMLDivElement, behavior: ScrollBehavior = "auto"): void {
  element.scrollTo({ top: element.scrollHeight, behavior });
}

function isNearBottom(element: HTMLDivElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight < 16;
}

export function GameMatchFeed({
  messages,
  title,
  emptyText,
  inputPlaceholder,
  activePlaceholder,
  onSendMessage,
  onExpandedChange,
  mobileSheet = false,
}: GameMatchFeedProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resumeAutoScrollTimerRef = useRef<number | null>(null);
  const autoScrollPausedUntilRef = useRef(0);
  const autoScrollLockedRef = useRef(true);
  const hasScrolledOnceRef = useRef(false);
  const forceScrollAfterSendRef = useRef(false);
  const lastSentAtRef = useRef(0);
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const latestMessageId = messages.length > 0 ? messages[messages.length - 1]?.id ?? null : null;

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (forceScrollAfterSendRef.current) {
      forceScrollAfterSendRef.current = false;
      autoScrollLockedRef.current = true;
      autoScrollPausedUntilRef.current = 0;
      scrollToBottom(element, "smooth");
      hasScrolledOnceRef.current = true;
      return;
    }
    if (!focused && !mobileSheet) {
      autoScrollLockedRef.current = true;
      autoScrollPausedUntilRef.current = 0;
      scrollToBottom(element, hasScrolledOnceRef.current ? "smooth" : "auto");
      hasScrolledOnceRef.current = true;
      return;
    }
    if (autoScrollLockedRef.current || Date.now() >= autoScrollPausedUntilRef.current) {
      autoScrollLockedRef.current = true;
      scrollToBottom(element, hasScrolledOnceRef.current ? "smooth" : "auto");
      hasScrolledOnceRef.current = true;
    }
  }, [focused, latestMessageId, mobileSheet]);

  useEffect(() => {
    const element = scrollRef.current;
    const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    if (!element || !latestMessage || latestMessage.textKey === "match.bot.ai.thinking") return;

    const startedAt = Date.now();
    const keepAtBottom = () => {
      if (!scrollRef.current) return;
      if (!autoScrollLockedRef.current && Date.now() < autoScrollPausedUntilRef.current) return;
      scrollToBottom(scrollRef.current, "auto");
    };

    keepAtBottom();
    const timer = window.setInterval(() => {
      keepAtBottom();
      if (Date.now() - startedAt >= CHAT_TYPEWRITER_SCROLL_MAX_MS) {
        window.clearInterval(timer);
      }
    }, CHAT_TYPEWRITER_SCROLL_TICK_MS);

    return () => window.clearInterval(timer);
  }, [latestMessageId, messages]);

  useEffect(() => {
    return () => {
      if (resumeAutoScrollTimerRef.current !== null) {
        window.clearTimeout(resumeAutoScrollTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const timer = window.setTimeout(() => setCooldownUntil(0), cooldownUntil - Date.now());
    return () => window.clearTimeout(timer);
  }, [cooldownUntil]);

  useEffect(() => {
    if (!focused || mobileSheet) return;
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = event.target;
      if (target instanceof Node && panel.contains(target)) return;
      setFocused(false);
      scheduleAutoScrollResume();
      onExpandedChange?.(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [focused, onExpandedChange]);

  const pauseAutoScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    if (!focused && !mobileSheet) {
      autoScrollLockedRef.current = true;
      autoScrollPausedUntilRef.current = 0;
      window.requestAnimationFrame(() => {
        if (scrollRef.current) scrollToBottom(scrollRef.current, "smooth");
      });
      return;
    }
    autoScrollLockedRef.current = isNearBottom(element);
    if (!autoScrollLockedRef.current) {
      autoScrollPausedUntilRef.current = Number.POSITIVE_INFINITY;
    }
  };

  const scheduleAutoScrollResume = () => {
    if (resumeAutoScrollTimerRef.current !== null) {
      window.clearTimeout(resumeAutoScrollTimerRef.current);
    }
    autoScrollPausedUntilRef.current = Date.now() + CHAT_AUTOSCROLL_RESUME_MS;
    resumeAutoScrollTimerRef.current = window.setTimeout(() => {
      const element = scrollRef.current;
      autoScrollLockedRef.current = true;
      autoScrollPausedUntilRef.current = 0;
      if (element) scrollToBottom(element, "smooth");
    }, CHAT_AUTOSCROLL_RESUME_MS);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const now = Date.now();
    if (now - lastSentAtRef.current < CHAT_SEND_COOLDOWN_MS) {
      setCooldownUntil(lastSentAtRef.current + CHAT_SEND_COOLDOWN_MS);
      return;
    }
    lastSentAtRef.current = now;
    setCooldownUntil(now + CHAT_SEND_COOLDOWN_MS);
    forceScrollAfterSendRef.current = true;
    autoScrollLockedRef.current = true;
    autoScrollPausedUntilRef.current = 0;
    onSendMessage(text);
    setDraft("");
    window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollToBottom(scrollRef.current, "smooth");
    });
  };

  const expandFeed = () => {
    setFocused(true);
    onExpandedChange?.(true);
  };

  const handlePanelPointerDown = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    if (mobileSheet) return;
    expandFeed();
  };

  return (
    <section
      ref={panelRef}
      className={`match-feed-panel${mobileSheet ? " match-feed-panel--mobile-sheet" : ""}`}
      aria-live="polite"
      onFocusCapture={mobileSheet ? undefined : expandFeed}
      onPointerDown={handlePanelPointerDown}
    >
      <div className="match-feed-header">
        <h3>{title}</h3>
        <span className="muted">{messages.length}</span>
      </div>
      <div className="match-feed-list" ref={scrollRef} onScroll={pauseAutoScroll} onPointerDown={pauseAutoScroll}>
        {messages.length === 0 ? (
          <div className="match-feed-empty muted">{emptyText}</div>
        ) : (
          messages.map((message) => {
            const isLatest = message.id === latestMessageId;
            return (
              <article key={message.id} className={`match-feed-item match-feed-item--${message.kind}`}>
                <div className="match-feed-meta">
                  <span>{message.sourceName || title}</span>
                  <time dateTime={new Date(message.createdAt).toISOString()}>{formatMessageTime(message.createdAt)}</time>
                </div>
                <div className="match-feed-text">
                  {message.textKey === "match.bot.ai.thinking" ? (
                    <span className="thinking-text">{message.text}</span>
                  ) : (
                    <TypewriterText text={message.text} active={isLatest} />
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
      <form className="match-feed-input-shell" onSubmit={handleSubmit}>
        <input
          className="match-feed-input"
          aria-label={title}
          placeholder={focused ? activePlaceholder : inputPlaceholder}
          value={draft}
          maxLength={500}
          onChange={(event) => setDraft(event.target.value)}
        />
      </form>
    </section>
  );
}
