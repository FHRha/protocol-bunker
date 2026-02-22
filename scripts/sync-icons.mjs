import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const rootIconsDir = path.join(rootDir, "icons");
const fallbackIconsDir = path.join(rootDir, "client", "public", "favicon");
const targets = [
  path.join(rootDir, "client", "public", "favicon"),
  path.join(rootDir, "win-exe", "assets", "icons"),
];

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

function cleanPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function copyDir(sourcePath, destinationPath) {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
}

function resolveIconsSourceDir() {
  if (fs.existsSync(rootIconsDir)) {
    return { path: rootIconsDir, source: "root icons/" };
  }
  if (fs.existsSync(fallbackIconsDir)) {
    return { path: fallbackIconsDir, source: "client/public/favicon (fallback)" };
  }
  throw new Error(
    `Missing icons source. Checked:\n- ${rootIconsDir}\n- ${fallbackIconsDir}`
  );
}

function syncIcons() {
  const resolved = resolveIconsSourceDir();
  const sourceDir = resolved.path;
  console.log(`[sync:icons] Using source: ${resolved.source}`);

  for (const target of targets) {
    const samePath = path.resolve(sourceDir) === path.resolve(target);
    if (samePath) {
      console.log(`[sync:icons] Skipping self-copy for ${target}`);
      continue;
    }
    cleanPath(target);
    copyDir(sourceDir, target);
    console.log(`[sync:icons] ${sourceDir} -> ${target}`);
  }
}

syncIcons();
