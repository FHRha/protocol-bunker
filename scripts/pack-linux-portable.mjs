import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const SUPPORTED_ARCHES = {
  x64: { label: "x64", nodeDistArch: "x64" },
  arm64: { label: "arm64", nodeDistArch: "arm64" },
};

function normalizeArch(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "x64" || raw === "amd64" || raw === "x86_64") return "x64";
  if (raw === "arm64" || raw === "aarch64") return "arm64";
  return "";
}

function readArchArg(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--arch") {
      return argv[index + 1] ?? "";
    }
    if (arg.startsWith("--arch=")) {
      return arg.slice("--arch=".length);
    }
  }
  return "";
}
function readOptionValue(argv, flagName) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === flagName) {
      return argv[index + 1] ?? "";
    }
    if (arg.startsWith(`${flagName}=`)) {
      return arg.slice(flagName.length + 1);
    }
  }
  return "";
}
function normalizeAssetVariant(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "1x";
  if (raw === "1x" || raw === "2x") return raw;
  throw new Error(`[pack:linux] Unsupported --asset-variant value: "${value}". Supported: 1x, 2x`);
}

const rootDir = process.cwd();
const rootPackageJsonPath = path.join(rootDir, "package.json");
const rootPackage = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8"));
const appVersion = String(rootPackage.version ?? "0.0.0").trim() || "0.0.0";
const versionTag = `v${appVersion}`;
const fastMode = process.argv.includes("--fast");
const skipBuild = process.argv.includes("--skip-build");
const forceRepack = process.argv.includes("--force-repack");
const baseOnlyMode = process.argv.includes("--base-only");
const fromBaseMode = process.argv.includes("--from-base");
const parallelArchive =
  process.argv.includes("--parallel-archive") ||
  process.env.BUNKER_PACK_PARALLEL_ARCHIVE === "1";
const PRUNE_RUNTIME_NOISE = process.env.BUNKER_PACK_PRUNE_RUNTIME_NOISE !== "0";
const targetArchInput = readArchArg(process.argv.slice(2));
const assetVariant = normalizeAssetVariant(readOptionValue(process.argv.slice(2), "--asset-variant"));
const targetProfile = (() => {
  const raw = String(readOptionValue(process.argv.slice(2), "--profile") || "").trim().toLowerCase();
  if (!raw) return "both";
  if (raw === "public" || raw === "server" || raw === "both") return raw;
  throw new Error(`[pack:linux] Unsupported --profile value: "${raw}". Supported: public, server, both`);
})();
const outRootArg = readOptionValue(process.argv.slice(2), "--out-root");
const baseDirArg = readOptionValue(process.argv.slice(2), "--base-dir");
const assetFlavorSuffix = assetVariant === "2x" ? "-hq2x" : "";
const targetArch = normalizeArch(targetArchInput || "x64");
if (!targetArch || !SUPPORTED_ARCHES[targetArch]) {
  console.error(
    `[pack:linux] Unsupported --arch value: "${targetArchInput}". Supported: x64, arm64`
  );
  process.exit(1);
}
const targetArchConfig = SUPPORTED_ARCHES[targetArch];
const gitHead = (() => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return "nogit";
  return String(result.stdout ?? "").trim() || "nogit";
})();
const artifactsLinuxDir = outRootArg
  ? path.resolve(rootDir, outRootArg)
  : path.join(rootDir, "artifacts", "linux");
const baseArtifactsDirName =
  targetArch === "x64"
    ? ".Protocol-Bunker-base"
    : `.Protocol-Bunker-${targetArch}-base`;
const baseArtifactsDir = path.join(artifactsLinuxDir, baseArtifactsDirName);
const artifactsDirName =
  targetArch === "x64"
    ? `Protocol-Bunker${assetFlavorSuffix}`
    : `Protocol-Bunker-${targetArch}${assetFlavorSuffix}`;
const serverArtifactsDirName =
  targetArch === "x64"
    ? `Protocol-Bunker-server${assetFlavorSuffix}`
    : `Protocol-Bunker-${targetArch}-server${assetFlavorSuffix}`;
const artifactsDir = path.join(artifactsLinuxDir, artifactsDirName);
const serverArtifactsDir = path.join(artifactsLinuxDir, serverArtifactsDirName);
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
const publicTarGzPath = path.join(
  artifactsLinuxDir,
  `protocol-bunker-linux-${targetArch}-public${assetFlavorSuffix}-${versionTag}.tar.gz`
);
const publicZipPath = path.join(
  artifactsLinuxDir,
  `protocol-bunker-linux-${targetArch}-public${assetFlavorSuffix}-${versionTag}.zip`
);
const serverTarGzPath = path.join(
  artifactsLinuxDir,
  `protocol-bunker-linux-${targetArch}-server${assetFlavorSuffix}-${versionTag}.tar.gz`
);
const serverZipPath = path.join(
  artifactsLinuxDir,
  `protocol-bunker-linux-${targetArch}-server${assetFlavorSuffix}-${versionTag}.zip`
);
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
    nodeBinDst: path.join(targetAppDir, "node", "node"),
    startShPath: path.join(targetArtifactsDir, "start.sh"),
    portableEnvPath: path.join(targetArtifactsDir, "portable.env"),
    readmePath: path.join(targetArtifactsDir, "README_PORTABLE.txt"),
  };
}

const publicPaths = createPortablePaths(artifactsDir);
const serverPaths = createPortablePaths(serverArtifactsDir);
const basePaths = createPortablePaths(baseArtifactsDir);
const sourceBasePaths = createPortablePaths(
  baseDirArg ? path.resolve(rootDir, baseDirArg) : baseArtifactsDir
);

function quoteCmdArg(value) {
  if (value.length === 0) return '""';
  const escaped = value.replace(/"/g, '""');
  return /[\s&()^|<>]/.test(value) ? `"${escaped}"` : value;
}

function runStep(command, args) {
  let result;
  if (process.platform === "win32") {
    const commandLine = [command, ...args.map(quoteCmdArg)].join(" ");
    console.log(`[pack:linux] > ${commandLine}`);
    result = spawnSync("cmd.exe", ["/d", "/s", "/c", commandLine], {
      cwd: rootDir,
      stdio: "inherit",
      windowsHide: false,
    });
  } else {
    console.log(`[pack:linux] > ${[command, ...args].join(" ")}`);
    result = spawnSync(command, args, {
      cwd: rootDir,
      stdio: "inherit",
    });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command} ${args.join(" ")}`);
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
    targetArch,
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
  if (missing.length === 0) return;
  throw new Error(
    `[pack:linux] --skip-build requested, but build outputs are missing. Run "pnpm -r build" first.\n${missing.join(
      "\n"
    )}`
  );
}

function cleanPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function cleanPathBestEffort(targetPath, label) {
  if (!fs.existsSync(targetPath)) return;
  try {
    cleanPath(targetPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[pack:linux] WARN: could not fully clean ${label} (${targetPath}): ${message}`);
    console.warn(`[pack:linux] WARN: continuing with overwrite mode for ${label}.`);
  }
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
    `[pack:linux] assets/decks must use the new layout assets/decks/<variant>/<locale>/<Deck>. Missing variant directory: ${variantDir}`
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

function runStepAsync(command, args) {
  return new Promise((resolve, reject) => {
    let child;
    if (process.platform === "win32") {
      const commandLine = [command, ...args.map(quoteCmdArg)].join(" ");
      console.log(`[pack:linux] > ${commandLine}`);
      child = spawn("cmd.exe", ["/d", "/s", "/c", commandLine], {
        cwd: rootDir,
        stdio: "inherit",
        windowsHide: false,
      });
    } else {
      console.log(`[pack:linux] > ${[command, ...args].join(" ")}`);
      child = spawn(command, args, {
        cwd: rootDir,
        stdio: "inherit",
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed (${code ?? 1}): ${command} ${args.join(" ")}`));
        return;
      }
      resolve();
    });
  });
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
    console.log(`[pack:linux] Icons source: ${resolved.source}; client/public/favicon kept as-is.`);
    return;
  }
  cleanPathBestEffort(clientPublicFaviconDir, "client/public/favicon");
  copyDir(resolved.path, clientPublicFaviconDir);
  console.log(`[pack:linux] Icons source: ${resolved.source}`);
}

function syncRootIconsIntoPortableClientDist(paths = publicPaths) {
  const resolved = resolveIconsSourceDir();
  ensureExists(paths.clientDistDst, "portable client dist directory");
  cleanPathBestEffort(paths.portableClientFaviconDir, "portable client dist favicon");
  copyDir(resolved.path, paths.portableClientFaviconDir);
}

function materializeDirectory(sourceDir) {
  const materializedDir = path.join(
    os.tmpdir(),
    `bunker-linux-portable-materialized-${Date.now()}-${process.pid}`
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
    // best effort cleanup
  }
}

function flattenNodeModules(rootPath) {
  const nodeModulesDir = path.join(rootPath, "node_modules");
  const pnpmVirtualDir = path.join(nodeModulesDir, ".pnpm", "node_modules");
  if (!fs.existsSync(pnpmVirtualDir)) return;

  const entries = fs.readdirSync(pnpmVirtualDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const src = path.join(pnpmVirtualDir, entry.name);
    const dst = path.join(nodeModulesDir, entry.name);
    if (fs.existsSync(dst)) continue;
    fs.cpSync(src, dst, { recursive: true, force: true, dereference: true });
  }
}

function pruneRuntimeNoise(rootPath) {
  if (!PRUNE_RUNTIME_NOISE) return;
  const nodeModulesDir = path.join(rootPath, "node_modules");
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

  console.log(`[pack:linux] Pruned runtime-noise files from node_modules: ${removed}`);
}

async function downloadFile(url, destinationPath) {
  console.log(`[pack:linux] Downloading: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
}

async function ensureLinuxNodeRuntime(paths = publicPaths) {
  fs.mkdirSync(paths.nodeDir, { recursive: true });

  if (process.platform === "linux" && normalizeArch(process.arch) === targetArch) {
    const nodeBinSrc = process.execPath;
    ensureExists(nodeBinSrc, "local node runtime");
    fs.copyFileSync(nodeBinSrc, paths.nodeBinDst);
    fs.chmodSync(paths.nodeBinDst, 0o755);
    return;
  }

  const version = (process.env.PORTABLE_NODE_VERSION?.trim() || process.version).replace(/^v/, "");
  const archiveBase = `node-v${version}-linux-${targetArchConfig.nodeDistArch}`;
  const archiveCandidates = [".tar.gz", ".tar.xz"].map((ext) => ({
    ext,
    path: path.join(artifactsLinuxDir, `${archiveBase}${ext}`),
    url: `https://nodejs.org/dist/v${version}/${archiveBase}${ext}`,
  }));

  let archiveToUse = archiveCandidates.find((item) => fs.existsSync(item.path)) ?? null;
  if (!archiveToUse) {
    let lastError = "";
    for (const candidate of archiveCandidates) {
      try {
        await downloadFile(candidate.url, candidate.path);
        archiveToUse = candidate;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!archiveToUse) {
      throw new Error(
        `Failed to download Node runtime for linux-${targetArchConfig.nodeDistArch}: ${lastError}`
      );
    }
  }

  runStep("tar", [
    "-xf",
    archiveToUse.path,
    "-C",
    paths.nodeDir,
    "--strip-components=2",
    `${archiveBase}/bin/node`,
  ]);
  ensureExists(paths.nodeBinDst, "downloaded linux node runtime");
  fs.chmodSync(paths.nodeBinDst, 0o755);
  cleanPath(archiveToUse.path);
}

function formatBytes(value) {
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
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
  console.log(`[pack:linux] ${label}: ${formatDurationMs(elapsedMs)}`);
  return elapsedMs;
}

function createArchiveFromPortableDir(sourcePortableDir, archiveTarPath, archiveZipPath, label) {
  cleanPath(archiveTarPath);
  cleanPath(archiveZipPath);

  const stageRoot = path.join(os.tmpdir(), `bunker-linux-${label}-${Date.now()}-${process.pid}`);
  const stagePortableDir = path.join(stageRoot, "Protocol-Bunker");
  fs.mkdirSync(stageRoot, { recursive: true });
  fs.cpSync(sourcePortableDir, stagePortableDir, { recursive: true, force: true });

  try {
    const tarResult = spawnSync("tar", ["--version"], {
      cwd: rootDir,
      stdio: "ignore",
    });

    if (!tarResult.error && tarResult.status === 0) {
      runStep("tar", ["-czf", archiveTarPath, "-C", stageRoot, "Protocol-Bunker"]);
      ensureExists(archiveTarPath, `${label} portable tar.gz`);
      const stats = fs.statSync(archiveTarPath);
      console.log(`[pack:linux] TAR.GZ created (${label}): ${archiveTarPath}`);
      console.log(`[pack:linux] TAR.GZ size (${label}): ${formatBytes(stats.size)}`);
      return;
    }

    if (process.platform === "win32") {
      const src = stagePortableDir.replace(/'/g, "''");
      const dst = archiveZipPath.replace(/'/g, "''");
      const script = [
        `$src = '${src}'`,
        `$dst = '${dst}'`,
        "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
        "Compress-Archive -Path $src -DestinationPath $dst -Force",
      ].join("; ");
      runStep("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script]);
      ensureExists(archiveZipPath, `${label} portable zip`);
      const stats = fs.statSync(archiveZipPath);
      console.log(`[pack:linux] ZIP created (${label}, tar unavailable): ${archiveZipPath}`);
      console.log(`[pack:linux] ZIP size (${label}): ${formatBytes(stats.size)}`);
      return;
    }

    throw new Error("tar command not found and ZIP fallback is only available on Windows host.");
  } finally {
    cleanPath(stageRoot);
  }
}

async function createArchiveFromPortableDirAsync(sourcePortableDir, archiveTarPath, archiveZipPath, label) {
  cleanPath(archiveTarPath);
  cleanPath(archiveZipPath);

  const stageRoot = path.join(os.tmpdir(), `bunker-linux-${label}-${Date.now()}-${process.pid}`);
  const stagePortableDir = path.join(stageRoot, "Protocol-Bunker");
  fs.mkdirSync(stageRoot, { recursive: true });
  fs.cpSync(sourcePortableDir, stagePortableDir, { recursive: true, force: true });

  try {
    const tarResult = spawnSync("tar", ["--version"], {
      cwd: rootDir,
      stdio: "ignore",
    });

    if (!tarResult.error && tarResult.status === 0) {
      await runStepAsync("tar", ["-czf", archiveTarPath, "-C", stageRoot, "Protocol-Bunker"]);
      ensureExists(archiveTarPath, `${label} portable tar.gz`);
      const stats = fs.statSync(archiveTarPath);
      console.log(`[pack:linux] TAR.GZ created (${label}): ${archiveTarPath}`);
      console.log(`[pack:linux] TAR.GZ size (${label}): ${formatBytes(stats.size)}`);
      return;
    }

    if (process.platform === "win32") {
      const src = stagePortableDir.replace(/'/g, "''");
      const dst = archiveZipPath.replace(/'/g, "''");
      const script = [
        `$src = '${src}'`,
        `$dst = '${dst}'`,
        "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
        "Compress-Archive -Path $src -DestinationPath $dst -Force",
      ].join("; ");
      await runStepAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ]);
      ensureExists(archiveZipPath, `${label} portable zip`);
      const stats = fs.statSync(archiveZipPath);
      console.log(`[pack:linux] ZIP created (${label}, tar unavailable): ${archiveZipPath}`);
      console.log(`[pack:linux] ZIP size (${label}): ${formatBytes(stats.size)}`);
      return;
    }

    throw new Error("tar command not found and ZIP fallback is only available on Windows host.");
  } finally {
    cleanPath(stageRoot);
  }
}

function isPortableBaseReusable(paths = publicPaths, options = {}) {
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
  if (runtimeStamp.targetArch !== targetArch) {
    return {
      ok: false,
      reason: `runtime stamp target arch mismatch (${runtimeStamp.targetArch || "empty"} != ${targetArch})`,
    };
  }
  if (runtimeStamp.assetLayout !== "shared-base-v1") {
    return { ok: false, reason: "runtime stamp asset layout mismatch" };
  }
  const required = [
    [path.join(paths.serverAppDir, "dist", "index.js"), "server dist entry"],
    [path.join(paths.appDir, "client", "dist", "index.html"), "client dist index"],
    [path.join(paths.appDir, "assets"), "assets"],
    [paths.nodeBinDst, "node runtime"],
  ];
  const missing = ensureAnyMissing(required);
  if (missing.length > 0) {
    return { ok: false, reason: `missing runtime files: ${missing.join("; ")}` };
  }
  return { ok: true, reason: "portable base version and files are valid" };
}

function buildStartSh(profile) {
  const publicOnlyLinks = profile === "server";
  const profileLabel = publicOnlyLinks ? "server" : "public";
  const lines = [
    "#!/usr/bin/env bash",
    "set -u",
    "set -o pipefail",
    "",
    'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
    'PORTABLE_ROOT="$SCRIPT_DIR"',
    'APP_ROOT="$PORTABLE_ROOT/app"',
    'LOGS_DIR="$PORTABLE_ROOT/logs"',
    'ENV_FILE="$PORTABLE_ROOT/portable.env"',
    'LEGACY_ENV_FILE="$PORTABLE_ROOT/.env"',
    "",
    'NODE_BIN="$APP_ROOT/node/node"',
    'SERVER_ROOT="$APP_ROOT/server"',
    'SERVER_ENTRY="$SERVER_ROOT/dist/index.js"',
    'CLIENT_INDEX="$APP_ROOT/client/dist/index.html"',
    'ASSETS_ROOT="$APP_ROOT/assets"',
    "",
    'LOG_DAY="$(date +%Y-%m-%d)"',
    'SERVER_LOG_DAY="$LOGS_DIR/server-${LOG_DAY}.log"',
    'SERVER_LOG_LINK="$LOGS_DIR/server.log"',
    'PORT_FILE="$LOGS_DIR/port.txt"',
    'URLS_FILE="$LOGS_DIR/urls.txt"',
    'LAST_START_FILE="$LOGS_DIR/last-start.txt"',
    "",
    'CONFIG_PORT="0"',
    'CONFIG_DEV_MODE="0"',
    'CONFIG_MODE=""',
    'CONFIG_DOMAIN=""',
    'CONFIG_PUBLIC_HOST=""',
    'CONFIG_PUBLIC_ORIGIN=""',
    'CONFIG_LOG_RETENTION_DAYS="14"',
    'MODE=""',
    'DOMAIN=""',
    'LAN_IP=""',
    'PUBLIC_IP=""',
    'OPEN_URL=""',
    `PUBLIC_ONLY_LINKS="${publicOnlyLinks ? "1" : "0"}"`,
    `BUILD_PROFILE="${profileLabel}"`,
    "BROWSER_OPENED=0",
    "",
    "assert_exists() {",
    '  local path_value="$1"',
    '  local label="$2"',
    '  if [[ ! -e "$path_value" ]]; then',
    '    echo "Missing ${label}: ${path_value}" >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    "ensure_exec() {",
    '  local path_value="$1"',
    '  if [[ -f "$path_value" ]]; then',
    '    chmod +x "$path_value" 2>/dev/null || true',
    "  fi",
    "}",
    "",
    "cleanup_old_logs() {",
    '  local keep_days="${1:-14}"',
    '  if [[ "$keep_days" == "0" ]]; then',
    "    return",
    "  fi",
    "  if command -v find >/dev/null 2>&1; then",
    '    find "$LOGS_DIR" -maxdepth 1 -type f -name "server-*.log" -mtime "+$((keep_days - 1))" -delete 2>/dev/null || true',
    "  fi",
    "}",
    "",
    "trim() {",
    '  local value="$*"',
    '  value="${value#"${value%%[![:space:]]*}"}"',
    '  value="${value%"${value##*[![:space:]]}"}"',
    '  printf "%s" "$value"',
    "}",
    "",
    "is_truthy() {",
    '  local value',
    '  value="$(printf "%s" "$1" | tr "[:upper:]" "[:lower:]")"',
    '  [[ "$value" == "1" || "$value" == "true" || "$value" == "yes" || "$value" == "on" ]]',
    "}",
    "",
    "parse_portable_env() {",
    '  local env_file',
    '  for env_file in "$ENV_FILE" "$LEGACY_ENV_FILE"; do',
    '    [[ -f "$env_file" ]] || continue',
    '    while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do',
    "      local line",
    '      line="$(trim "$raw_line")"',
    '      [[ -z "$line" ]] && continue',
    '      case "$line" in',
    '        \#*|\;*) continue ;;',
    '      esac',
    '      if [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)$ ]]; then',
    "        local key value",
    '        key="$(printf "%s" "${BASH_REMATCH[1]}" | tr "[:lower:]" "[:upper:]")"',
    '        value="$(trim "${BASH_REMATCH[2]}")"',
    '        case "$key" in',
    '          PORT) CONFIG_PORT="$value" ;;',
    '          DEV_MODE) CONFIG_DEV_MODE="$value" ;;',
    '          MODE) CONFIG_MODE="$value" ;;',
    '          DOMAIN) CONFIG_DOMAIN="$value" ;;',
    '          PUBLIC_HOST) CONFIG_PUBLIC_HOST="$value" ;;',
    '          PUBLIC_ORIGIN) CONFIG_PUBLIC_ORIGIN="$value" ;;',
    '          LOG_RETENTION_DAYS) CONFIG_LOG_RETENTION_DAYS="$value" ;;',
    "        esac",
    "      fi",
    '    done < "$env_file"',
    "  done",
    "}",
    "",
    "normalize_port() {",
    '  if [[ ! "$CONFIG_PORT" =~ ^[0-9]+$ ]]; then',
    '    CONFIG_PORT="0"',
    "    return",
    "  fi",
    "  if (( CONFIG_PORT < 0 || CONFIG_PORT > 65535 )); then",
    '    CONFIG_PORT="0"',
    "  fi",
    "}",
    "",
    "normalize_log_retention_days() {",
    '  if [[ ! "$CONFIG_LOG_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then',
    '    CONFIG_LOG_RETENTION_DAYS="14"',
    "    return",
    "  fi",
    "  if (( CONFIG_LOG_RETENTION_DAYS < 0 || CONFIG_LOG_RETENTION_DAYS > 365 )); then",
    '    CONFIG_LOG_RETENTION_DAYS="14"',
    "  fi",
    "}",
    "",
    "resolve_mode() {",
    "  local mode_lower",
    '  mode_lower="$(printf "%s" "$CONFIG_MODE" | tr "[:upper:]" "[:lower:]")"',
    '  if [[ "$mode_lower" == "local" || "$mode_lower" == "1" ]]; then',
    '    MODE="local"',
    "    return",
    "  fi",
    '  if [[ "$mode_lower" == "domain" || "$mode_lower" == "2" ]]; then',
    '    MODE="domain"',
    "    return",
    "  fi",
    "",
    '  echo "============================================"',
    '  echo "Protocol: Bunker"',
    '  echo "Self-host launcher"',
    '  echo "============================================"',
    "  echo",
    '  echo "1) Local (HTTP) - IP:PORT"',
    '  echo "2) Domain (HTTPS) - reverse-proxy"',
    "  echo",
    '  read -r -p "Choose mode [1-2]: " choice',
    '  if [[ "$choice" == "1" ]]; then',
    '    MODE="local"',
    '  elif [[ "$choice" == "2" ]]; then',
    '    MODE="domain"',
    "  else",
    '    echo "Invalid mode selection." >&2',
    "    exit 1",
    "  fi",
    "}",
    "",
    "resolve_domain() {",
    '  DOMAIN="$(trim "$CONFIG_DOMAIN")"',
    '  if [[ -z "$DOMAIN" ]]; then',
    '    read -r -p "Enter domain (e.g. bunker.example.com): " DOMAIN',
    "    DOMAIN=\"$(trim \"$DOMAIN\")\"",
    "  fi",
    '  [[ -n "$DOMAIN" ]] || DOMAIN="example.com"',
    "}",
    "",
    "get_public_ip() {",
    "  if command -v curl >/dev/null 2>&1; then",
    '    curl -fsS --max-time 5 "https://api.ipify.org" 2>/dev/null && return 0',
    '    curl -fsS --max-time 5 "https://ifconfig.me/ip" 2>/dev/null && return 0',
    "  fi",
    "  return 1",
    "}",
    "",
    "get_lan_ip() {",
    "  local ip=\"\"",
    "  if command -v ip >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then",
    '    ip="$(ip route get 1.1.1.1 2>/dev/null | awk \'{for(i=1;i<=NF;i++) if($i==\"src\") {print $(i+1); exit}}\')"',
    "  fi",
    '  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then',
    '    ip="$(hostname -I 2>/dev/null | awk \'{print $1}\')"',
    "  fi",
    '  [[ -n "$ip" ]] || ip="127.0.0.1"',
    '  printf "%s" "$ip"',
    "}",
    "",
    "is_port_busy() {",
    '  local port="$1"',
    "  if command -v ss >/dev/null 2>&1; then",
    '    if ss -lnt "( sport = :$port )" 2>/dev/null | grep -q LISTEN; then',
    "      return 0",
    "    fi",
    "  fi",
    "  if command -v lsof >/dev/null 2>&1; then",
    '    if lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then',
    "      return 0",
    "    fi",
    "  fi",
    "  if command -v netstat >/dev/null 2>&1; then",
    '    if netstat -lnt 2>/dev/null | awk -v p=":$port" \'$4 ~ p"$" {found=1} END{exit(found?0:1)}\'; then',
    "      return 0",
    "    fi",
    "  fi",
    "  return 1",
    "}",
    "",
    "wait_port_open() {",
    '  local port="$1"',
    '  local timeout="${2:-10}"',
    '  local deadline=$((SECONDS + timeout))',
    "  while (( SECONDS < deadline )); do",
    '    if is_port_busy "$port"; then',
    "      return 0",
    "    fi",
    "    sleep 0.2",
    "  done",
    "  return 1",
    "}",
    "",
    "open_browser() {",
    '  local url="$1"',
    '  if [[ "${BUNKER_PORTABLE_NO_BROWSER:-0}" == "1" ]]; then',
    "    return",
    "  fi",
    "  if (( BROWSER_OPENED == 1 )); then",
    "    return",
    "  fi",
    "  if command -v xdg-open >/dev/null 2>&1; then",
    '    xdg-open "$url" >/dev/null 2>&1 || true',
    "    BROWSER_OPENED=1",
    "  fi",
    "}",
    "",
    "print_local_urls_block() {",
    '  local port="$1"',
    "  local public_line",
    '  if [[ -n "$PUBLIC_IP" ]]; then',
    '    public_line="Public: http://${PUBLIC_IP}:${port}"',
    "  else",
    '    public_line="Public: unavailable"',
    "  fi",
    '  local local_line="Local : http://${LAN_IP}:${port}"',
    '  local localhost_line="Localhost: http://127.0.0.1:${port}"',
    '  echo "--------------------------------------------"',
    '  echo "URLs"',
    '  echo "--------------------------------------------"',
    '  echo "$public_line"',
    '  if [[ "$PUBLIC_ONLY_LINKS" != "1" ]]; then',
    '    echo "$local_line"',
    "  fi",
    '  echo "--------------------------------------------"',
    "  {",
    '    echo "$public_line"',
    '    if [[ "$PUBLIC_ONLY_LINKS" != "1" ]]; then',
    '      echo "$local_line"',
    '      echo "$localhost_line"',
    "    fi",
    '  } > "$URLS_FILE"',
    "}",
    "",
    "print_domain_urls_block() {",
    '  local port="$1"',
    '  local open_line="Open  : https://${DOMAIN}"',
    '  local upstream_line="Upstream: http://127.0.0.1:${port}"',
    '  echo "--------------------------------------------"',
    '  echo "URLs"',
    '  echo "--------------------------------------------"',
    '  echo "$open_line"',
    '  echo "--------------------------------------------"',
    "  {",
    '    echo "$open_line"',
    '    if [[ "$PUBLIC_ONLY_LINKS" != "1" ]]; then',
    '      echo "$upstream_line"',
    "    fi",
    '  } > "$URLS_FILE"',
    "}",
    "",
    "handle_detected_port() {",
    '  local port="$1"',
    '  if [[ -s "$PORT_FILE" ]]; then',
    "    return",
    "  fi",
    '  echo "$port" > "$PORT_FILE"',
    '  if [[ "$MODE" == "domain" ]]; then',
    '    print_domain_urls_block "$port"',
    '    OPEN_URL="https://${DOMAIN}"',
    "  else",
    '    print_local_urls_block "$port"',
    '    if [[ "$PUBLIC_ONLY_LINKS" == "1" ]]; then',
    '      if [[ -n "$PUBLIC_IP" ]]; then',
    '        OPEN_URL="http://${PUBLIC_IP}:${port}"',
    "      else",
    '        OPEN_URL=""',
    "      fi",
    "    else",
    '      OPEN_URL="http://${LAN_IP}:${port}"',
    "    fi",
    "  fi",
    '  if [[ -n "$OPEN_URL" ]]; then',
    '    open_browser "$OPEN_URL"',
    "  fi",
    "}",
    "",
    "apply_dev_mode() {",
    "  if is_truthy \"$CONFIG_DEV_MODE\"; then",
    '    export BUNKER_IDENTITY_MODE="dev_tab"',
    '    export BUNKER_DEV_LOGS="true"',
    '    export VITE_IDENTITY_MODE="dev_tab"',
    '    export DEV_NEW_PLAYER_PER_TAB="true"',
    '    export VITE_DEV_TAB_IDENTITY="true"',
    '    export VITE_DEV_NEW_PLAYER_PER_TAB="true"',
    '    export BUNKER_ENABLE_DEV_SCENARIOS="true"',
    "  else",
    '    export BUNKER_IDENTITY_MODE="prod"',
    '    export BUNKER_DEV_LOGS="false"',
    '    export VITE_IDENTITY_MODE="prod"',
    '    export DEV_NEW_PLAYER_PER_TAB="false"',
    '    export VITE_DEV_TAB_IDENTITY="false"',
    '    export VITE_DEV_NEW_PLAYER_PER_TAB="false"',
    '    export BUNKER_ENABLE_DEV_SCENARIOS="false"',
    "  fi",
    "}",
    "",
    'ensure_exec "$NODE_BIN"',
    'assert_exists "$NODE_BIN" "Node runtime"',
    'if [[ ! -x "$NODE_BIN" ]]; then',
    '  echo "Node runtime is not executable: $NODE_BIN" >&2',
    "  exit 1",
    "fi",
    'assert_exists "$SERVER_ENTRY" "server entrypoint"',
    'assert_exists "$CLIENT_INDEX" "client dist"',
    'assert_exists "$ASSETS_ROOT" "assets directory"',
    "",
    'mkdir -p "$LOGS_DIR"',
    "parse_portable_env",
    "normalize_port",
    "normalize_log_retention_days",
    'cleanup_old_logs "$CONFIG_LOG_RETENTION_DAYS"',
    'touch "$SERVER_LOG_DAY"',
    'if ln -sfn "server-${LOG_DAY}.log" "$SERVER_LOG_LINK" 2>/dev/null; then',
    "  :",
    "else",
    '  rm -f "$SERVER_LOG_LINK" 2>/dev/null || true',
    '  ln -f "$SERVER_LOG_DAY" "$SERVER_LOG_LINK" 2>/dev/null || true',
    "fi",
    'rm -f "$PORT_FILE" "$URLS_FILE"',
    'date "+%Y-%m-%d %H:%M:%S %z" > "$LAST_START_FILE"',
    "",
    "resolve_mode",
    "",
    'if [[ "$MODE" == "domain" ]]; then',
    '  if [[ "$CONFIG_PORT" == "0" ]]; then',
    '    echo "Domain mode requires fixed PORT. Set PORT=xxxx in portable.env" >&2',
    "    exit 1",
    "  fi",
    "  resolve_domain",
    "fi",
    "",
    'if [[ "$CONFIG_PORT" != "0" ]] && is_port_busy "$CONFIG_PORT"; then',
    '  echo "PORT ${CONFIG_PORT} is busy. Change PORT in portable.env or set PORT=0 for auto." >&2',
    "  exit 1",
    "fi",
    "",
    'export PORT="$CONFIG_PORT"',
    'export BUNKER_SERVE_CLIENT="true"',
    'export BUNKER_PORTABLE="1"',
    'export BUNKER_ASSETS_ROOT="$ASSETS_ROOT"',
    'export BUNKER_CLIENT_DIST="$APP_ROOT/client/dist"',
    `export BUNKER_ASSET_VARIANT="${assetVariant}"`,
    'export BUNKER_BUILD_PROFILE="$BUILD_PROFILE"',
    'if [[ "$PUBLIC_ONLY_LINKS" == "1" ]]; then',
    '  export BUNKER_LINKS_VISIBILITY="public"',
    "else",
    '  unset BUNKER_LINKS_VISIBILITY || true',
    "fi",
    "",
    'if [[ "$MODE" == "domain" ]]; then',
    '  export HOST="127.0.0.1"',
    '  export TRUST_PROXY="true"',
    '  export PUBLIC_ORIGIN="https://${DOMAIN}"',
    '  unset PUBLIC_HOST || true',
    '  unset BUNKER_PUBLIC_HOST || true',
    "else",
    '  export HOST="0.0.0.0"',
    '  export TRUST_PROXY="false"',
    '  if [[ -n "$CONFIG_PUBLIC_ORIGIN" ]]; then',
    '    export PUBLIC_ORIGIN="$CONFIG_PUBLIC_ORIGIN"',
    "  else",
    "    unset PUBLIC_ORIGIN || true",
    "  fi",
    '  if [[ -n "$CONFIG_PUBLIC_HOST" ]]; then',
    '    export PUBLIC_HOST="$CONFIG_PUBLIC_HOST"',
    '    export BUNKER_PUBLIC_HOST="$CONFIG_PUBLIC_HOST"',
    "  else",
    "    unset PUBLIC_HOST || true",
    "    unset BUNKER_PUBLIC_HOST || true",
    "  fi",
    "fi",
    "",
    "apply_dev_mode",
    'LAN_IP="$(get_lan_ip)"',
    'if [[ "$MODE" == "local" ]]; then',
    '  PUBLIC_IP="$(get_public_ip 2>/dev/null || true)"',
    "fi",
    "",
    'echo "Starting Protocol Bunker server..."',
    'echo "Build profile: ${BUILD_PROFILE}"',
    'echo "Mode: ${MODE^^}"',
    'if [[ "$CONFIG_PORT" == "0" ]]; then',
    '  echo "Port mode: auto (PORT=0 from portable.env)"',
    "else",
    '  echo "Port mode: fixed (${CONFIG_PORT}) from portable.env"',
    "fi",
    'echo "Log file (daily): logs/server-${LOG_DAY}.log"',
    'echo "Latest log alias: logs/server.log"',
    'if [[ "$CONFIG_LOG_RETENTION_DAYS" == "0" ]]; then',
    '  echo "Log retention: disabled (LOG_RETENTION_DAYS=0)"',
    "else",
    '  echo "Log retention: ${CONFIG_LOG_RETENTION_DAYS} days"',
    "fi",
    'if [[ "$MODE" == "local" ]]; then',
    '  if [[ -n "$CONFIG_PUBLIC_ORIGIN" ]]; then',
    '    echo "Public source: PUBLIC_ORIGIN from portable.env"',
    '  elif [[ -n "$CONFIG_PUBLIC_HOST" ]]; then',
    '    echo "Public source: PUBLIC_HOST from portable.env"',
    "  else",
    '    echo "Public source: auto WAN lookup (ipify/ifconfig)"',
    "  fi",
    "fi",
    'echo "Press Ctrl+C to stop."',
    "",
    'pushd "$SERVER_ROOT" >/dev/null',
    '"$NODE_BIN" "$SERVER_ENTRY" 2>&1 | tee -a "$SERVER_LOG_DAY" | while IFS= read -r line || [[ -n "$line" ]]; do',
    '  if [[ ! -s "$PORT_FILE" ]]; then',
    '    if [[ "$line" =~ __BUNKER_PORT__=([0-9]{1,5}) ]]; then',
    '      handle_detected_port "${BASH_REMATCH[1]}"',
    '    elif [[ "$CONFIG_PORT" != "0" && "$line" =~ [Ss]erver[[:space:]]+listening ]]; then',
    '      handle_detected_port "$CONFIG_PORT"',
    "    fi",
    "  fi",
    "done",
    'SERVER_EXIT=${PIPESTATUS[0]}',
    "popd >/dev/null",
    "",
    'if [[ ! -s "$PORT_FILE" && "$CONFIG_PORT" != "0" ]]; then',
    '  if wait_port_open "$CONFIG_PORT" 1; then',
    '    handle_detected_port "$CONFIG_PORT"',
    "  fi",
    "fi",
    "",
    'if [[ "$SERVER_EXIT" -ne 0 ]]; then',
    '  echo "Server exited with code ${SERVER_EXIT}. See logs/server.log (daily: logs/server-${LOG_DAY}.log)" >&2',
    '  exit "$SERVER_EXIT"',
    "fi",
    "",
    "exit 0",
  ];
  return `${lines.join("\n")}\n`;
}

function buildPortableEnv(profile) {
  const isServer = profile === "server";
  return `PORT=0
DEV_MODE=0
# MODE=local
# MODE=domain
# DOMAIN=bunker.example.com
# PUBLIC_HOST=203.0.113.10
# PUBLIC_ORIGIN=http://203.0.113.10:8080
# BUNKER_ENFORCE_ORIGIN_CHECKS=1
# BUNKER_ALLOWED_ORIGINS=https://admin.example.com,https://overlay.example.com
# BUNKER_SENSITIVE_HTTP_RATE_LIMIT=1
# BUNKER_SENSITIVE_HTTP_RATE_LIMIT_MAX=120
# BUNKER_SENSITIVE_HTTP_RATE_LIMIT_WINDOW_MS=60000
# LOG_RETENTION_DAYS=14
# PORT=56986
# DEV_MODE=1
# PROFILE=${isServer ? "server" : "public"}
`;
}

function buildReadme(profile) {
  const isServer = profile === "server";
  return `Protocol Bunker Portable (Linux ${isServer ? "Server" : "Public"})
================================

Start:
1. chmod +x start.sh
2. Run ./start.sh
3. Wait for startup lines in terminal

Modes:
- MODE=local|domain in portable.env
- DOMAIN=your.domain.com for domain mode
- Domain mode requires fixed PORT (PORT must be 1..65535)
- For local mode, set PUBLIC_HOST or PUBLIC_ORIGIN in portable.env to skip WAN lookup
- BUNKER_ENFORCE_ORIGIN_CHECKS=1 enables strict origin validation
- BUNKER_ALLOWED_ORIGINS=... adds extra allowed browser origins; same-origin is always allowed
- BUNKER_SENSITIVE_HTTP_RATE_LIMIT=1 keeps sensitive HTTP routes rate-limited
- If PUBLIC_HOST/PUBLIC_ORIGIN are not set, WAN is detected via ipify/ifconfig

Port:
- Set PORT=0 for auto-port
- Set PORT=XXXXX for fixed port
- Actual port is saved to logs/port.txt

Dev mode:
- DEV_MODE=1 enables dev_tab behavior and dev logs/scenarios

Logs:
- logs/server-YYYY-MM-DD.log (daily server log)
- logs/server.log (alias to current daily log)
- logs/port.txt
- logs/urls.txt
- logs/last-start.txt
- retention: set LOG_RETENTION_DAYS in portable.env (default: 14, 0 disables cleanup)
${isServer ? "- Server profile hides LAN/localhost links in launcher output." : "- Public profile prints both Public and Local links."}
`;
}

function getVariantPaths(variantDir) {
  return {
    variantDir,
    variantAppDir: path.join(variantDir, "app"),
    variantStartShPath: path.join(variantDir, "start.sh"),
    variantPortableEnvPath: path.join(variantDir, "portable.env"),
    variantReadmePath: path.join(variantDir, "README_PORTABLE.txt"),
    variantVersionPath: path.join(variantDir, "app", "VERSION"),
  };
}

function writeVariantLaunchFiles(paths, profile) {
  writeFile(paths.startShPath, buildStartSh(profile));
  writeFile(paths.portableEnvPath, buildPortableEnv(profile));
  writeFile(paths.readmePath, buildReadme(profile));
  writePortableRuntimeStamp(paths);
  fs.chmodSync(paths.startShPath, 0o755);
}

async function preparePortableBase(paths) {
  console.log("[pack:linux] Preparing portable base...");
  const portableBaseReuse = isPortableBaseReusable(paths);
  const shouldReusePortableBase = portableBaseReuse.ok;
  if (shouldReusePortableBase) {
    console.log(`[pack:linux] Reusing existing portable base: ${portableBaseReuse.reason}`);
    fs.mkdirSync(paths.appDir, { recursive: true });
    return;
  }

  console.log(`[pack:linux] Building portable base: ${portableBaseReuse.reason}`);
  cleanPath(paths.artifactsDir);
  fs.mkdirSync(paths.appDir, { recursive: true });

  console.log("[pack:linux] Deploying server runtime...");
  runStep(pnpmCmd, ["--filter", "@bunker/server", "deploy", "--prod", paths.serverAppDir]);

  const serverPrune = ["src", "tsconfig.json", "tsconfig.build.json", ".env", ".env.example"];
  for (const relPath of serverPrune) {
    cleanPath(path.join(paths.serverAppDir, relPath));
  }

  console.log("[pack:linux] Materializing server runtime links...");
  materializeDirectory(paths.serverAppDir);
  flattenNodeModules(paths.serverAppDir);

  console.log("[pack:linux] Copying client dist, assets and locales...");
  ensureExists(clientDistSrc, "client dist source");
  ensureExists(assetsSrc, "assets source");
  ensureExists(localesSrc, "locales source");
    copyDir(clientDistSrc, paths.clientDistDst);
    copySharedAssets(assetsSrc, paths.assetsDst);
  copyDir(localesSrc, paths.localesDst);
  copyDir(localesSrc, paths.bundledLocalesDst);

  console.log("[pack:linux] Copying scenario runtime data...");
  ensureExists(scenariosRuntimeSrc, "scenarios runtime source");
  copyDir(scenariosRuntimeSrc, paths.scenariosRuntimeDst);

  console.log("[pack:linux] Copying Linux Node runtime...");
  await ensureLinuxNodeRuntime(paths);
  pruneRuntimeNoise(paths.serverAppDir);
  writePortableRuntimeStamp(paths);
}

function createPortableVariantFromBase(baseRuntimePaths, targetPaths, variant) {
  console.log(`[pack:linux] Materializing public variant from base (${variant})...`);
  cleanPath(targetPaths.artifactsDir);
  copyDir(baseRuntimePaths.artifactsDir, targetPaths.artifactsDir);
  copyAssetsVariant(assetsSrc, targetPaths.assetsDst, variant);
}

function validatePortableProfile(paths, profile) {
  ensureExists(paths.startShPath, `${profile}/start.sh`);
  ensureExists(paths.portableEnvPath, `${profile}/portable.env`);
  ensureExists(paths.readmePath, `${profile}/README_PORTABLE.txt`);
  ensureExists(paths.appVersionFilePath, `${profile}/app VERSION`);
  ensureExists(path.join(paths.serverAppDir, "dist", "index.js"), "server dist entry");
  ensureExists(path.join(paths.appDir, "client", "dist", "index.html"), "client dist index");
  ensureExists(path.join(paths.appDir, "locales", "ui", "app", "ru.json"), "locales/ui/app/ru.json");
  ensureExists(path.join(paths.appDir, "locales", "ui", "app", "en.json"), "locales/ui/app/en.json");
  ensureExists(paths.nodeBinDst, "node runtime");
  ensureExists(
    path.join(paths.serverAppDir, "node_modules", "@bunker", "locales", "logic", "targeting", "ru.json"),
    "@bunker/locales/logic/targeting/ru.json"
  );
  ensureExists(
    path.join(paths.serverAppDir, "node_modules", "@bunker", "locales", "logic", "targeting", "en.json"),
    "@bunker/locales/logic/targeting/en.json"
  );
}

function getProfileArchiveTargets(profile) {
  return profile === "server"
    ? { tarPath: serverTarGzPath, zipPath: serverZipPath, paths: serverPaths }
    : { tarPath: publicTarGzPath, zipPath: publicZipPath, paths: publicPaths };
}

async function main() {
  const totalStartedAt = startTimer();
  console.log(`[pack:linux] Building version: ${versionTag}`);
  console.log(`[pack:linux] Target architecture: ${targetArch}`);
  console.log(`[pack:linux] Assets variant: ${assetVariant} (archive suffix: ${assetFlavorSuffix || "none"})`);
  if (baseOnlyMode) {
    console.log("[pack:linux] Mode: base-only");
  } else if (fromBaseMode) {
    console.log(`[pack:linux] Mode: from-base (${targetProfile})`);
    console.log(`[pack:linux] Base dir: ${sourceBasePaths.artifactsDir}`);
  }
  console.log("[pack:linux] Syncing icons...");
  syncRootIconsIntoClientSource();
  if (process.platform !== "linux") {
    console.log(
      `[pack:linux] Cross-pack on ${process.platform}; linux-${targetArch} node runtime will be downloaded automatically.`
    );
  }

  if (skipBuild) {
    console.log("[pack:linux] Skipping package builds (--skip-build).");
    if (!fromBaseMode) {
      ensureJsBuildOutputsOrThrow();
    }
  } else if (fastMode) {
    const buildStartedAt = startTimer();
    const reuse = isJsBuildReusable();
    if (reuse.ok) {
      console.log(`[pack:linux] Reusing JS build outputs (--fast): ${reuse.reason}`);
    } else {
      console.log(`[pack:linux] --fast fallback to build: ${reuse.reason}`);
      runStep(pnpmCmd, ["-C", "client", "build"]);
      runStep(pnpmCmd, ["-C", "shared", "build"]);
      runStep(pnpmCmd, ["-C", "scenarios", "build"]);
      runStep(pnpmCmd, ["-C", "server", "build"]);
      writeJsBuildStamp();
    }
    logDuration("JS build stage", buildStartedAt);
  } else {
    const buildStartedAt = startTimer();
    console.log("[pack:linux] Building production artifacts...");
    runStep(pnpmCmd, ["-C", "client", "build"]);
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
      throw new Error(`[pack:linux] Provided base directory is not reusable: ${reuse.reason}`);
    }
  } else {
    await preparePortableBase(basePaths);
  }
  logDuration("Portable base stage", baseStartedAt);

  if (baseOnlyMode) {
    console.log("[pack:linux] Base-only mode complete.");
    console.log(`[pack:linux] Base directory: ${basePaths.artifactsDir}`);
    logDuration("Total pack time", totalStartedAt);
    return;
  }

  const runtimeBasePaths = fromBaseMode ? sourceBasePaths : basePaths;

  if (fromBaseMode && targetProfile !== "both") {
    const variantStartedAt = startTimer();
    const target = targetProfile === "server" ? serverPaths : publicPaths;
    createPortableVariantFromBase(runtimeBasePaths, target, assetVariant);
    console.log(`[pack:linux] Writing launch files (${targetProfile} profile)...`);
    if (targetProfile === "public") {
      syncRootIconsIntoPortableClientDist(target);
    }
    writeVariantLaunchFiles(target, targetProfile);
    logDuration(`${targetProfile} variant stage`, variantStartedAt);

    const validateStartedAt = startTimer();
    validatePortableProfile(target, targetProfile);
    logDuration(`Validation stage (${targetProfile})`, validateStartedAt);

    console.log(`[pack:linux] Creating archive (${targetProfile})...`);
    const archiveStartedAt = startTimer();
    const archiveTargets = getProfileArchiveTargets(targetProfile);
    createArchiveFromPortableDir(archiveTargets.paths.artifactsDir, archiveTargets.tarPath, archiveTargets.zipPath, targetProfile);
    logDuration(`Archive stage (${targetProfile})`, archiveStartedAt);

    console.log("[pack:linux] Created files:");
    if (fs.existsSync(archiveTargets.tarPath)) {
      console.log(` - ${archiveTargets.tarPath}`);
    } else if (fs.existsSync(archiveTargets.zipPath)) {
      console.log(` - ${archiveTargets.zipPath}`);
    }
    console.log(` - ${archiveTargets.paths.artifactsDir}`);
    logDuration("Total pack time", totalStartedAt);
    console.log(`[pack:linux] Portable build completed for ${versionTag}`);
    return;
  }

  const publicVariantStartedAt = startTimer();
  createPortableVariantFromBase(runtimeBasePaths, publicPaths, assetVariant);
  console.log("[pack:linux] Writing launch files (public profile)...");
  syncRootIconsIntoPortableClientDist(publicPaths);
  writeVariantLaunchFiles(publicPaths, "public");
  logDuration("Public variant stage", publicVariantStartedAt);

  const serverVariantStartedAt = startTimer();
  console.log("[pack:linux] Preparing server profile variant...");
  cleanPathBestEffort(serverPaths.artifactsDir, "server profile directory");
  copyDir(publicPaths.artifactsDir, serverPaths.artifactsDir);
  writeVariantLaunchFiles(serverPaths, "server");
  logDuration("Server variant stage", serverVariantStartedAt);

  const validateStartedAt = startTimer();
  validatePortableProfile(publicPaths, "public");
  validatePortableProfile(serverPaths, "server");
  logDuration("Validation stage", validateStartedAt);

  console.log("[pack:linux] Creating archives (public + server)...");
  const archiveStartedAt = startTimer();
  if (parallelArchive) {
    console.log("[pack:linux] Parallel archive mode enabled.");
    await Promise.all([
      createArchiveFromPortableDirAsync(publicPaths.artifactsDir, publicTarGzPath, publicZipPath, "public"),
      createArchiveFromPortableDirAsync(serverPaths.artifactsDir, serverTarGzPath, serverZipPath, "server"),
    ]);
  } else {
    createArchiveFromPortableDir(publicPaths.artifactsDir, publicTarGzPath, publicZipPath, "public");
    createArchiveFromPortableDir(serverPaths.artifactsDir, serverTarGzPath, serverZipPath, "server");
  }
  logDuration("Archive stage", archiveStartedAt);

  console.log("[pack:linux] Created files:");
  if (fs.existsSync(publicTarGzPath)) {
    console.log(` - ${publicTarGzPath}`);
  } else if (fs.existsSync(publicZipPath)) {
    console.log(` - ${publicZipPath}`);
  }
  if (fs.existsSync(serverTarGzPath)) {
    console.log(` - ${serverTarGzPath}`);
  } else if (fs.existsSync(serverZipPath)) {
    console.log(` - ${serverZipPath}`);
  }
  console.log(` - ${publicPaths.artifactsDir}`);
  console.log(` - ${serverPaths.artifactsDir}`);
  logDuration("Total pack time", totalStartedAt);
  console.log(`[pack:linux] Portable build completed for ${versionTag}`);
}

main().catch((error) => {
  console.error("[pack:linux] Build failed:", error);
  process.exit(1);
});
