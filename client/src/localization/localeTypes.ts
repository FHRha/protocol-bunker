export type LocaleCode = "ru" | "en";

export type UiFormatter = (...args: any[]) => string;

// Временный совместимый тип для переходного периода.
// Когда полностью уберём остатки старого dictionary-style доступа,
// можно будет ужесточить типизацию.
export interface UiDictionary {
  [key: string]: any;
}