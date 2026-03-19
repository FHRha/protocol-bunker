import fs from "node:fs";
import path from "node:path";
const CLASSIC_LOCALE_ROOT_CANDIDATES = [
    path.resolve(process.cwd(), "locales", "scenario", "classic"),
    path.resolve(process.cwd(), "..", "locales", "scenario", "classic"),
    path.resolve(process.cwd(), "..", "..", "locales", "scenario", "classic"),
];
function loadLocaleFile(locale) {
    for (const root of CLASSIC_LOCALE_ROOT_CANDIDATES) {
        const filePath = path.join(root, `${locale}.json`);
        if (!fs.existsSync(filePath))
            continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
            if (!parsed || typeof parsed !== "object")
                continue;
            const dict = {};
            for (const [k, v] of Object.entries(parsed)) {
                if (typeof k === "string" && typeof v === "string")
                    dict[k] = v;
            }
            return dict;
        }
        catch {
            // ignore malformed locale file
        }
    }
    return {};
}
const CLASSIC_DICTIONARIES = {
    ru: loadLocaleFile("ru"),
    en: loadLocaleFile("en"),
};
export function tClassic(key, locale = "ru") {
    const localized = CLASSIC_DICTIONARIES[locale]?.[key];
    if (localized)
        return localized;
    const fallback = CLASSIC_DICTIONARIES.ru[key];
    return fallback ?? key;
}
export function tClassicFmt(key, vars, locale = "ru") {
    let template = tClassic(key, locale);
    for (const [name, value] of Object.entries(vars)) {
        template = template.replaceAll(`{{${name}}}`, String(value));
    }
    return template;
}
