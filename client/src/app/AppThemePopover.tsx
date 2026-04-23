import type { RefObject } from "react";
import type { ThemeMode } from "./uiPreferences";

type ThemeOption = { id: ThemeMode; label: string };

interface AppThemePopoverProps {
  popoverRef: RefObject<HTMLDivElement>;
  title: string;
  theme: ThemeMode;
  options: ThemeOption[];
  open: boolean;
  setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  setTheme: (value: ThemeMode) => void;
  closeSettingsMenu: () => void;
}

export function AppThemePopover({
  popoverRef,
  title,
  theme,
  options,
  open,
  setOpen,
  setTheme,
  closeSettingsMenu,
}: AppThemePopoverProps) {
  return (
    <div className="topbar-popover" ref={popoverRef}>
      <button
        className="ghost topbar-icon-toggle"
        aria-label={title}
        title={title}
        onClick={() => {
          setOpen((prev) => !prev);
          closeSettingsMenu();
        }}
      >
        <span className={`topbar-theme-swatch topbar-theme-swatch--current topbar-theme-swatch--${theme}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="topbar-popover-menu">
          <div className="topbar-popover-title">{title}</div>
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`topbar-theme-option${theme === option.id ? " selected" : ""}`}
              onClick={() => {
                setTheme(option.id);
                setOpen(false);
              }}
            >
              <span className="topbar-theme-option-content">
                <span className={`topbar-theme-swatch topbar-theme-swatch--${option.id}`} aria-hidden="true" />
                <span>{option.label}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
