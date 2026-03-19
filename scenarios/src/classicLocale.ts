import fs from "node:fs";
import path from "node:path";

export type ClassicLocaleCode = "ru" | "en";

type ClassicDict = Record<string, string>;

const CLASSIC_LOCALE_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), "locales", "scenario", "classic"),
  path.resolve(process.cwd(), "..", "locales", "scenario", "classic"),
  path.resolve(process.cwd(), "..", "..", "locales", "scenario", "classic"),
];

function loadLocaleFile(locale: ClassicLocaleCode): ClassicDict {
  for (const root of CLASSIC_LOCALE_ROOT_CANDIDATES) {
    const filePath = path.join(root, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const dict: ClassicDict = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string") dict[k] = v;
      }
      return dict;
    } catch {
      // ignore malformed locale file
    }
  }
  return {};
}

const CLASSIC_DICTIONARIES: Record<ClassicLocaleCode, ClassicDict> = {
  ru: loadLocaleFile("ru"),
  en: loadLocaleFile("en"),
};

export function tClassic(key: string, locale: ClassicLocaleCode = "ru"): string {
  const localized = CLASSIC_DICTIONARIES[locale]?.[key];
  if (localized) return localized;
  const fallback = CLASSIC_DICTIONARIES.ru[key];
  return fallback ?? key;
}

export function tClassicFmt(
  key: string,
  vars: Record<string, string | number>,
  locale: ClassicLocaleCode = "ru"
): string {
  let template = tClassic(key, locale);
  for (const [name, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${name}}}`, String(value));
  }
  return template;
}
