import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const run = (cmd, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`Command failed (${cmd} ${args.join(" ")}): code=${code}\n${stderr || stdout}`));
    });
  });

const hasBash = async () => {
  try {
    await run("bash", ["--version"]);
    return true;
  } catch {
    return false;
  }
};

test("install.sh: install/update preserve settings+data and keep selected quality in launcher flags", async (t) => {
  const bashAvailable = await hasBash();
  if (!bashAvailable) {
    t.skip("bash is required for install.sh integration test");
    return;
  }

  const repoRoot = process.cwd();
  const root = await mkdtemp(path.join(tmpdir(), "bunker-install-test-"));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const homeDir = path.join(root, "home");
  const fakeBin = path.join(root, "bin");
  const pkgRoot = path.join(root, "pkg");
  const packageDir = path.join(pkgRoot, "Protocol-Bunker");
  const assetTar = path.join(root, "asset.tar.gz");
  const mockedInstall = path.join(root, "install.sh");
  const fakeCurl = path.join(fakeBin, "curl");
  const callLogFile = path.join(root, "curl.calls.log");
  const nodeCallLogFile = path.join(root, "node.calls.log");
  const appDir = path.join(homeDir, ".local", "share", "protocol-bunker", "Protocol-Bunker");
  const launcherPath = path.join(homeDir, ".local", "bin", "protocol-bunker");
  const portableEnvPath = path.join(appDir, "portable.env");
  const userDataFile = path.join(appDir, "app", "data", "user.txt");

  await mkdir(fakeBin, { recursive: true });
  await mkdir(path.join(packageDir, "app", "data"), { recursive: true });
  await mkdir(path.join(packageDir, "app", "node"), { recursive: true });
  await mkdir(path.join(packageDir, "app", "server", "dist", "ai"), { recursive: true });

  await writeFile(path.join(packageDir, "start.sh"), "#!/usr/bin/env bash\necho start\n", "utf8");
  await chmod(path.join(packageDir, "start.sh"), 0o755);
  await writeFile(
    path.join(packageDir, "app", "node", "node"),
    `#!/usr/bin/env bash
set -euo pipefail
{
  echo "PWD=$PWD"
  echo "AI_FILE=\${BUNKER_AI_ACCESS_KEYS_FILE:-}"
  echo "ARG1=\${1:-}"
  echo "ARG2=\${2:-}"
} >> "$MOCK_NODE_CALL_LOG"
`,
    "utf8"
  );
  await chmod(path.join(packageDir, "app", "node", "node"), 0o755);
  await writeFile(path.join(packageDir, "app", "server", "dist", "ai", "accessKeysCli.js"), "module.exports={};\n", "utf8");
  await writeFile(
    path.join(packageDir, "portable.env"),
    `# Protocol: Bunker Portable Configuration
# =============================================================================
# 1. Launcher Settings
# =============================================================================

PORT=8080 # Server port.
DEV_MODE=0 # Dev mode.
# MODE=local # Launcher mode: local or domain.
TRUST_PROXY=auto # Proxy mode.

# =============================================================================
# 2. Bot Timing
# =============================================================================

NEW_DEFAULT=on # Simulated new setting in the release template.
`,
    "utf8"
  );
  await writeFile(path.join(packageDir, "app", "data", "seed.txt"), "seed-data\n", "utf8");

  await run("tar", ["-czf", assetTar, "-C", pkgRoot, "Protocol-Bunker"]);

  const installShSource = await readFile(path.join(repoRoot, "install.sh"), "utf8");
  await writeFile(mockedInstall, installShSource, "utf8");
  await chmod(mockedInstall, 0o755);

  const curlScript = `#!/usr/bin/env bash
set -euo pipefail
echo "$@" >> "$MOCK_CURL_CALL_LOG"
url="\${@: -1}"
out_file=""
args=("$@")
for ((i=0; i<\${#args[@]}; i++)); do
  if [[ "\${args[$i]}" == "-o" ]] && (( i + 1 < \${#args[@]} )); then
    out_file="\${args[$((i+1))]}"
  fi
done
if [[ "$url" == *"/releases/latest" ]]; then
  printf '{"tag_name":"0.2.6"}'
  exit 0
fi
if [[ "$url" == *"/releases/tags/"* ]]; then
  printf '{"tag_name":"0.2.6"}'
  exit 0
fi
if [[ "$url" == *"/releases/download/"* ]]; then
  cp "$MOCK_TAR_PATH" "$out_file"
  exit 0
fi
if [[ "$url" == *"/raw.githubusercontent.com/"*"/install.sh" ]]; then
  cat "$MOCK_INSTALL_SCRIPT"
  exit 0
fi
echo "unexpected curl url: $url" >&2
exit 1
`;
  await writeFile(fakeCurl, curlScript, "utf8");
  await chmod(fakeCurl, 0o755);

  await mkdir(path.join(appDir, "app", "data"), { recursive: true });
  await writeFile(
    portableEnvPath,
    "PORT=9999 # user-selected port\nDEV_MODE=1\nMODE=domain\nCUSTOM_KEEP=yes\n",
    "utf8"
  );
  await writeFile(userDataFile, "user-data\n", "utf8");

  const commonEnv = {
    ...process.env,
    HOME: homeDir,
    PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    MOCK_TAR_PATH: assetTar,
    MOCK_INSTALL_SCRIPT: mockedInstall,
    MOCK_CURL_CALL_LOG: callLogFile,
    MOCK_NODE_CALL_LOG: nodeCallLogFile,
  };

  await run(
    "bash",
    [
      mockedInstall,
      "--version",
      "0.2.6",
      "--edition",
      "server",
      "--arch",
      "x64",
      "--quality",
      "2x",
      "--service-scope",
      "user",
      "--no-autostart",
    ],
    { env: commonEnv, cwd: root }
  );

  const installedEnv = await readFile(portableEnvPath, "utf8");
  assert.match(installedEnv, /^PORT=9999 # Server port\.$/m);
  assert.match(installedEnv, /^DEV_MODE=1 # Dev mode\.$/m);
  assert.match(installedEnv, /^MODE=domain # Launcher mode: local or domain\.$/m);
  assert.match(installedEnv, /^TRUST_PROXY=auto # Proxy mode\.$/m);
  assert.match(installedEnv, /^CUSTOM_KEEP=yes$/m);
  assert.match(installedEnv, /^NEW_DEFAULT=on # Simulated new setting in the release template\.$/m);
  assert.ok(
    installedEnv.indexOf("MODE=domain # Launcher mode: local or domain.") <
      installedEnv.indexOf("# 2. Bot Timing"),
    "existing MODE value should be merged into the launcher settings block"
  );
  assert.ok(
    installedEnv.trimEnd().endsWith("CUSTOM_KEEP=yes"),
    "unknown custom settings should remain appended after template blocks"
  );
  assert.equal(await readFile(userDataFile, "utf8"), "user-data\n");

  const launcher = await readFile(launcherPath, "utf8");
  assert.match(launcher, /QUALITY="2x"/);
  assert.match(launcher, /--edition "\$EDITION"/);
  assert.match(launcher, /--quality "\$QUALITY"/);
  assert.match(launcher, /--service-scope "\$SERVICE_SCOPE"/);
  await run("bash", [launcherPath, "ai:key:list"], { env: commonEnv, cwd: root });
  const nodeCalls = await readFile(nodeCallLogFile, "utf8");
  assert.match(nodeCalls, /PWD=.*app[\\/]server/m);
  assert.match(nodeCalls, /^AI_FILE=\.\.\/\.\.\/data\/ai-access-keys\.json$/m);
  assert.match(nodeCalls, /ARG1=.*accessKeysCli\.js/m);
  assert.match(nodeCalls, /^ARG2=list$/m);

  await run("bash", [launcherPath, "--update", "v0.2.6"], { env: commonEnv, cwd: root });
  const envAfterUpdate = await readFile(portableEnvPath, "utf8");
  assert.match(envAfterUpdate, /^PORT=9999 # Server port\.$/m);
  assert.match(envAfterUpdate, /^MODE=domain # Launcher mode: local or domain\.$/m);
  assert.match(envAfterUpdate, /^CUSTOM_KEEP=yes$/m);
  assert.equal(await readFile(userDataFile, "utf8"), "user-data\n");

  const curlCalls = await readFile(callLogFile, "utf8");
  assert.match(curlCalls, /releases\/download\/0\.2\.6\/protocol-bunker-linux-x64-server-hq2x-v0\.2\.6\.tar\.gz/);
  assert.match(curlCalls, /raw\.githubusercontent\.com\/FHRha\/protocol-bunker\/main\/install\.sh/);

});

