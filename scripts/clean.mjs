import fs from "fs";
import path from "path";

const root = process.cwd();

const targets = [
  "node_modules",
  "client/node_modules",
  "server/node_modules",
  "scenarios/node_modules",
  "shared/node_modules",
  "client/dist",
  "server/dist",
  "scenarios/dist",
  "shared/dist",
  "client/.vite",
  "scenarios/.vite",
  ".cache",
  ".turbo",
  "coverage",
];

const removed = [];

const removePath = (relPath) => {
  const fullPath = path.join(root, relPath);
  if (!fs.existsSync(fullPath)) return;
  fs.rmSync(fullPath, { recursive: true, force: true });
  removed.push(relPath);
};

for (const target of targets) {
  removePath(target);
}

const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (entry.name.endsWith(".tsbuildinfo") || entry.name.endsWith(".log")) {
      fs.rmSync(fullPath, { force: true });
      removed.push(path.relative(root, fullPath));
    }
  }
};

walk(root);

if (removed.length === 0) {
  console.log("Nothing to clean.");
} else {
  console.log("Removed:");
  for (const item of removed) {
    console.log(`- ${item}`);
  }
}
