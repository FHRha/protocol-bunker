export type SpecialDialogKind =
  | "none"
  | "player"
  | "neighbor"
  | "category"
  | "bunker"
  | "baggage"
  | "special";

export interface SpecialDialogCardPicker {
  categoryKey: string;
  requireSourceCard?: boolean;
}

export interface SpecialDialogState {
  kind: SpecialDialogKind;
  specialInstanceId: string;
  title: string;
  options: Array<{ id: string; label: string }>;
  description?: string;
  cardPicker?: SpecialDialogCardPicker;
}

export interface DialogCardOption {
  instanceId: string;
  hint: string;
}

export interface WorldDetailState {
  title: string;
  description?: string;
  imageUrl?: string;
  label: string;
  kind: string;
}
