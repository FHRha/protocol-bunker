import fs from "node:fs";
import path from "node:path";

type ScenarioLocaleCode = "ru" | "en";
type ScenarioDictionary = Record<string, string>;
type ReverseDictionary = Map<string, string>;
type TemplateVars = Record<string, string | number> | undefined;

const SCENARIO_LOCALE_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), "locales", "scenario"),
  path.resolve(process.cwd(), "..", "locales", "scenario"),
  path.resolve(process.cwd(), "..", "..", "locales", "scenario"),
];

function readScenarioDictionaryFile(filePath: string): ScenarioDictionary {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const next: ScenarioDictionary = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof key === "string" && typeof value === "string") {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return {};
  }
}

function loadScenarioDictionary(locale: ScenarioLocaleCode, scenarioId?: string): ScenarioDictionary {
  if (locale === "ru" || !scenarioId) return {};
  for (const root of SCENARIO_LOCALE_ROOT_CANDIDATES) {
    const filePath = path.join(root, scenarioId, `${locale}.json`);
    const dict = readScenarioDictionaryFile(filePath);
    if (Object.keys(dict).length > 0) {
      return dict;
    }
  }
  return {};
}

const SCENARIO_DICTIONARIES = new Map<string, ScenarioDictionary>();
const SCENARIO_REVERSE_DICTIONARIES = new Map<string, ReverseDictionary>();

function getScenarioDictionary(locale: ScenarioLocaleCode, scenarioId?: string): ScenarioDictionary {
  if (locale === "ru" || !scenarioId) return {};
  const key = `${locale}:${scenarioId}`;
  const cached = SCENARIO_DICTIONARIES.get(key);
  if (cached) return cached;
  const loaded = loadScenarioDictionary(locale, scenarioId);
  SCENARIO_DICTIONARIES.set(key, loaded);
  return loaded;
}

function getScenarioReverseDictionary(locale: ScenarioLocaleCode, scenarioId?: string): ReverseDictionary {
  if (!scenarioId) return new Map();
  const key = `${locale}:${scenarioId}`;
  const cached = SCENARIO_REVERSE_DICTIONARIES.get(key);
  if (cached) return cached;
  const dict = locale === "ru" ? loadScenarioDictionary("ru", scenarioId) : getScenarioDictionary(locale, scenarioId);
  const reverse: ReverseDictionary = new Map();
  for (const [dictKey, value] of Object.entries(dict)) {
    if (!reverse.has(value)) reverse.set(value, dictKey);
  }
  SCENARIO_REVERSE_DICTIONARIES.set(key, reverse);
  return reverse;
}

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

function formatTemplate(template: string, vars?: TemplateVars): string {
  if (!vars) return template;
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function localizeScenarioMessage(
  message: string,
  locale: ScenarioLocaleCode,
  scenarioId?: string,
  vars?: TemplateVars
): string {
  if (!message) return message;
  if (locale === "ru") return formatTemplate(message, vars);
  const dict = getScenarioDictionary(locale, scenarioId);
  const exact = dict[message];
  if (exact) return formatTemplate(exact, vars);
  const reverseRu = getScenarioReverseDictionary("ru", scenarioId);
  const messageKey = reverseRu.get(message);
  if (messageKey) {
    const localized = dict[messageKey];
    if (localized) return formatTemplate(localized, vars);
  }
  for (const rule of EN_PATTERN_RULES) {
    const localized = rule(message);
    if (localized) return formatTemplate(localized, vars);
  }
  return formatTemplate(message, vars);
}

export function resolveScenarioLocaleKey(message: string, scenarioId?: string): string | null {
  if (!message || !scenarioId) return null;
  const directRu = getScenarioReverseDictionary("ru", scenarioId).get(message);
  if (directRu) return directRu;
  const directEn = getScenarioReverseDictionary("en", scenarioId).get(message);
  if (directEn) return directEn;
  return null;
}
