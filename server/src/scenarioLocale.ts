import fs from "node:fs";
import path from "node:path";

type ScenarioLocaleCode = "ru" | "en";
type ScenarioDictionary = Record<string, string>;

const SCENARIO_LOCALE_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), "locales", "scenario"),
  path.resolve(process.cwd(), "..", "locales", "scenario"),
  path.resolve(process.cwd(), "..", "..", "locales", "scenario"),
];

function loadScenarioDictionary(locale: ScenarioLocaleCode): ScenarioDictionary {
  if (locale === "ru") return {};
  for (const root of SCENARIO_LOCALE_ROOT_CANDIDATES) {
    const filePath = path.join(root, `${locale}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const next: ScenarioDictionary = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof key !== "string" || typeof value !== "string") continue;
        next[key] = value;
      }
      return next;
    } catch {
      // ignore malformed file and keep fallback search
    }
  }
  return {};
}

const SCENARIO_DICTIONARIES: Record<ScenarioLocaleCode, ScenarioDictionary> = {
  ru: {},
  en: loadScenarioDictionary("en"),
};

const EN_PATTERN_RULES: Array<(message: string) => string | null> = [
  (message) => {
    const m = message.match(/^В колоде категории "(.+)" больше нет карт\.$/);
    return m ? `No cards left in "${m[1]}" category deck.` : null;
  },
  (message) => {
    const m = message.match(/^В этом раунде нужно раскрыть карту категории "(.+)"\.$/);
    return m ? `This round you must reveal a card from "${m[1]}" category.` : null;
  },
  (message) => {
    const m = message.match(/^Итоги голосования: исключён (.+)\.$/);
    return m ? `Voting result: ${m[1]} is eliminated.` : null;
  },
  (message) => {
    const m = message.match(/^(.+) исключён\.$/);
    return m ? `${m[1]} is eliminated.` : null;
  },
  (message) => {
    const m = message.match(/^Раунд (\d+): началось раскрытие\.$/);
    return m ? `Round ${m[1]}: reveal phase started.` : null;
  },
  (message) => {
    const m = message.match(/^Началось голосование \(раунд (\d+)\)\.$/);
    return m ? `Voting started (round ${m[1]}).` : null;
  },
  (message) => {
    const m = message.match(/^Игрок (.+) раскрывает карту(?: \(бот\))?\.$/);
    return m ? `Player ${m[1]} reveals a card.` : null;
  },
  (message) => {
    const m = message.match(/^Добавлен игрок (.+)\.$/);
    return m ? `Player ${m[1]} added.` : null;
  },
  (message) => {
    const m = message.match(/^Удалён игрок (.+)\.$/);
    return m ? `Player ${m[1]} removed.` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий заменил особое условие игрока (.+)\.$/);
    return m ? `Host replaced special condition for ${m[1]}.` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий заменил карту игрока (.+) \((.+)\)\.$/);
    return m ? `Host replaced ${m[2]} card for ${m[1]}.` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий (раскрыл|скрыл) карту мира \((.+)\)\.$/);
    if (!m) return null;
    const verb = m[1] === "раскрыл" ? "revealed" : "hid";
    return `Host ${verb} world card (${m[2]}).`;
  },
  (message) => {
    const m = message.match(/^Ведущий заменил карту мира \((.+)\)\.$/);
    return m ? `Host replaced world card (${m[1]}).` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий обновил количество карт мира \((.+): (.+)\)\.$/);
    return m ? `Host updated world card count (${m[1]}: ${m[2]}).` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий применил спецусловие из каталога: "(.+)"\.$/);
    return m ? `Host applied special condition from catalog: "${m[1]}".` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий применил спецусловие из каталога "(.+)" от имени (.+)\.$/);
    return m ? `Host applied special condition "${m[1]}" on behalf of ${m[2]}.` : null;
  },
  (message) => {
    const m = message.match(/^Ведущий применил спецусловие игрока (.+?)(?:: (.+))?\.$/);
    if (!m) return null;
    if (m[2]) return `Host applied player's special condition for ${m[1]}: ${m[2]}.`;
    return `Host applied player's special condition for ${m[1]}.`;
  },
  (message) => {
    const m = message.match(/^Игра завершена\. В бункер попали: (.+)\.(?: Угроза: (.+)\.)?$/);
    if (!m) return null;
    return m[2]
      ? `Game finished. In bunker: ${m[1]}. Threat: ${m[2]}.`
      : `Game finished. In bunker: ${m[1]}.`;
  },
  (message) => {
    const m = message.match(/^Игра завершена\. Победители: (.+)\.(?: Угроза: (.+)\.)?$/);
    if (!m) return null;
    return m[2]
      ? `Game finished. Winners: ${m[1]}. Threat: ${m[2]}.`
      : `Game finished. Winners: ${m[1]}.`;
  },
];

export function localizeScenarioMessage(message: string, locale: ScenarioLocaleCode): string {
  if (!message || locale === "ru") return message;
  const dict = SCENARIO_DICTIONARIES[locale];
  const exact = dict[message];
  if (exact) return exact;
  for (const rule of EN_PATTERN_RULES) {
    const localized = rule(message);
    if (localized) return localized;
  }
  return message;
}
