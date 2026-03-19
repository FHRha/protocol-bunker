import { useEffect, useRef, useState } from "react";
import { useUiLocaleNamespace } from "../localization";

interface DossierMiniCardOption {
  id: string;
  label: string;
  selectable: boolean;
  selected: boolean;
}

interface DossierMiniCardProps {
  label: string;
  preview: string;
  expandedText: string;
  expanded: boolean;
  selected: boolean;
  revealed?: boolean;
  fullWidth?: boolean;
  featured?: boolean;
  expandable?: boolean;
  inactive?: boolean;
  options?: DossierMiniCardOption[];
  onCardClick?: () => void;
  onToggleExpand?: () => void;
  onSelectOption?: (id: string) => void;
}

export default function DossierMiniCard({
  label,
  preview,
  expandedText,
  expanded,
  selected,
  revealed = false,
  fullWidth = false,
  featured = false,
  expandable = true,
  inactive = false,
  options = [],
  onCardClick,
  onToggleExpand,
  onSelectOption,
}: DossierMiniCardProps) {
  const text = useUiLocaleNamespace("game", { fallbacks: ["common"] });

  const valueRef = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    if (expanded) return;
    const el = valueRef.current;
    if (!el) return;

    const recalc = () => {
      const vertical = el.scrollHeight > el.clientHeight + 1;
      const horizontal = el.scrollWidth > el.clientWidth + 1;
      setOverflowing(vertical || horizontal);
    };

    recalc();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(recalc);
      observer.observe(el);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, [preview, expanded]);

  const canExpand = expandable && (overflowing || options.length > 1);
  const handleCardActivate = () => {
    if (inactive) return;
    onCardClick?.();
    if (canExpand) {
      onToggleExpand?.();
    }
  };
  const cardClass = [
    "dossier-mini-card",
    expanded ? "expanded" : "",
    selected ? "selected" : "",
    revealed ? "revealed" : "",
    fullWidth ? "full-width" : "",
    featured ? "featured" : "",
    inactive ? "inactive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showOptions = expanded && options.length > 1;

  return (
    <div
      className={cardClass}
      role="button"
      tabIndex={inactive ? -1 : 0}
      aria-disabled={inactive}
      onClick={handleCardActivate}
      onKeyDown={(event) => {
        if (inactive) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleCardActivate();
        }
      }}
    >
      <div className="dossier-mini-header">
        <span className="dossier-mini-label">{label}</span>
        {canExpand ? (
          <button
            type="button"
            className={`dossier-mini-chevron${expanded ? " expanded" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              if (inactive) return;
              onToggleExpand?.();
            }}
            aria-label={expanded ? text.t("collapseLabel") : text.t("expandLabel")}
          >
            ▾
          </button>
        ) : null}
      </div>

      {!showOptions ? (
        <div ref={valueRef} className={`dossier-mini-value ${expanded ? "expanded" : "collapsed"}`}>
          {expanded ? expandedText : preview}
        </div>
      ) : (
        <div className="dossier-mini-options">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`dossier-mini-option${option.selected ? " selected" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                if (!inactive && option.selectable && onSelectOption) {
                  onSelectOption(option.id);
                }
              }}
              disabled={!option.selectable}
              title={option.label}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


