import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

type UsePopoverDismissalInput = {
  routeKey: string;
  settingsMenuRef: RefObject<HTMLElement | null>;
  themeMenuRef: RefObject<HTMLElement | null>;
  setSettingsMenuOpen: Dispatch<SetStateAction<boolean>>;
  setThemeMenuOpen: Dispatch<SetStateAction<boolean>>;
};

export function usePopoverDismissal({
  routeKey,
  settingsMenuRef,
  themeMenuRef,
  setSettingsMenuOpen,
  setThemeMenuOpen,
}: UsePopoverDismissalInput) {
  useEffect(() => {
    setSettingsMenuOpen(false);
    setThemeMenuOpen(false);
  }, [routeKey, setSettingsMenuOpen, setThemeMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismiss = () => {
      setSettingsMenuOpen(false);
      setThemeMenuOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const clickedInside =
        settingsMenuRef.current?.contains(target) || themeMenuRef.current?.contains(target);
      if (!clickedInside) {
        dismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setSettingsMenuOpen, setThemeMenuOpen, settingsMenuRef, themeMenuRef]);
}
