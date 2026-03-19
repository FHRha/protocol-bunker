import fs from "node:fs";
import path from "node:path";

export type DevTestLocaleCode = "ru" | "en";

type DevTestDict = Record<string, string>;

const DEV_TEST_LOCALE_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), "locales", "scenario", "dev_test"),
  path.resolve(process.cwd(), "..", "locales", "scenario", "dev_test"),
  path.resolve(process.cwd(), "..", "..", "locales", "scenario", "dev_test"),
];

function loadLocaleFile(locale: DevTestLocaleCode): DevTestDict {
  for (const root of DEV_TEST_LOCALE_ROOT_CANDIDATES) {
    const filePath = path.join(root, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const dict: DevTestDict = {};
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

const DEV_TEST_DICTIONARIES: Record<DevTestLocaleCode, DevTestDict> = {
  ru: loadLocaleFile("ru"),
  en: loadLocaleFile("en"),
};

export function tDev(key: string, locale: DevTestLocaleCode = "ru"): string {
  const localized = DEV_TEST_DICTIONARIES[locale]?.[key];
  if (localized) return localized;
  const fallback = DEV_TEST_DICTIONARIES.ru[key];
  return fallback ?? key;
}

export function tDevFmt(
  key: string,
  vars: Record<string, string | number>,
  locale: DevTestLocaleCode = "ru"
): string {
  let template = tDev(key, locale);
  for (const [name, value] of Object.entries(vars)) {
    template = template.replaceAll(`{{${name}}}`, String(value));
  }
  return template;
}
