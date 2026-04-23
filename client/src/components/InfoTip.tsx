import { type CSSProperties, useId, useLayoutEffect, useRef, useState } from "react";

interface InfoTipProps {
  text: string;
  ariaLabel?: string;
}

const VIEWPORT_MARGIN = 12;
const TOOLTIP_GAP = 8;
const TOOLTIP_MAX_WIDTH = 280;
const TOOLTIP_MAX_HEIGHT = 240;

export default function InfoTip({ text, ariaLabel }: InfoTipProps) {
  const tooltipId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const availableWidth = Math.max(0, viewportWidth - VIEWPORT_MARGIN * 2);
      const availableHeight = Math.max(96, viewportHeight - VIEWPORT_MARGIN * 2);
      const width = Math.min(TOOLTIP_MAX_WIDTH, availableWidth);
      const maxHeight = Math.min(TOOLTIP_MAX_HEIGHT, availableHeight);
      const rect = trigger.getBoundingClientRect();
      const left = Math.min(
        Math.max(rect.left + rect.width / 2 - width / 2, VIEWPORT_MARGIN),
        viewportWidth - VIEWPORT_MARGIN - width,
      );
      const topBelow = rect.bottom + TOOLTIP_GAP;
      const topAbove = rect.top - TOOLTIP_GAP;
      const shouldOpenAbove =
        topBelow + maxHeight > viewportHeight - VIEWPORT_MARGIN &&
        topAbove > viewportHeight - topBelow;

      setTooltipStyle({
        left,
        maxHeight,
        top: shouldOpenAbove ? topAbove : topBelow,
        transform: shouldOpenAbove ? "translateY(-100%)" : undefined,
        width,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  return (
    <span
      ref={triggerRef}
      className="infoTip"
      tabIndex={0}
      role="button"
      aria-label={ariaLabel ?? text}
      aria-describedby={isOpen ? tooltipId : undefined}
      onBlur={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      i
      {isOpen && (
        <span id={tooltipId} className="infoTipBubble" role="tooltip" style={tooltipStyle}>
          {text}
        </span>
      )}
    </span>
  );
}
