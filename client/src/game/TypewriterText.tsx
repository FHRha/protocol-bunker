import { useEffect, useState } from "react";

interface TypewriterTextProps {
  text: string;
  active?: boolean;
  stepMs?: number;
}

export function TypewriterText({ text, active = true, stepMs = 18 }: TypewriterTextProps) {
  const [visibleCount, setVisibleCount] = useState(() => (active ? 0 : text.length));

  useEffect(() => {
    if (!active) {
      setVisibleCount(text.length);
      return;
    }
    setVisibleCount(0);
    if (!text) return;

    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      setVisibleCount((current) => {
        const next = Math.min(text.length, Math.max(current + 1, frame));
        if (next >= text.length) {
          window.clearInterval(id);
        }
        return next;
      });
    }, stepMs);

    return () => window.clearInterval(id);
  }, [active, stepMs, text]);

  return <>{text.slice(0, visibleCount)}</>;
}
