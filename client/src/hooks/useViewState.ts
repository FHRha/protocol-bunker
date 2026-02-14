import { useOverlayViewState } from "./useOverlayViewState";

export function useViewState(viewSrc: string | null | undefined) {
  return useOverlayViewState({ sourceUrl: viewSrc ?? undefined });
}

