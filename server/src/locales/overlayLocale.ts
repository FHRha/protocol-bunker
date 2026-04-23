import fs from "node:fs";
import path from "node:path";

import type { ServerLocaleCode } from "./serverLocale.js";

type TemplateVars = Record<string, unknown>;
type LocaleDictionary = Record<string, string>;

const formatTemplate = (template: string, vars?: TemplateVars): string => {
  if (!vars) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_full, key: string) => {
    const value = vars[key];
    return typeof value === "undefined" ? `{${key}}` : String(value);
  });
};

const LOCALE_CANDIDATE_ROOTS = [
  path.resolve(process.cwd(), "locales", "overlay"),
  path.resolve(process.cwd(), "..", "locales", "overlay"),
  path.resolve(process.cwd(), "..", "..", "locales", "overlay"),
];

function loadLocaleDictionary(locale: ServerLocaleCode): LocaleDictionary {
  for (const root of LOCALE_CANDIDATE_ROOTS) {
    const filePath = path.join(root, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const dict: LocaleDictionary = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "string") {
          dict[key] = value;
        }
      }
      return dict;
    } catch {
      // Ignore malformed locale file and keep searching fallbacks.
    }
  }
  return {};
}

const OVERLAY_MESSAGES: Record<ServerLocaleCode, LocaleDictionary> = {
  ru: loadLocaleDictionary("ru"),
  en: loadLocaleDictionary("en"),
};

export const tOverlay = (
  locale: ServerLocaleCode,
  key: string,
  vars?: TemplateVars
): string => {
  const localized = OVERLAY_MESSAGES[locale][key];
  const fallback = OVERLAY_MESSAGES.en[key] ?? OVERLAY_MESSAGES.ru[key] ?? key;
  const template = localized ?? fallback;
  return formatTemplate(template, vars);
};
