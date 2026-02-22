import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, "icons");
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

function syncIcons() {
  ensureExists(sourceDir, "root icons directory");
  for (const target of targets) {
    cleanPath(target);
    copyDir(sourceDir, target);
    console.log(`[sync:icons] ${sourceDir} -> ${target}`);
  }
}

syncIcons();
