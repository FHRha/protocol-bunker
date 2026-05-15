import {
  createAiAccessKey,
  deleteAiAccessKey,
  listAiAccessKeys,
  updateAiAccessKey,
  revokeAiAccessKey,
  validateAiAccessKey,
} from "./accessKeys.js";
import { AI_ACCESS_KEYS_FILE } from "../config/runtime.js";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function usage(): never {
  console.error([
    "Usage:",
    "  pnpm -C server ai:key:create -- --label \"Host name\"",
    "  protocol-bunker ai:key:create --label \"Host name\"",
    "  pnpm -C server ai:key:list",
    "  protocol-bunker ai:key:list",
    "  pnpm -C server ai:key:edit -- <id> --label \"New label\"",
    "  protocol-bunker ai:key:edit <id> --label \"New label\"",
    "  pnpm -C server ai:key:revoke -- <id>",
    "  protocol-bunker ai:key:revoke <id>",
    "  pnpm -C server ai:key:delete -- <id>",
    "  protocol-bunker ai:key:delete <id>",
    "  pnpm -C server ai:key:validate -- <key>",
    "  protocol-bunker ai:key:validate <key>",
  ].join("\n"));
  process.exit(1);
}

const command = process.argv[2];

if (command === "create") {
  const created = createAiAccessKey(AI_ACCESS_KEYS_FILE, readArg("label"));
  printJson({
    ok: true,
    file: AI_ACCESS_KEYS_FILE,
    key: created.key,
    record: created.record,
  });
} else if (command === "list") {
  printJson({
    ok: true,
    file: AI_ACCESS_KEYS_FILE,
    keys: listAiAccessKeys(AI_ACCESS_KEYS_FILE),
  });
} else if (command === "edit") {
  const id = process.argv[3];
  if (!id) usage();
  const label = readArg("label");
  if (label === undefined) usage();
  const record = updateAiAccessKey(AI_ACCESS_KEYS_FILE, id, { label });
  printJson({ ok: Boolean(record), file: AI_ACCESS_KEYS_FILE, record });
  process.exit(record ? 0 : 2);
} else if (command === "revoke") {
  const id = process.argv[3];
  if (!id) usage();
  const record = revokeAiAccessKey(AI_ACCESS_KEYS_FILE, id);
  printJson({ ok: Boolean(record), file: AI_ACCESS_KEYS_FILE, record });
  process.exit(record ? 0 : 2);
} else if (command === "delete") {
  const id = process.argv[3];
  if (!id) usage();
  const deleted = deleteAiAccessKey(AI_ACCESS_KEYS_FILE, id);
  printJson({ ok: deleted, file: AI_ACCESS_KEYS_FILE, id });
  process.exit(deleted ? 0 : 2);
} else if (command === "validate") {
  const key = process.argv[3];
  if (!key) usage();
  const record = validateAiAccessKey(AI_ACCESS_KEYS_FILE, key);
  printJson({ ok: true, file: AI_ACCESS_KEYS_FILE, valid: Boolean(record), record });
  process.exit(record ? 0 : 2);
} else {
  usage();
}
