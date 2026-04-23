import { useEffect, useState } from "react";

function getMediaQueryMatch(queryText: string): boolean {
  return typeof window !== "undefined" ? window.matchMedia(queryText).matches : false;
}

function useMediaQuery(queryText: string): boolean {
  const [matches, setMatches] = useState(() => getMediaQueryMatch(queryText));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = window.matchMedia(queryText);
    const update = (match: MediaQueryList | MediaQueryListEvent) => {
      setMatches("matches" in match ? match.matches : query.matches);
    };
    update(query);
    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, [queryText]);

  return matches;
}

export function useViewportFlags() {
  const isMobile = useMediaQuery("(max-width: 1250px)");
  const isMobileNarrow = useMediaQuery("(max-width: 600px)");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    if (isMobile) {
      html.classList.add("viewport-compact");
      body.classList.add("viewport-compact");
    } else {
      html.classList.remove("viewport-compact");
      body.classList.remove("viewport-compact");
    }
  }, [isMobile]);

  return { isMobile, isMobileNarrow };
}
