import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildPortableEnv, buildPortableReadme } from "./env/portable-env.mjs";

if (process.platform !== "win32") {
  console.error("[pack:win] This script is intended to run on Windows.");
  process.exit(1);
}

const rootDir = process.cwd();
const rootPackageJsonPath = path.join(rootDir, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
const appVersion = String(rootPackage.version ?? "0.0.0").trim() || "0.0.0";
const versionTag = `v${appVersion}`;
function getArgValue(flagName) {
  const idx = process.argv.findIndex((arg) => arg === flagName);
  if (idx < 0) return null;
  const value = process.argv[idx + 1];
  if (!value || value.startsWith("--")) return null;
  return value;
}
function normalizeAssetVariant(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "1x";
  if (raw === "1x" || raw === "2x") return raw;
  throw new Error(`[pack:win] Unsupported --asset-variant value: "${value}". Supported: 1x, 2x`);
}
const fastMode = process.argv.includes("--fast");
const skipBuild = process.argv.includes("--skip-build");
const forceRepack = process.argv.includes("--force-repack");
const noArchive = process.argv.includes("--no-archive");
const baseOnlyMode = process.argv.includes("--base-only");
const fromBaseMode = process.argv.includes("--from-base");
const allVariantsMode = process.argv.includes("--all-variants");
const PRUNE_RUNTIME_NOISE = process.env.BUNKER_PACK_PRUNE_RUNTIME_NOISE !== "0";
const assetVariant = normalizeAssetVariant(getArgValue("--asset-variant"));
const assetFlavorSuffix = assetVariant === "2x" ? "-hq2x" : "";
const outRootArg = getArgValue("--out-root");
const baseDirArg = getArgValue("--base-dir");
const gitHead = (() => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return "nogit";
  return String(result.stdout ?? "").trim() || "nogit";
})();
const artifactsWinDir = outRootArg
  ? path.resolve(rootDir, outRootArg)
  : path.join(rootDir, "artifacts", "win");
const baseArtifactsDir = path.join(artifactsWinDir, ".Protocol-Bunker-base");
const clientDistSrc = path.join(rootDir, "client", "dist");
const rootIconsSrc = path.join(rootDir, "icons");
const clientPublicFaviconDir = path.join(rootDir, "client", "public", "favicon");
const clientDistIndexSrc = path.join(clientDistSrc, "index.html");
const sharedDistEntrySrc = path.join(rootDir, "shared", "dist", "index.js");
const scenariosDistEntrySrc = path.join(rootDir, "scenarios", "dist", "index.js");
const serverDistEntrySrc = path.join(rootDir, "server", "dist", "index.js");
const assetsSrc = path.join(rootDir, "assets");
const localesSrc = path.join(rootDir, "locales");
const scenariosRuntimeSrc = path.join(rootDir, "scenarios", "classic");
const nodeExeSrc = process.execPath;
const jsBuildStampPath = path.join(rootDir, ".cache", "pack-js-build-stamp.json");
const pnpmCmd = "pnpm";

function createPortablePaths(targetArtifactsDir) {
  const targetAppDir = path.join(targetArtifactsDir, "app");
  const targetServerAppDir = path.join(targetAppDir, "server");
  const targetClientDistDst = path.join(targetAppDir, "client", "dist");
  return {
    artifactsDir: targetArtifactsDir,
    appDir: targetAppDir,
    appVersionFilePath: path.join(targetAppDir, "VERSION"),
    buildStampFilePath: path.join(targetAppDir, "BUILD_STAMP.json"),
    serverAppDir: targetServerAppDir,
    clientDistDst: targetClientDistDst,
    portableClientFaviconDir: path.join(targetClientDistDst, "favicon"),
    assetsDst: path.join(targetAppDir, "assets"),
    localesDst: path.join(targetAppDir, "locales"),
    envPath: path.join(targetArtifactsDir, ".env"),
    bundledLocalesDst: path.join(
      targetServerAppDir,
      "node_modules",
      "@bunker",
      "locales"
    ),
    scenariosRuntimeDst: path.join(
      targetServerAppDir,
      "node_modules",
      "@bunker",
      "scenarios",
      "classic"
    ),
    nodeDir: path.join(targetAppDir, "node"),
    nodeExeDst: path.join(targetAppDir, "node", "node.exe"),
    startBatPath: path.join(targetArtifactsDir, "start.bat"),
    startPs1Path: path.join(targetArtifactsDir, "start-portable.ps1"),
    portableEnvPath: path.join(targetArtifactsDir, "portable.env"),
    readmePath: path.join(targetArtifactsDir, "README_PORTABLE.txt"),
  };
}

const basePaths = createPortablePaths(baseArtifactsDir);
const sourceBasePaths = createPortablePaths(
  baseDirArg ? path.resolve(rootDir, baseDirArg) : baseArtifactsDir
);

function getVariantArchiveSuffix(variant) {
  return variant === "2x" ? "-hq2x" : "";
}

function createVariantBuildTargets(variant) {
  const archiveSuffix = getVariantArchiveSuffix(variant);
  const targetArtifactsDir = path.join(artifactsWinDir, `Protocol-Bunker${archiveSuffix}`);
  return {
    variant,
    archiveSuffix,
    paths: createPortablePaths(targetArtifactsDir),
    zipPath: path.join(
      artifactsWinDir,
      `protocol-bunker-win-x64-portable${archiveSuffix}-${versionTag}.zip`
    ),
  };
}

const variantsToBuild = allVariantsMode ? ["1x", "2x"] : [assetVariant];
const variantBuildTargets = variantsToBuild.map(createVariantBuildTargets);

function quoteCmdArg(value) {
  if (value.length === 0) return '""';
  const escaped = value.replace(/"/g, '""');
  return /[\s&()^|<>]/.test(value) ? `"${escaped}"` : escaped;
}

function runStep(command, args) {
  const commandLine = [command, ...args.map(quoteCmdArg)].join(" ");
  console.log(`[pack:win] > ${commandLine}`);
  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`Command failed (${code}): ${commandLine}`);
  }
}

function runStepWithEnv(command, args, envVars) {
  const envPrefix = Object.entries(envVars)
    .map(([key, value]) => `set "${key}=${String(value)}"`)
    .join(" && ");
  const commandLine = [command, ...args.map(quoteCmdArg)].join(" ");
  const fullCommandLine = envPrefix ? `${envPrefix} && ${commandLine}` : commandLine;
  console.log(`[pack:win] > ${fullCommandLine}`);
  const result = spawnSync("cmd.exe", ["/d", "/s", "/c", fullCommandLine], {
    cwd: rootDir,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`Command failed (${code}): ${fullCommandLine}`);
  }
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runStepWithRetry(command, args, maxAttempts = 4) {
  let attempt = 1;
  while (attempt <= maxAttempts) {
    try {
      runStep(command, args);
      return;
    } catch (error) {
      const message = String(error);
      const canRetry = message.includes("EBUSY");
      if (!canRetry || attempt >= maxAttempts) {
        throw error;
      }
      console.warn(`[pack:win] Retrying after EBUSY (${attempt}/${maxAttempts})...`);
      sleepMs(800 * attempt);
      attempt += 1;
    }
  }
}

function runPowerShellCommand(script, stdio = "inherit") {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      cwd: rootDir,
      stdio,
      windowsHide: false,
    }
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const code = result.status ?? 1;
    throw new Error(`PowerShell command failed (${code}).`);
  }
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function ensureAnyMissing(pathsWithLabels) {
  const missing = [];
  for (const [targetPath, label] of pathsWithLabels) {
    if (!fs.existsSync(targetPath)) {
      missing.push(`${label}: ${targetPath}`);
    }
  }
  return missing;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function writeJsBuildStamp() {
  const stamp = {
    versionTag,
    gitHead,
    builtAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(jsBuildStampPath), { recursive: true });
  fs.writeFileSync(jsBuildStampPath, `${JSON.stringify(stamp, null, 2)}\n`, "utf8");
}

function buildPortableRuntimeStamp() {
  return {
    versionTag,
    gitHead,
    assetLayout: "shared-base-v1",
    generatedAt: new Date().toISOString(),
  };
}

function writePortableRuntimeStamp(paths) {
  writeFile(paths.appVersionFilePath, `${versionTag}\n`);
  writeFile(paths.buildStampFilePath, `${JSON.stringify(buildPortableRuntimeStamp(), null, 2)}\n`);
}

function isJsBuildReusable() {
  const required = [
    [clientDistIndexSrc, "client dist"],
    [sharedDistEntrySrc, "shared dist"],
    [scenariosDistEntrySrc, "scenarios dist"],
    [serverDistEntrySrc, "server dist"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length > 0) {
    return { ok: false, reason: `missing outputs: ${missing.join("; ")}` };
  }
  const stamp = readJsonSafe(jsBuildStampPath);
  if (!stamp) {
    return { ok: false, reason: "missing JS build stamp" };
  }
  if (stamp.versionTag !== versionTag) {
    return { ok: false, reason: `stamp version mismatch (${stamp.versionTag} != ${versionTag})` };
  }
  if (stamp.gitHead !== gitHead) {
    return { ok: false, reason: "stamp git revision mismatch" };
  }
  return { ok: true, reason: "stamp matches" };
}

function ensureJsBuildOutputsOrThrow() {
  const required = [
    [clientDistIndexSrc, "client dist"],
    [sharedDistEntrySrc, "shared dist"],
    [scenariosDistEntrySrc, "scenarios dist"],
    [serverDistEntrySrc, "server dist"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `[pack:win] --skip-build requested, but build outputs are missing. Run "pnpm run build" first.\n${missing.join(
      "\n"
    )}`
  );
}

function runPowerShellBestEffort(script) {
  return spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    }
  );
}

function releasePathLocks(targetPath, nodeExePath = portablePaths.nodeExeDst) {
  const escapedTarget = targetPath.replace(/'/g, "''");
  const escapedExe = nodeExePath.replace(/'/g, "''");
  const script = [
    `$target = '${escapedTarget}'`,
    `$portableNode = '${escapedExe}'`,
    "Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $portableNode } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }",
    "Get-Process -Name explorer -ErrorAction SilentlyContinue | Out-Null",
    "if (Test-Path -LiteralPath $target) {",
    "  attrib -R \"$target\" /S /D 2>$null | Out-Null",
    "  Get-ChildItem -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object { $_.Attributes = 'Normal' }",
    "}",
  ].join('; ');
  runPowerShellBestEffort(script);
}

function cleanPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  let lastError = undefined;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (error) {
      lastError = error;
      releasePathLocks(targetPath);
      const commandLine = `rmdir /s /q ${quoteCmdArg(targetPath)}`;
      const fallback = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
        cwd: rootDir,
        stdio: "ignore",
        windowsHide: true,
      });
      if (!fallback.error && !fs.existsSync(targetPath)) {
        return;
      }
      const escapedTarget = targetPath.replace(/'/g, "''");
      runPowerShellBestEffort(`if (Test-Path -LiteralPath '${escapedTarget}') { Remove-Item -LiteralPath '${escapedTarget}' -Recurse -Force -ErrorAction SilentlyContinue }`);
      if (!fs.existsSync(targetPath)) {
        return;
      }
      sleepMs(250 * attempt);
    }
  }
  throw lastError;
}

function copyDir(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true, force: true });
}

function copyAssetsVariant(srcAssetsRoot, dstAssetsRoot, variant) {
  const srcDecksRoot = path.join(srcAssetsRoot, "decks");
  ensureExists(srcDecksRoot, "assets/decks source");

  cleanPath(dstAssetsRoot);
  fs.mkdirSync(dstAssetsRoot, { recursive: true });

  const topLevelEntries = fs.readdirSync(srcAssetsRoot, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (entry.name === "decks") continue;
    const srcPath = path.join(srcAssetsRoot, entry.name);
    const dstPath = path.join(dstAssetsRoot, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
  }

  const variantDir = path.join(srcDecksRoot, variant);
  const dstDecksRoot = path.join(dstAssetsRoot, "decks");
  fs.mkdirSync(dstDecksRoot, { recursive: true });

  if (fs.existsSync(variantDir) && fs.statSync(variantDir).isDirectory()) {
    const variantCopyDir = path.join(dstDecksRoot, variant);
    copyDir(variantDir, variantCopyDir);
    writeFile(path.join(dstAssetsRoot, "ASSET_VARIANT"), `${variant}\n`);
    return;
  }

  throw new Error(
    `[pack:win] assets/decks must use the new layout assets/decks/<variant>/<locale>/<Deck>. Missing variant directory: ${variantDir}`
  );
}

function copySharedAssets(srcAssetsRoot, dstAssetsRoot) {
  cleanPath(dstAssetsRoot);
  fs.mkdirSync(dstAssetsRoot, { recursive: true });

  const topLevelEntries = fs.readdirSync(srcAssetsRoot, { withFileTypes: true });
  for (const entry of topLevelEntries) {
    if (entry.name === "decks") continue;
    const srcPath = path.join(srcAssetsRoot, entry.name);
    const dstPath = path.join(dstAssetsRoot, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function resolveIconsSourceDir() {
  if (fs.existsSync(rootIconsSrc)) {
    return { path: rootIconsSrc, source: "root icons/" };
  }
  if (fs.existsSync(clientPublicFaviconDir)) {
    return { path: clientPublicFaviconDir, source: "client/public/favicon (fallback)" };
  }
  throw new Error(
    `Missing icons source. Checked:\n- ${rootIconsSrc}\n- ${clientPublicFaviconDir}`
  );
}

function syncRootIconsIntoClientSource() {
  const resolved = resolveIconsSourceDir();
  if (path.resolve(resolved.path) === path.resolve(clientPublicFaviconDir)) {
    console.log(`[pack:win] Icons source: ${resolved.source}; client/public/favicon kept as-is.`);
    return;
  }
  cleanPath(clientPublicFaviconDir);
  copyDir(resolved.path, clientPublicFaviconDir);
  console.log(`[pack:win] Icons source: ${resolved.source}`);
}

function syncRootIconsIntoPortableClientDist(paths = portablePaths) {
  const resolved = resolveIconsSourceDir();
  ensureExists(paths.clientDistDst, "portable client dist directory");
  cleanPath(paths.portableClientFaviconDir);
  copyDir(resolved.path, paths.portableClientFaviconDir);
}

function removeLinuxShellScripts(root) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".sh")) {
        fs.rmSync(fullPath, { force: true });
      }
    }
  }
}

function materializeDirectory(sourceDir) {
  const materializedDir = path.join(
    os.tmpdir(),
    `bunker-portable-materialized-${Date.now()}-${process.pid}`
  );
  fs.cpSync(sourceDir, materializedDir, {
    recursive: true,
    force: true,
    dereference: true,
  });
  cleanPath(sourceDir);
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.cpSync(materializedDir, sourceDir, { recursive: true, force: true });
  try {
    cleanPath(materializedDir);
  } catch {
    // best effort cleanup for temporary materialized folder
  }
}

function flattenNodeModules(rootDir) {
  const nodeModulesDir = path.join(rootDir, "node_modules");
  const pnpmVirtualDir = path.join(nodeModulesDir, ".pnpm", "node_modules");
  if (!fs.existsSync(pnpmVirtualDir)) {
    return;
  }
  const entries = fs.readdirSync(pnpmVirtualDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = path.join(pnpmVirtualDir, entry.name);
    const dst = path.join(nodeModulesDir, entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(src, dst, { recursive: true, force: true, dereference: true });
  }
}

function pruneRuntimeNoise(rootDir) {
  if (!PRUNE_RUNTIME_NOISE) return;
  const nodeModulesDir = path.join(rootDir, "node_modules");
  if (!fs.existsSync(nodeModulesDir)) return;

  const removableFileRe = /(?:\.d\.ts|\.d\.cts|\.d\.mts|\.ts|\.tsx|\.map)$/i;
  const envFileRe = /^\.env(?:\..+)?$/i;
  const keepFileRe = /(?:^|[/\\])esbuild[/\\].+\.js\.map$/i;
  let removed = 0;
  const stack = [nodeModulesDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (envFileRe.test(entry.name)) {
        fs.rmSync(fullPath, { force: true });
        removed += 1;
        continue;
      }
      if (!removableFileRe.test(entry.name)) continue;
      if (keepFileRe.test(fullPath)) continue;
      fs.rmSync(fullPath, { force: true });
      removed += 1;
    }
  }

  console.log(`[pack:win] Pruned runtime-noise files from node_modules: ${removed}`);
}

function stopRunningPortableServer(nodeExePath) {
  if (!nodeExePath) return;
  const escapedExe = nodeExePath.replace(/'/g, "''");
  const script = [
    `$exe = '${escapedExe}'`,
    "Get-Process -Name node -ErrorAction SilentlyContinue |",
    "Where-Object { $_.Path -eq $exe } |",
    "ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
    }
  );
  if (result.error) {
    throw result.error;
  }
}

function stopKnownPortableServers() {
  for (const target of variantBuildTargets) {
    stopRunningPortableServer(target.paths.nodeExeDst);
  }
  stopRunningPortableServer(basePaths.nodeExeDst);
}

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const fractionDigits = unitIndex === 0 ? 0 : 2;
  return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

function startTimer() {
  return process.hrtime.bigint();
}

function formatDurationMs(ms) {
  if (ms < 1000) return `${ms} ms`;
  const seconds = (ms / 1000).toFixed(2);
  return `${seconds} s`;
}

function logDuration(label, startedAt) {
  const elapsedMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
  console.log(`[pack:win] ${label}: ${formatDurationMs(elapsedMs)}`);
  return elapsedMs;
}

function find7ZipExecutable() {
  const candidates = [
    "7z",
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-h"], {
      cwd: rootDir,
      stdio: "ignore",
      windowsHide: true,
      shell: false,
    });
    if (!result.error && typeof result.status === "number" && result.status <= 2) {
      return candidate;
    }
  }

  return null;
}

function archivePortableVariant(paths, targetZipPath) {
  if (fs.existsSync(targetZipPath)) {
    fs.rmSync(targetZipPath, { force: true });
  }

  const sevenZip = find7ZipExecutable();
  if (sevenZip) {
    const sourceParent = path.dirname(paths.artifactsDir);
    const sourceName = path.basename(paths.artifactsDir);
    console.log(`[pack:win] Using 7-Zip backend: ${sevenZip}`);
    const result = spawnSync(
      sevenZip,
      ["a", "-tzip", "-mx=1", targetZipPath, sourceName],
      {
        cwd: sourceParent,
        stdio: "inherit",
        windowsHide: true,
      }
    );
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`7-Zip failed (${result.status}): ${paths.artifactsDir} -> ${targetZipPath}`);
    }
  } else {
    console.log("[pack:win] 7-Zip not found, falling back to Compress-Archive.");
    const src = paths.artifactsDir.replace(/'/g, "''");
    const dst = targetZipPath.replace(/'/g, "''");
    const script = [
      `$src = '${src}'`,
      `$dst = '${dst}'`,
      "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
      "Compress-Archive -Path $src -DestinationPath $dst -Force",
    ].join("; ");
    runPowerShellCommand(script, "inherit");
  }

  ensureExists(targetZipPath, "portable zip");
  const stats = fs.statSync(targetZipPath);
  console.log(`[pack:win] ZIP created: ${targetZipPath}`);
  console.log(`[pack:win] ZIP size: ${formatBytes(stats.size)}`);
}

function isPortableBaseReusable(paths = basePaths, options = {}) {
  const { ignoreForceRepack = false } = options;
  if (forceRepack && !ignoreForceRepack) {
    return { ok: false, reason: "--force-repack set" };
  }
  const versionValue = readTextSafe(paths.appVersionFilePath);
  if (versionValue !== versionTag) {
    return { ok: false, reason: `app/VERSION mismatch (${versionValue || "empty"} != ${versionTag})` };
  }
  const runtimeStamp = readJsonSafe(paths.buildStampFilePath);
  if (!runtimeStamp) {
    return { ok: false, reason: "missing runtime build stamp" };
  }
  if (runtimeStamp.versionTag !== versionTag) {
    return {
      ok: false,
      reason: `runtime stamp version mismatch (${runtimeStamp.versionTag || "empty"} != ${versionTag})`,
    };
  }
  if (runtimeStamp.gitHead !== gitHead) {
    return { ok: false, reason: "runtime stamp git revision mismatch" };
  }
  if (runtimeStamp.assetLayout !== "shared-base-v1") {
    return { ok: false, reason: "runtime stamp asset layout mismatch" };
  }
  const required = [
    [path.join(paths.serverAppDir, "dist", "index.js"), "server dist entry"],
    [path.join(paths.appDir, "client", "dist", "index.html"), "client dist index"],
    [path.join(paths.appDir, "assets"), "assets"],
    [paths.nodeExeDst, "node runtime"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length > 0) {
    return { ok: false, reason: `missing runtime files: ${missing.join("; ")}` };
  }
  return { ok: true, reason: "portable base version and files are valid" };
}

function buildStartBat() {
  return `@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if not exist "logs" mkdir "logs"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-portable.ps1"
set "EXITCODE=%ERRORLEVEL%"
echo.
echo Server stopped.
if not "%EXITCODE%"=="0" echo Exit code: %EXITCODE%
pause
endlocal & exit /b %EXITCODE%
`;
}

function buildStartPs1() {
  return `$ErrorActionPreference = "Stop"

[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$portableRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$appRoot = Join-Path $portableRoot "app"
$logsDir = Join-Path $portableRoot "logs"
$envFile = Join-Path $portableRoot ".env"
$portableEnvFile = Join-Path $portableRoot "portable.env"

$nodeExe = Join-Path $appRoot "node\\node.exe"
$serverRoot = Join-Path $appRoot "server"
$serverEntry = Join-Path $serverRoot "dist\\index.js"
$clientDist = Join-Path $appRoot "client\\dist"
$clientIndex = Join-Path $clientDist "index.html"
$assetsRoot = Join-Path $appRoot "assets"
$overlayRoot = Join-Path $serverRoot "public\\overlay"

$serverLogFile = Join-Path $logsDir "server.log"
$portFile = Join-Path $logsDir "port.txt"
$urlsFile = Join-Path $logsDir "urls.txt"
$lastStartFile = Join-Path $logsDir "last-start.txt"

$script:detectedPort = $null
$script:browserOpened = $false
$script:selectedPort = 0
$script:lanIp = "127.0.0.1"
$script:publicIp = $null
$script:publicHost = $null
$script:publicOrigin = $null
$script:mode = "local"
$script:domain = $null
$script:openUrl = $null

function Assert-Exists {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $PathValue)) {
    throw "Missing \${Label}: $PathValue"
  }
}

function Read-PortableEnv {
  param([Parameter(Mandatory = $true)][string]$PathValue)
  $result = @{}
  if (-not (Test-Path -LiteralPath $PathValue)) {
    return $result
  }
  try {
    $lines = Get-Content -LiteralPath $PathValue -ErrorAction Stop
  } catch {
    Write-Host ("Config file unreadable: {0}. Using defaults: PORT=0 DEV_MODE=0." -f $PathValue)
    return $result
  }
  foreach ($rawLine in $lines) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    if ($line.StartsWith("#") -or $line.StartsWith(";")) { continue }
    $eqIndex = $line.IndexOf("=")
    if ($eqIndex -lt 1) { continue }
    $key = $line.Substring(0, $eqIndex).Trim().ToUpperInvariant()
    $value = $line.Substring($eqIndex + 1).Trim()
    $commentIndex = $value.IndexOf(" #")
    if ($commentIndex -ge 0) {
      $value = $value.Substring(0, $commentIndex).Trim()
    }
    if (-not [string]::IsNullOrWhiteSpace($key)) {
      $result[$key] = $value
    }
  }
  return $result
}

function Read-PortableConfig {
  $portableConfig = Read-PortableEnv -PathValue $portableEnvFile
  if ($portableConfig.Count -gt 0) {
    return $portableConfig
  }
  return Read-PortableEnv -PathValue $envFile
}

function Apply-BunkerEnvOverrides {
  param([hashtable]$Config)
  foreach ($entry in $Config.GetEnumerator()) {
    $key = [string]$entry.Key
    if (-not $key.StartsWith("BUNKER_")) { continue }
    $value = [string]$entry.Value
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Get-ConfigPort {
  param([hashtable]$Config)
  $rawPort = if ($Config.ContainsKey("PORT")) { [string]$Config["PORT"] } else { "" }
  if ([string]::IsNullOrWhiteSpace($rawPort)) {
    return 0
  }
  $port = 0
  if (-not [int]::TryParse($rawPort, [ref]$port)) {
    Write-Host ("Invalid PORT in portable.env: '{0}'. Using PORT=0." -f $rawPort)
    return 0
  }
  if ($port -lt 0 -or $port -gt 65535) {
    Write-Host ("Invalid PORT in portable.env: '{0}'. Using PORT=0." -f $rawPort)
    return 0
  }
  return $port
}

function Get-ConfigDevMode {
  param([hashtable]$Config)
  $raw = if ($Config.ContainsKey("DEV_MODE")) { [string]$Config["DEV_MODE"] } else { "" }
  if ([string]::IsNullOrWhiteSpace($raw)) { return $false }
  $value = $raw.Trim().ToLowerInvariant()
  return $value -in @("1", "true", "yes", "on")
}

function Get-ConfigTrustProxy {
  param([hashtable]$Config, [string]$Mode)
  $raw = if ($Config.ContainsKey("TRUST_PROXY")) { [string]$Config["TRUST_PROXY"] } else { "auto" }
  $value = $raw.Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($value) -or $value -eq "auto") {
    if ($Mode -eq "domain") { return "true" }
    return "false"
  }
  if ($value -in @("1", "true", "yes", "on")) { return "true" }
  return "false"
}

function Get-ConfigText {
  param([hashtable]$Config, [string]$Key)
  if (-not $Config.ContainsKey($Key)) { return "" }
  return ([string]$Config[$Key]).Trim()
}

function Resolve-Mode {
  param([hashtable]$Config)
  $modeRaw = if ($Config.ContainsKey("MODE")) { [string]$Config["MODE"] } else { "" }
  $mode = $modeRaw.Trim().ToLowerInvariant()
  if ($mode -eq "local" -or $mode -eq "1") { return "local" }
  if ($mode -eq "domain" -or $mode -eq "2") { return "domain" }

  Write-Host "============================================"
  Write-Host "Protocol: Bunker Portable Launcher (PowerShell)"
  Write-Host "============================================"
  Write-Host "1) Local (HTTP) - IP:PORT"
  Write-Host "2) Domain (HTTPS) - reverse-proxy"
  Write-Host ""

  $choice = Read-Host "Choose mode [1-2]"
  if ($choice -eq "1") { return "local" }
  if ($choice -eq "2") { return "domain" }
  throw "Invalid mode selection."
}

function Resolve-Domain {
  param([hashtable]$Config)
  $domain = if ($Config.ContainsKey("DOMAIN")) { [string]$Config["DOMAIN"] } else { "" }
  $domain = $domain.Trim()
  if ([string]::IsNullOrWhiteSpace($domain)) {
    $domain = Read-Host "Enter domain (e.g. bunker.example.com)"
  }
  if ([string]::IsNullOrWhiteSpace($domain)) {
    $domain = "example.com"
  }
  return $domain
}

function Get-PublicIp {
  try {
    $ip = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5
    if (-not [string]::IsNullOrWhiteSpace([string]$ip)) {
      return [string]$ip
    }
  } catch {
    # ignore
  }
  try {
    $ip = Invoke-RestMethod -Uri "https://ifconfig.me/ip" -TimeoutSec 5
    if (-not [string]::IsNullOrWhiteSpace([string]$ip)) {
      return [string]$ip
    }
  } catch {
    # ignore
  }
  return $null
}

function Test-PrivateIPv4 {
  param([Parameter(Mandatory = $true)][string]$Ip)
  return (
    $Ip -like "10.*" -or
    $Ip -like "192.168.*" -or
    $Ip -match "^172\\.(1[6-9]|2[0-9]|3[0-1])\\."
  )
}

function Test-PreferredAdapterAlias {
  param([string]$Alias)
  if ([string]::IsNullOrWhiteSpace($Alias)) { return $true }
  $name = $Alias.ToLowerInvariant()
  $blocked = @(
    "nekobox", "vpn", "wintun", "wireguard", "tun", "tap", "openvpn", "clash", "warp",
    "vethernet", "hyper-v", "vmware", "virtual", "loopback", "docker", "podman", "wsl",
    "tailscale", "zerotier", "hamachi", "isatap", "teredo"
  )
  foreach ($token in $blocked) {
    if ($name -like "*$token*") {
      return $false
    }
  }
  return $true
}

function Get-LanIPv4 {
  try {
    $candidates = New-Object System.Collections.Generic.List[object]
    $configs = Get-NetIPConfiguration -ErrorAction Stop |
      Where-Object { $_.IPv4Address -and $_.IPv4Address.IPAddress }

    foreach ($cfg in $configs) {
      $ip = [string]$cfg.IPv4Address.IPAddress
      if ([string]::IsNullOrWhiteSpace($ip)) { continue }
      if ($ip -like "127.*" -or $ip -like "169.254.*" -or $ip -eq "0.0.0.0") { continue }

      $isPrivate = Test-PrivateIPv4 -Ip $ip
      $preferredAlias = Test-PreferredAdapterAlias -Alias ([string]$cfg.InterfaceAlias)
      $hasGateway = $null -ne $cfg.IPv4DefaultGateway

      $score = 0
      if ($isPrivate) { $score += 100 }
      if ($preferredAlias) { $score += 20 }
      if ($hasGateway) { $score += 10 }

      $candidates.Add([PSCustomObject]@{
        Ip = $ip
        Score = $score
      }) | Out-Null
    }

    if ($candidates.Count -gt 0) {
      return ($candidates | Sort-Object -Property Score -Descending | Select-Object -First 1).Ip
    }
  } catch {
    # ignore
  }
  return "127.0.0.1"
}

function Test-PortBusy {
  param([Parameter(Mandatory = $true)][int]$Port)
  if ($Port -le 0) { return $false }

  try {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
      $connections = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
      if ($connections) {
        return $true
      }
    }
  } catch {
    # ignore
  }

  $tcpClient = $null
  try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $async = $tcpClient.BeginConnect("127.0.0.1", $Port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(300)
    if ($connected) {
      try {
        $tcpClient.EndConnect($async) | Out-Null
      } catch {
        # ignore
      }
      return $true
    }
  } catch {
    # ignore
  } finally {
    if ($tcpClient) {
      $tcpClient.Dispose()
    }
  }

  return $false
}

function Wait-PortOpen {
  param([Parameter(Mandatory = $true)][int]$Port, [int]$TimeoutSeconds = 10)
  if ($Port -le 0) { return $false }
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
      if ($async.AsyncWaitHandle.WaitOne(250)) {
        $client.EndConnect($async) | Out-Null
        $client.Dispose()
        return $true
      }
      $client.Dispose()
    } catch {
      # ignore
    }
    Start-Sleep -Milliseconds 200
  }
  return $false
}

function Try-ExtractPort {
  param([Parameter(Mandatory = $true)][string]$Line)

  $marker = [System.Text.RegularExpressions.Regex]::Match($Line, "__BUNKER_PORT__=(\\d{1,5})")
  if ($marker.Success) {
    return [int]$marker.Groups[1].Value
  }

  $urlMatch = [System.Text.RegularExpressions.Regex]::Match($Line, "https?://\\S+:(\\d{2,5})(?:/|$)")
  if ($urlMatch.Success) {
    return [int]$urlMatch.Groups[1].Value
  }

  $keywordMatch = [System.Text.RegularExpressions.Regex]::Match(
    $Line,
    "(?i)(?:port|listening|127\\.0\\.0\\.1|0\\.0\\.0\\.0|localhost)[^0-9]{0,20}(\\d{2,5})"
  )
  if ($keywordMatch.Success) {
    return [int]$keywordMatch.Groups[1].Value
  }

  $fallback = [System.Text.RegularExpressions.Regex]::Match($Line, ":(\\d{2,5})(?:\\b|/)")
  if ($fallback.Success) {
    return [int]$fallback.Groups[1].Value
  }

  return $null
}

function Save-PortAndUrls {
  param([Parameter(Mandatory = $true)][int]$Port)
  if ($script:detectedPort) { return }

  $script:detectedPort = $Port
  Set-Content -LiteralPath $portFile -Value "$Port" -Encoding ASCII

  if ($script:mode -eq "domain") {
    $openUrl = "https://$script:domain"
    $upstream = "http://127.0.0.1:$Port"
    $script:openUrl = $openUrl
    $lines = @(
      ("Open: {0}" -f $openUrl),
      ("Upstream: {0}" -f $upstream)
    )
    Set-Content -LiteralPath $urlsFile -Value $lines -Encoding UTF8

    Write-Host ""
    Write-Host ("Open: {0}" -f $openUrl) -ForegroundColor Cyan
    Write-Host ("Upstream: {0}" -f $upstream) -ForegroundColor Cyan
    Write-Host ""
  } else {
    $localhostUrl = "http://127.0.0.1:$Port"
    $lanUrl = "http://{0}:{1}" -f $script:lanIp, $Port
    $publicUrl = if (-not [string]::IsNullOrWhiteSpace($script:publicOrigin)) {
      $script:publicOrigin
    } elseif (-not [string]::IsNullOrWhiteSpace($script:publicHost)) {
      if ($script:publicHost -match "^https?://") {
        $script:publicHost
      } else {
        "http://{0}:{1}" -f $script:publicHost, $Port
      }
    } elseif ([string]::IsNullOrWhiteSpace($script:publicIp)) {
      "unavailable"
    } else {
      "http://{0}:{1}" -f $script:publicIp, $Port
    }
    $script:openUrl = $lanUrl
    $lines = @(
      ("Public: {0}" -f $publicUrl),
      ("Local : {0}" -f $lanUrl),
      ("Localhost: {0}" -f $localhostUrl)
    )
    Set-Content -LiteralPath $urlsFile -Value $lines -Encoding UTF8

    Write-Host ""
    Write-Host ("Public: {0}" -f $publicUrl) -ForegroundColor Cyan
    Write-Host ("Local : {0}" -f $lanUrl) -ForegroundColor Cyan
    Write-Host ("Localhost: {0}" -f $localhostUrl) -ForegroundColor Cyan
    Write-Host ""
  }

  Write-Host "Port saved to logs/port.txt"
  Write-Host ""

  if ($env:BUNKER_PORTABLE_NO_BROWSER -ne "1" -and -not $script:browserOpened -and $script:openUrl) {
    Start-Process -FilePath $script:openUrl | Out-Null
    $script:browserOpened = $true
  }
}

function Process-ServerLine {
  param([Parameter(Mandatory = $true)][string]$Line)
  if ([string]::IsNullOrWhiteSpace($Line)) { return }

  if (-not $script:detectedPort) {
    $port = Try-ExtractPort -Line $Line
    if ($port -and $port -gt 0 -and $port -le 65535) {
      Save-PortAndUrls -Port $port
      return
    }
    if ($script:selectedPort -gt 0 -and $Line -match "(?i)server listening|listening on|listening at") {
      Save-PortAndUrls -Port $script:selectedPort
    }
  }
}

function Apply-DevMode {
  param([bool]$DevMode)

  $env:BUNKER_ENABLE_DEV_SCENARIOS = if ($DevMode) { "true" } else { "false" }
  if ($DevMode) {
    $env:BUNKER_IDENTITY_MODE = "dev_tab"
    $env:BUNKER_DEV_LOGS = "true"
    $env:VITE_IDENTITY_MODE = "dev_tab"
    $env:DEV_NEW_PLAYER_PER_TAB = "true"
    $env:VITE_DEV_TAB_IDENTITY = "true"
    $env:VITE_DEV_NEW_PLAYER_PER_TAB = "true"
  } else {
    $env:BUNKER_IDENTITY_MODE = "prod"
    $env:BUNKER_DEV_LOGS = "false"
    $env:VITE_IDENTITY_MODE = "prod"
    $env:DEV_NEW_PLAYER_PER_TAB = "false"
    $env:VITE_DEV_TAB_IDENTITY = "false"
    $env:VITE_DEV_NEW_PLAYER_PER_TAB = "false"
  }
}

Assert-Exists -PathValue $nodeExe -Label "Node runtime"
Assert-Exists -PathValue $serverEntry -Label "server entrypoint"
Assert-Exists -PathValue $clientIndex -Label "client dist"
Assert-Exists -PathValue $assetsRoot -Label "assets directory"
Assert-Exists -PathValue $overlayRoot -Label "overlay assets directory"

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
foreach ($f in @($serverLogFile, $portFile, $urlsFile)) {
  if (Test-Path -LiteralPath $f) {
    Remove-Item -LiteralPath $f -Force
  }
}
Set-Content -LiteralPath $lastStartFile -Value (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz") -Encoding UTF8
New-Item -ItemType File -Path $serverLogFile -Force | Out-Null

  $portableConfig = Read-PortableConfig
$script:selectedPort = Get-ConfigPort -Config $portableConfig
$devMode = Get-ConfigDevMode -Config $portableConfig
$script:mode = Resolve-Mode -Config $portableConfig

if ($script:mode -eq "domain") {
  if ($script:selectedPort -eq 0) {
    Write-Host "Domain mode requires fixed PORT. Set PORT=xxxx in portable.env"
    exit 1
  }
  $script:domain = Resolve-Domain -Config $portableConfig
}

if ($script:selectedPort -gt 0 -and (Test-PortBusy -Port $script:selectedPort)) {
  Write-Host ("PORT {0} is busy. Change PORT in portable.env or set PORT=0 for auto." -f $script:selectedPort)
  exit 1
}

$env:PORT = "$script:selectedPort"
Apply-BunkerEnvOverrides -Config $portableConfig
$env:BUNKER_SERVE_CLIENT = "true"
$env:BUNKER_PORTABLE = "1"
$env:BUNKER_ASSETS_ROOT = $assetsRoot
$env:BUNKER_CLIENT_DIST = $clientDist
$env:BUNKER_OVERLAY_PUBLIC_ROOT = $overlayRoot
$env:BUNKER_ASSET_VARIANT = "${assetVariant}"

if ($script:mode -eq "domain") {
  $env:HOST = "127.0.0.1"
  $env:TRUST_PROXY = Get-ConfigTrustProxy -Config $portableConfig -Mode $script:mode
  $env:PUBLIC_ORIGIN = "https://$script:domain"
  Remove-Item Env:PUBLIC_HOST -ErrorAction SilentlyContinue
  Remove-Item Env:BUNKER_PUBLIC_HOST -ErrorAction SilentlyContinue
} else {
  $env:HOST = "0.0.0.0"
  $env:TRUST_PROXY = Get-ConfigTrustProxy -Config $portableConfig -Mode $script:mode
  $script:publicOrigin = Get-ConfigText -Config $portableConfig -Key "PUBLIC_ORIGIN"
  $script:publicHost = Get-ConfigText -Config $portableConfig -Key "PUBLIC_HOST"
  if (-not [string]::IsNullOrWhiteSpace($script:publicOrigin)) {
    $env:PUBLIC_ORIGIN = $script:publicOrigin
  } else {
    Remove-Item Env:PUBLIC_ORIGIN -ErrorAction SilentlyContinue
  }
  if (-not [string]::IsNullOrWhiteSpace($script:publicHost)) {
    $env:PUBLIC_HOST = $script:publicHost
    $env:BUNKER_PUBLIC_HOST = $script:publicHost
  } else {
    Remove-Item Env:PUBLIC_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:BUNKER_PUBLIC_HOST -ErrorAction SilentlyContinue
  }
}
Apply-DevMode -DevMode:$devMode

$script:lanIp = Get-LanIPv4
$script:publicIp = if ($script:mode -eq "local") { Get-PublicIp } else { $null }

Write-Host "Starting Protocol Bunker server..."
Write-Host ("Mode: {0}" -f $script:mode.ToUpperInvariant())
if ($devMode) {
  Write-Host "Identity: DEV_MODE=1"
}
if ($script:selectedPort -eq 0) {
  Write-Host "Port mode: auto (PORT=0 from portable.env)"
} else {
  Write-Host ("Port mode: fixed ({0}) from portable.env" -f $script:selectedPort)
}
Write-Host "Log file: logs/server.log"
Write-Host "Press Ctrl+C to stop."

$exitCode = 0
$previousErrorActionPreference = $ErrorActionPreference
Push-Location -LiteralPath $serverRoot
try {
  $ErrorActionPreference = "Continue"
  & $nodeExe $serverEntry 2>&1 |
    Tee-Object -FilePath $serverLogFile -Append |
    ForEach-Object {
      $line = [string]$_
      Write-Host $line
      Process-ServerLine -Line $line
    }
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
  $ErrorActionPreference = $previousErrorActionPreference
}

if (-not $script:detectedPort -and $script:selectedPort -gt 0 -and (Wait-PortOpen -Port $script:selectedPort -TimeoutSeconds 1)) {
  Save-PortAndUrls -Port $script:selectedPort
}

if ($exitCode -ne 0) {
  throw "Server exited with code $exitCode. See logs/server.log"
}
`;
}

function buildReadme() {
  return buildPortableReadme({ platform: "win" });
}

function preparePortableBase(paths) {
  console.log("[pack:win] Preparing portable base...");
  stopKnownPortableServers();
  const portableBaseReuse = isPortableBaseReusable(paths);
  const shouldReusePortableBase = portableBaseReuse.ok;
  if (shouldReusePortableBase) {
    console.log(`[pack:win] Reusing existing portable base: ${portableBaseReuse.reason}`);
    fs.mkdirSync(paths.appDir, { recursive: true });
    return;
  }

  console.log(`[pack:win] Building portable base: ${portableBaseReuse.reason}`);
  cleanPath(paths.artifactsDir);
  fs.mkdirSync(paths.appDir, { recursive: true });

  console.log("[pack:win] Deploying server runtime...");
  runStepWithRetry(pnpmCmd, ["--filter", "@bunker/server", "deploy", "--prod", paths.serverAppDir]);

  const serverPrune = ["src", "tsconfig.json", "tsconfig.build.json", ".env", ".env.example"];
  for (const relPath of serverPrune) {
    cleanPath(path.join(paths.serverAppDir, relPath));
  }

  console.log("[pack:win] Materializing server runtime links...");
  materializeDirectory(paths.serverAppDir);
  flattenNodeModules(paths.serverAppDir);

  console.log("[pack:win] Copying Node runtime...");
  ensureExists(nodeExeSrc, "node runtime source");
  fs.mkdirSync(paths.nodeDir, { recursive: true });
  fs.copyFileSync(nodeExeSrc, paths.nodeExeDst);

  console.log("[pack:win] Copying client dist, assets and locales...");
  ensureExists(clientDistSrc, "client dist source");
  ensureExists(assetsSrc, "assets source");
  ensureExists(localesSrc, "locales source");
  copyDir(clientDistSrc, paths.clientDistDst);
  copySharedAssets(assetsSrc, paths.assetsDst);
  copyDir(localesSrc, paths.localesDst);
  copyDir(localesSrc, paths.bundledLocalesDst);

  console.log("[pack:win] Copying scenario runtime data...");
  ensureExists(scenariosRuntimeSrc, "scenarios runtime source");
  copyDir(scenariosRuntimeSrc, paths.scenariosRuntimeDst);
  pruneRuntimeNoise(paths.serverAppDir);
  writePortableRuntimeStamp(paths);
}

function writePortableLaunchFiles(paths = portablePaths) {
  console.log("[pack:win] Writing launch files...");
  syncRootIconsIntoPortableClientDist(paths);
  writeFile(paths.startBatPath, buildStartBat());
  writeFile(paths.startPs1Path, buildStartPs1());
  writeFile(paths.portableEnvPath, buildPortableEnv({ platform: "win" }));
  writeFile(paths.readmePath, buildReadme());
  writePortableRuntimeStamp(paths);
}

function createPortableVariantFromBase(baseRuntimePaths, targetPaths, variant) {
  console.log(`[pack:win] Materializing variant from base (${variant})...`);
  cleanPath(targetPaths.artifactsDir);
  copyDir(baseRuntimePaths.artifactsDir, targetPaths.artifactsDir);
  copyAssetsVariant(assetsSrc, targetPaths.assetsDst, variant);
  writePortableLaunchFiles(targetPaths);
}

function validatePortableVariant(paths) {
  ensureExists(paths.startBatPath, "start.bat");
  ensureExists(paths.startPs1Path, "start-portable.ps1");
  ensureExists(paths.portableEnvPath, "portable.env");
  ensureExists(path.join(paths.serverAppDir, "dist", "index.js"), "server dist entry");
  ensureExists(path.join(paths.appDir, "client", "dist", "index.html"), "client dist index");
  ensureExists(path.join(paths.appDir, "locales", "ui", "app", "ru.json"), "locales/ui/app/ru.json");
  ensureExists(path.join(paths.appDir, "locales", "ui", "app", "en.json"), "locales/ui/app/en.json");
  ensureExists(paths.appVersionFilePath, "app VERSION");
  ensureExists(paths.nodeExeDst, "node runtime");
  ensureExists(
    path.join(paths.serverAppDir, "node_modules", "@bunker", "locales", "logic", "targeting", "ru.json"),
    "@bunker/locales/logic/targeting/ru.json"
  );
  ensureExists(
    path.join(paths.serverAppDir, "node_modules", "@bunker", "locales", "logic", "targeting", "en.json"),
    "@bunker/locales/logic/targeting/en.json"
  );
}

function main() {
  const totalStartedAt = startTimer();
  const prodClientEnv = {
    VITE_IDENTITY_MODE: "prod",
    VITE_DEV_TAB_IDENTITY: "false",
    VITE_DEV_NEW_PLAYER_PER_TAB: "false",
  };
  console.log(`[pack:win] Building version: ${versionTag}`);
  if (baseOnlyMode) {
    console.log("[pack:win] Mode: base-only");
  } else if (fromBaseMode) {
    console.log("[pack:win] Mode: from-base");
    console.log(`[pack:win] Base dir: ${sourceBasePaths.artifactsDir}`);
  }
  if (allVariantsMode) {
    console.log("[pack:win] Assets variant mode: all variants (1x + 2x)");
  } else {
    console.log(`[pack:win] Assets variant: ${assetVariant} (archive suffix: ${assetFlavorSuffix || "none"})`);
  }
  console.log("[pack:win] Syncing icons...");
  syncRootIconsIntoClientSource();
  if (skipBuild) {
    console.log("[pack:win] Skipping package builds (--skip-build).");
    if (!fromBaseMode) {
      ensureJsBuildOutputsOrThrow();
    }
  } else if (fastMode) {
    const buildStartedAt = startTimer();
    const reuse = isJsBuildReusable();
    if (reuse.ok) {
      console.log(`[pack:win] Reusing JS build outputs (--fast): ${reuse.reason}`);
    } else {
      console.log(`[pack:win] --fast fallback to build: ${reuse.reason}`);
      runStepWithEnv(pnpmCmd, ["-C", "client", "build"], prodClientEnv);
      runStep(pnpmCmd, ["-C", "shared", "build"]);
      runStep(pnpmCmd, ["-C", "scenarios", "build"]);
      runStep(pnpmCmd, ["-C", "server", "build"]);
      writeJsBuildStamp();
    }
    logDuration("JS build stage", buildStartedAt);
  } else {
    const buildStartedAt = startTimer();
    console.log("[pack:win] Building production artifacts...");
    runStepWithEnv(pnpmCmd, ["-C", "client", "build"], prodClientEnv);
    runStep(pnpmCmd, ["-C", "shared", "build"]);
    runStep(pnpmCmd, ["-C", "scenarios", "build"]);
    runStep(pnpmCmd, ["-C", "server", "build"]);
    writeJsBuildStamp();
    logDuration("JS build stage", buildStartedAt);
  }

  const baseStartedAt = startTimer();
  if (fromBaseMode) {
    const reuse = isPortableBaseReusable(sourceBasePaths, { ignoreForceRepack: true });
    if (!reuse.ok) {
      throw new Error(`[pack:win] Provided base directory is not reusable: ${reuse.reason}`);
    }
  } else {
    preparePortableBase(basePaths);
  }
  logDuration("Portable base stage", baseStartedAt);

  if (baseOnlyMode) {
    console.log("[pack:win] Base-only mode complete.");
    console.log(` - ${basePaths.artifactsDir}`);
    logDuration("Total pack time", totalStartedAt);
    return;
  }

  const runtimeBasePaths = fromBaseMode ? sourceBasePaths : basePaths;

  console.log("[pack:win] Created files:");
  for (const target of variantBuildTargets) {
    const variantStartedAt = startTimer();
    createPortableVariantFromBase(runtimeBasePaths, target.paths, target.variant);
    logDuration(`Variant materialization stage (${target.variant})`, variantStartedAt);

    console.log(`[pack:win] Removing Linux shell scripts for ${target.variant}...`);
    removeLinuxShellScripts(target.paths.artifactsDir);

    const validateStartedAt = startTimer();
    validatePortableVariant(target.paths);
    logDuration(`Validation stage (${target.variant})`, validateStartedAt);

    if (noArchive) {
      console.log(`[pack:win] --no-archive set, skipping ZIP creation for ${target.variant}.`);
    } else {
      console.log(`[pack:win] Creating ZIP archive for ${target.variant}...`);
      const archiveStartedAt = startTimer();
      archivePortableVariant(target.paths, target.zipPath);
      logDuration(`Archive stage (${target.variant})`, archiveStartedAt);
      console.log(` - ${target.zipPath}`);
    }
    console.log(` - ${target.paths.artifactsDir}`);
  }
  logDuration("Total pack time", totalStartedAt);
  console.log(`[pack:win] Portable build completed for ${versionTag}`);
}

main();
