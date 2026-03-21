import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_PATH = path.join(ROOT, "docs", "TEMP-localization-open-items.txt");

const uiRoot = path.join(ROOT, "locales", "ui");
const cardsRuPath = path.join(ROOT, "locales", "cards", "ru.json");
const cardsEnPath = path.join(ROOT, "locales", "cards", "en.json");
const serverRuPath = path.join(ROOT, "locales", "server", "ru.json");
const serverEnPath = path.join(ROOT, "locales", "server", "en.json");
const serverIndexPath = path.join(ROOT, "server", "src", "index.ts");
const classicScenarioPath = path.join(ROOT, "scenarios", "src", "classic.ts");
const devScenarioPath = path.join(ROOT, "scenarios", "src", "dev_test.ts");
const classicScenarioEnPath = path.join(ROOT, "locales", "scenario", "classic", "en.json");
const classicScenarioRuPath = path.join(ROOT, "locales", "scenario", "classic", "ru.json");
const devScenarioEnPath = path.join(ROOT, "locales", "scenario", "dev_test", "en.json");
const devScenarioRuPath = path.join(ROOT, "locales", "scenario", "dev_test", "ru.json");

const strictMode = process.argv.includes("--strict");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readLocaleTree(rootDir, locale) {
  const merged = {};
  if (!fs.existsSync(rootDir)) return merged;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile() || entry.name !== `${locale}.json`) continue;
      const parsed = readJson(fullPath);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      Object.assign(merged, parsed);
    }
  };

  walk(rootDir);
  return merged;
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function flatten(input, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(input ?? {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flatten(value, fullKey, out);
      continue;
    }
    out[fullKey] = String(value);
  }
  return out;
}

function diffDictionaries(base, target) {
  const baseFlat = flatten(base);
  const targetFlat = flatten(target);
  const baseKeys = Object.keys(baseFlat).sort();
  const targetKeys = Object.keys(targetFlat).sort();
  const baseSet = new Set(baseKeys);
  const targetSet = new Set(targetKeys);

  const missingInTarget = baseKeys.filter((key) => !targetSet.has(key));
  const missingInBase = targetKeys.filter((key) => !baseSet.has(key));

  return {
    baseFlat,
    targetFlat,
    baseKeys,
    targetKeys,
    missingInTarget,
    missingInBase,
  };
}

function hasCyrillic(value) {
  return /[А-Яа-яЁё]/.test(value);
}

function hasSuspiciousPlaceholder(value) {
  return value.includes("?") || /\bTODO\b/i.test(value) || /\bTBD\b/i.test(value);
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function extractScenarioKeys(source, prefixes) {
  const keys = [];
  const prefixPattern = prefixes.map((prefix) => prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const directKey = new RegExp(`\\b(?:${prefixPattern})\\.[A-Za-z0-9_.-]+`, "g");

  for (const match of source.matchAll(directKey)) {
    keys.push(String(match[0] ?? "").trim());
  }

  for (const match of source.matchAll(/(?:tClassic|tClassicFmt|scenarioError|tDev|tDevFmt)\(\s*"([^"]+)"/g)) {
    keys.push(String(match[1] ?? "").trim());
  }

  for (const match of source.matchAll(/(?:messageKey|lastStageTextKey|resolutionNoteKey|reasonKey|errorKey)\s*:\s*"([^"]+)"/g)) {
    keys.push(String(match[1] ?? "").trim());
  }

  return uniqueSorted(keys.filter((key) => prefixes.some((prefix) => key.startsWith(`${prefix}.`))));
}

function pushDictionaryAudit(lines, title, diff, options = {}) {
  const { showEquals = false, equalsLabel = "ru equals en" } = options;
  const ruEqualToEn = diff.targetKeys
    .filter((key) => key in diff.baseFlat)
    .filter((key) => diff.targetFlat[key] === diff.baseFlat[key]);
  const enWithCyrillic = diff.baseKeys.filter((key) => hasCyrillic(diff.baseFlat[key]));
  const enSuspicious = diff.baseKeys.filter((key) => hasSuspiciousPlaceholder(diff.baseFlat[key]));

  lines.push(`## ${title} (en -> ru)`);
  lines.push(`- keys en: ${diff.baseKeys.length}`);
  lines.push(`- keys ru: ${diff.targetKeys.length}`);
  lines.push(`- missing in ru: ${diff.missingInTarget.length}`);
  lines.push(`- missing in en: ${diff.missingInBase.length}`);
  if (showEquals) lines.push(`- ${equalsLabel}: ${ruEqualToEn.length}`);
  lines.push(`- en with cyrillic: ${enWithCyrillic.length}`);
  lines.push(`- en suspicious placeholders: ${enSuspicious.length}`);
  lines.push("");

  if (diff.missingInTarget.length) {
    lines.push(`### ${title} missing in ru`);
    for (const key of diff.missingInTarget) lines.push(`- ${key}`);
    lines.push("");
  }

  if (diff.missingInBase.length) {
    lines.push(`### ${title} missing in en`);
    for (const key of diff.missingInBase) lines.push(`- ${key}`);
    lines.push("");
  }

  if (enWithCyrillic.length) {
    lines.push(`### ${title} en with cyrillic`);
    for (const key of enWithCyrillic) lines.push(`- ${key} = ${diff.baseFlat[key]}`);
    lines.push("");
  }

  if (enSuspicious.length) {
    lines.push(`### ${title} en suspicious placeholders`);
    for (const key of enSuspicious) lines.push(`- ${key} = ${diff.baseFlat[key]}`);
    lines.push("");
  }

  if (showEquals && ruEqualToEn.length) {
    lines.push(`### ${title} ${equalsLabel}`);
    for (const key of ruEqualToEn) lines.push(`- ${key} = ${diff.targetFlat[key]}`);
    lines.push("");
  }

  return {
    ruEqualToEn,
    enWithCyrillic,
    enSuspicious,
  };
}

const uiDiff = diffDictionaries(readLocaleTree(uiRoot, "en"), readLocaleTree(uiRoot, "ru"));
const cardsDiff = diffDictionaries(readJson(cardsEnPath), readJson(cardsRuPath));
const serverDiff = diffDictionaries(readJson(serverRuPath), readJson(serverEnPath));
const classicScenarioDiff = diffDictionaries(readJson(classicScenarioEnPath), readJson(classicScenarioRuPath));
const devScenarioDiff = diffDictionaries(readJson(devScenarioEnPath), readJson(devScenarioRuPath));

const uiMeta = {
  ruEqualToEn: uiDiff.targetKeys
    .filter((key) => key in uiDiff.baseFlat)
    .filter((key) => uiDiff.targetFlat[key] === uiDiff.baseFlat[key]),
  enWithCyrillic: uiDiff.baseKeys.filter((key) => hasCyrillic(uiDiff.baseFlat[key])),
  enSuspicious: uiDiff.baseKeys.filter((key) => hasSuspiciousPlaceholder(uiDiff.baseFlat[key])),
};

const cardsEnWithCyrillic = cardsDiff.baseKeys.filter((key) => hasCyrillic(cardsDiff.baseFlat[key]));
const cardsCyrillicKeyNames = cardsDiff.baseKeys.filter((key) => hasCyrillic(key));

const serverIndexSource = readText(serverIndexPath);

const serverUsedErrorKeys = Array.from(
  new Set(
    [
      ...Array.from(serverIndexSource.matchAll(/key:\s*"([^"]+)"/g), (match) =>
        String(match[1] || "").trim()
      ),
      ...Array.from(serverIndexSource.matchAll(/tServerForRoom\([^,]+,\s*"([^"]+)"/g), (match) =>
        String(match[1] || "").trim()
      ),
      ...Array.from(serverIndexSource.matchAll(/controlError\(\s*"([^"]+)"/g), (match) =>
        String(match[1] || "").trim()
      ),
    ].filter(Boolean)
  )
).filter((key) => key.startsWith("error."));

const serverUsedSet = new Set(serverUsedErrorKeys);
const serverRuSet = new Set(Object.keys(serverDiff.baseFlat).filter((key) => key.startsWith("error.")));
const serverEnSet = new Set(Object.keys(serverDiff.targetFlat).filter((key) => key.startsWith("error.")));
const serverMissingInRu = Array.from(serverUsedSet).filter((key) => !serverRuSet.has(key)).sort();
const serverMissingInEn = Array.from(serverUsedSet).filter((key) => !serverEnSet.has(key)).sort();
const serverUnusedInIndex = Array.from(serverRuSet).filter((key) => !serverUsedSet.has(key)).sort();
const serverEnWithCyrillic = Object.keys(serverDiff.targetFlat).filter((key) =>
  hasCyrillic(serverDiff.targetFlat[key])
);
const serverEnSuspicious = Object.keys(serverDiff.targetFlat).filter((key) =>
  hasSuspiciousPlaceholder(serverDiff.targetFlat[key])
);

const classicScenarioSource = readText(classicScenarioPath);
const devScenarioSource = readText(devScenarioPath);
const classicScenarioKeys = extractScenarioKeys(classicScenarioSource, ["classic", "event"]);
const devScenarioKeys = extractScenarioKeys(devScenarioSource, ["dev", "event"]);

const classicScenarioEnSet = new Set(Object.keys(classicScenarioDiff.baseFlat));
const devScenarioEnSet = new Set(Object.keys(devScenarioDiff.baseFlat));

const classicScenarioMissingInEn = classicScenarioKeys.filter((key) => !classicScenarioEnSet.has(key));
const devScenarioMissingInEn = devScenarioKeys.filter((key) => !devScenarioEnSet.has(key));
const classicScenarioUnusedInCode = Object.keys(classicScenarioDiff.baseFlat)
  .filter((key) => !classicScenarioKeys.includes(key))
  .sort();
const devScenarioUnusedInCode = Object.keys(devScenarioDiff.baseFlat)
  .filter((key) => !devScenarioKeys.includes(key))
  .sort();
const classicScenarioEnWithCyrillic = Object.keys(classicScenarioDiff.baseFlat).filter((key) =>
  hasCyrillic(classicScenarioDiff.baseFlat[key])
);
const devScenarioEnWithCyrillic = Object.keys(devScenarioDiff.baseFlat).filter((key) =>
  hasCyrillic(devScenarioDiff.baseFlat[key])
);
const classicScenarioEnSuspicious = Object.keys(classicScenarioDiff.baseFlat).filter((key) =>
  hasSuspiciousPlaceholder(classicScenarioDiff.baseFlat[key])
);
const devScenarioEnSuspicious = Object.keys(devScenarioDiff.baseFlat).filter((key) =>
  hasSuspiciousPlaceholder(devScenarioDiff.baseFlat[key])
);

const lines = [];
lines.push("# TEMP: localization open items");
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push("");

lines.push("## UI (en -> ru)");
lines.push(`- keys en: ${uiDiff.baseKeys.length}`);
lines.push(`- keys ru: ${uiDiff.targetKeys.length}`);
lines.push(`- missing in ru: ${uiDiff.missingInTarget.length}`);
lines.push(`- missing in en: ${uiDiff.missingInBase.length}`);
lines.push(`- ru equals en: ${uiMeta.ruEqualToEn.length}`);
lines.push(`- en with cyrillic: ${uiMeta.enWithCyrillic.length}`);
lines.push(`- en suspicious placeholders: ${uiMeta.enSuspicious.length}`);
lines.push("");

if (uiDiff.missingInTarget.length) {
  lines.push("### UI missing in ru");
  for (const key of uiDiff.missingInTarget) lines.push(`- ${key}`);
  lines.push("");
}

if (uiMeta.enWithCyrillic.length) {
  lines.push("### UI en with cyrillic");
  for (const key of uiMeta.enWithCyrillic) lines.push(`- ${key} = ${uiDiff.baseFlat[key]}`);
  lines.push("");
}

if (uiMeta.enSuspicious.length) {
  lines.push("### UI en suspicious placeholders");
  for (const key of uiMeta.enSuspicious) lines.push(`- ${key} = ${uiDiff.baseFlat[key]}`);
  lines.push("");
}

if (uiMeta.ruEqualToEn.length) {
  lines.push("### UI ru equals en");
  for (const key of uiMeta.ruEqualToEn) lines.push(`- ${key} = ${uiDiff.targetFlat[key]}`);
  lines.push("");
}

lines.push("## Cards (en -> ru)");
lines.push(`- keys en: ${cardsDiff.baseKeys.length}`);
lines.push(`- keys ru: ${cardsDiff.targetKeys.length}`);
lines.push(`- missing in ru: ${cardsDiff.missingInTarget.length}`);
lines.push(`- missing in en: ${cardsDiff.missingInBase.length}`);
lines.push(`- en with cyrillic value: ${cardsEnWithCyrillic.length}`);
lines.push(`- en with cyrillic key: ${cardsCyrillicKeyNames.length}`);
lines.push("");

if (cardsDiff.missingInTarget.length) {
  lines.push("### Cards missing in ru");
  for (const key of cardsDiff.missingInTarget) lines.push(`- ${key}`);
  lines.push("");
}

if (cardsDiff.missingInBase.length) {
  lines.push("### Cards missing in en");
  for (const key of cardsDiff.missingInBase) lines.push(`- ${key}`);
  lines.push("");
}

if (cardsEnWithCyrillic.length) {
  lines.push("### Cards en with cyrillic value");
  for (const key of cardsEnWithCyrillic) lines.push(`- ${key} = ${cardsDiff.baseFlat[key]}`);
  lines.push("");
}

if (cardsCyrillicKeyNames.length) {
  lines.push("### Cards en with cyrillic key");
  for (const key of cardsCyrillicKeyNames) lines.push(`- ${key}`);
  lines.push("");
}

lines.push("## Server error keys (index.ts -> locales/server)");
lines.push(`- used keys in index.ts: ${serverUsedSet.size}`);
lines.push(`- keys in locales/server/ru.json: ${serverRuSet.size}`);
lines.push(`- keys in locales/server/en.json: ${serverEnSet.size}`);
lines.push(`- missing in server ru: ${serverMissingInRu.length}`);
lines.push(`- missing in server en: ${serverMissingInEn.length}`);
lines.push(`- unused in index.ts: ${serverUnusedInIndex.length}`);
lines.push(`- en with cyrillic value: ${serverEnWithCyrillic.length}`);
lines.push(`- en suspicious placeholders: ${serverEnSuspicious.length}`);
lines.push("");

if (serverMissingInRu.length) {
  lines.push("### Server keys missing in locales/server/ru.json");
  for (const key of serverMissingInRu) lines.push(`- ${key}`);
  lines.push("");
}

if (serverMissingInEn.length) {
  lines.push("### Server keys missing in locales/server/en.json");
  for (const key of serverMissingInEn) lines.push(`- ${key}`);
  lines.push("");
}

if (serverEnWithCyrillic.length) {
  lines.push("### Server en with cyrillic value");
  for (const key of serverEnWithCyrillic) lines.push(`- ${key} = ${serverDiff.targetFlat[key]}`);
  lines.push("");
}

if (serverEnSuspicious.length) {
  lines.push("### Server en suspicious placeholders");
  for (const key of serverEnSuspicious) lines.push(`- ${key} = ${serverDiff.targetFlat[key]}`);
  lines.push("");
}

if (serverUnusedInIndex.length) {
  lines.push("### Server keys unused in index.ts");
  for (const key of serverUnusedInIndex) lines.push(`- ${key}`);
  lines.push("");
}

lines.push("## Scenario classic (classic.ts -> locales/scenario/classic)");
lines.push(`- keys in classic.ts: ${classicScenarioKeys.length}`);
lines.push(`- keys in locales/scenario/classic/en.json: ${classicScenarioDiff.baseKeys.length}`);
lines.push(`- keys in locales/scenario/classic/ru.json: ${classicScenarioDiff.targetKeys.length}`);
lines.push(`- missing in classic en: ${classicScenarioMissingInEn.length}`);
lines.push(`- missing in classic ru: ${classicScenarioDiff.missingInTarget.length}`);
lines.push(`- missing in classic en dictionary: ${classicScenarioDiff.missingInBase.length}`);
lines.push(`- unused in classic en: ${classicScenarioUnusedInCode.length}`);
lines.push(`- classic en with cyrillic: ${classicScenarioEnWithCyrillic.length}`);
lines.push(`- classic en suspicious placeholders: ${classicScenarioEnSuspicious.length}`);
lines.push("");

if (classicScenarioMissingInEn.length) {
  lines.push("### Classic scenario keys missing in locales/scenario/classic/en.json");
  for (const key of classicScenarioMissingInEn) lines.push(`- ${key}`);
  lines.push("");
}

if (classicScenarioDiff.missingInTarget.length) {
  lines.push("### Classic scenario keys missing in locales/scenario/classic/ru.json");
  for (const key of classicScenarioDiff.missingInTarget) lines.push(`- ${key}`);
  lines.push("");
}

if (classicScenarioDiff.missingInBase.length) {
  lines.push("### Classic scenario keys missing in locales/scenario/classic/en.json (present only in ru)");
  for (const key of classicScenarioDiff.missingInBase) lines.push(`- ${key}`);
  lines.push("");
}

if (classicScenarioUnusedInCode.length) {
  lines.push("### Classic scenario entries unused in code");
  for (const key of classicScenarioUnusedInCode) lines.push(`- ${key}`);
  lines.push("");
}

if (classicScenarioEnWithCyrillic.length) {
  lines.push("### Classic scenario en with cyrillic value");
  for (const key of classicScenarioEnWithCyrillic) lines.push(`- ${key} = ${classicScenarioDiff.baseFlat[key]}`);
  lines.push("");
}

if (classicScenarioEnSuspicious.length) {
  lines.push("### Classic scenario en suspicious placeholders");
  for (const key of classicScenarioEnSuspicious) lines.push(`- ${key} = ${classicScenarioDiff.baseFlat[key]}`);
  lines.push("");
}

lines.push("## Scenario dev_test (dev_test.ts -> locales/scenario/dev_test)");
lines.push(`- keys in dev_test.ts: ${devScenarioKeys.length}`);
lines.push(`- keys in locales/scenario/dev_test/en.json: ${devScenarioDiff.baseKeys.length}`);
lines.push(`- keys in locales/scenario/dev_test/ru.json: ${devScenarioDiff.targetKeys.length}`);
lines.push(`- missing in dev_test en: ${devScenarioMissingInEn.length}`);
lines.push(`- missing in dev_test ru: ${devScenarioDiff.missingInTarget.length}`);
lines.push(`- missing in dev_test en dictionary: ${devScenarioDiff.missingInBase.length}`);
lines.push(`- unused in dev_test en: ${devScenarioUnusedInCode.length}`);
lines.push(`- dev_test en with cyrillic: ${devScenarioEnWithCyrillic.length}`);
lines.push(`- dev_test en suspicious placeholders: ${devScenarioEnSuspicious.length}`);
lines.push("");

if (devScenarioMissingInEn.length) {
  lines.push("### Dev_test scenario keys missing in locales/scenario/dev_test/en.json");
  for (const key of devScenarioMissingInEn) lines.push(`- ${key}`);
  lines.push("");
}

if (devScenarioDiff.missingInTarget.length) {
  lines.push("### Dev_test scenario keys missing in locales/scenario/dev_test/ru.json");
  for (const key of devScenarioDiff.missingInTarget) lines.push(`- ${key}`);
  lines.push("");
}

if (devScenarioDiff.missingInBase.length) {
  lines.push("### Dev_test scenario keys missing in locales/scenario/dev_test/en.json (present only in ru)");
  for (const key of devScenarioDiff.missingInBase) lines.push(`- ${key}`);
  lines.push("");
}

if (devScenarioUnusedInCode.length) {
  lines.push("### Dev_test scenario entries unused in code");
  for (const key of devScenarioUnusedInCode) lines.push(`- ${key}`);
  lines.push("");
}

if (devScenarioEnWithCyrillic.length) {
  lines.push("### Dev_test scenario en with cyrillic value");
  for (const key of devScenarioEnWithCyrillic) lines.push(`- ${key} = ${devScenarioDiff.baseFlat[key]}`);
  lines.push("");
}

if (devScenarioEnSuspicious.length) {
  lines.push("### Dev_test scenario en suspicious placeholders");
  for (const key of devScenarioEnSuspicious) lines.push(`- ${key} = ${devScenarioDiff.baseFlat[key]}`);
  lines.push("");
}

fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");

console.log(`[locale-audit] report: ${path.relative(ROOT, REPORT_PATH)}`);
console.log(
  `[locale-audit] ui missing/ru=${uiDiff.missingInTarget.length}, ui ruEqualEn=${uiMeta.ruEqualToEn.length}, cards missing/ru=${cardsDiff.missingInTarget.length}`
);

if (strictMode) {
  const hasErrors =
    uiDiff.missingInTarget.length > 0 ||
    uiDiff.missingInBase.length > 0 ||
    cardsDiff.missingInTarget.length > 0 ||
    cardsDiff.missingInBase.length > 0 ||
    serverMissingInRu.length > 0 ||
    serverMissingInEn.length > 0 ||
    classicScenarioMissingInEn.length > 0 ||
    classicScenarioDiff.missingInTarget.length > 0 ||
    classicScenarioDiff.missingInBase.length > 0 ||
    devScenarioMissingInEn.length > 0 ||
    devScenarioDiff.missingInTarget.length > 0 ||
    devScenarioDiff.missingInBase.length > 0;
  if (hasErrors) {
    process.exitCode = 1;
  }
}
