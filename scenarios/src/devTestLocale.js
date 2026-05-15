import fs from "node:fs";
import path from "node:path";
const DEV_TEST_LOCALE_ROOT_CANDIDATES = [
    path.resolve(process.cwd(), "locales", "scenario", "dev_test"),
    path.resolve(process.cwd(), "..", "locales", "scenario", "dev_test"),
    path.resolve(process.cwd(), "..", "..", "locales", "scenario", "dev_test"),
];
function loadLocaleFile(locale) {
    for (const root of DEV_TEST_LOCALE_ROOT_CANDIDATES) {
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
const DEV_TEST_DICTIONARIES = {
    ru: loadLocaleFile("ru"),
    en: loadLocaleFile("en"),
};
export function tDev(key, locale = "ru") {
    const localized = DEV_TEST_DICTIONARIES[locale]?.[key];
    if (localized)
        return localized;
    const fallback = DEV_TEST_DICTIONARIES.ru[key];
    return fallback ?? key;
}
export function tDevFmt(key, vars, locale = "ru") {
    let template = tDev(key, locale);
    for (const [name, value] of Object.entries(vars)) {
        template = template.replaceAll(`{{${name}}}`, String(value));
    }
    return template;
}
