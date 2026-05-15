import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const AI_ACCESS_KEY_SCOPE = "ai_bots" as const;

export interface AiAccessKeyRecord {
  id: string;
  label?: string;
  scopes: string[];
  keyHash: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface AiAccessKeyStoreFile {
  version: 1;
  keys: AiAccessKeyRecord[];
}

export interface PublicAiAccessKeyRecord {
  id: string;
  label?: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface CreatedAiAccessKey {
  key: string;
  record: PublicAiAccessKeyRecord;
}

function toPublicRecord(record: AiAccessKeyRecord): PublicAiAccessKeyRecord {
  return {
    id: record.id,
    label: record.label,
    scopes: [...record.scopes],
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    revokedAt: record.revokedAt,
  };
}

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

function equalHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readStore(filePath: string): AiAccessKeyStoreFile {
  if (!fs.existsSync(filePath)) {
    return { version: 1, keys: [] };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Partial<AiAccessKeyStoreFile>;
  if (parsed.version !== 1 || !Array.isArray(parsed.keys)) {
    throw new Error(`Unsupported AI access key store format: ${filePath}`);
  }
  return {
    version: 1,
    keys: parsed.keys.filter((record): record is AiAccessKeyRecord => {
      return (
        typeof record?.id === "string" &&
        Array.isArray(record.scopes) &&
        typeof record.keyHash === "string" &&
        typeof record.createdAt === "string"
      );
    }),
  };
}

function writeStore(filePath: string, store: AiAccessKeyStoreFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function normalizeLabel(label: string | undefined): string | undefined {
  const trimmed = String(label ?? "").trim();
  return trimmed.length > 0 ? trimmed.slice(0, 80) : undefined;
}

export function createAiAccessKey(filePath: string, label?: string): CreatedAiAccessKey {
  const store = readStore(filePath);
  const id = crypto.randomBytes(8).toString("base64url");
  const secret = crypto.randomBytes(32).toString("base64url");
  const key = `pbai_${id}_${secret}`;
  const record: AiAccessKeyRecord = {
    id,
    label: normalizeLabel(label),
    scopes: [AI_ACCESS_KEY_SCOPE],
    keyHash: hashKey(key),
    createdAt: new Date().toISOString(),
  };

  store.keys.push(record);
  writeStore(filePath, store);
  return { key, record: toPublicRecord(record) };
}

export function listAiAccessKeys(filePath: string): PublicAiAccessKeyRecord[] {
  return readStore(filePath).keys.map(toPublicRecord);
}

export function updateAiAccessKey(
  filePath: string,
  id: string,
  changes: { label?: string }
): PublicAiAccessKeyRecord | null {
  const store = readStore(filePath);
  const record = store.keys.find((entry) => entry.id === id);
  if (!record) return null;

  let changed = false;
  if (changes.label !== undefined) {
    const nextLabel = normalizeLabel(changes.label);
    if (record.label !== nextLabel) {
      record.label = nextLabel;
      changed = true;
    }
  }

  if (changed) {
    writeStore(filePath, store);
  }

  return toPublicRecord(record);
}

export function revokeAiAccessKey(filePath: string, id: string): PublicAiAccessKeyRecord | null {
  const store = readStore(filePath);
  const record = store.keys.find((entry) => entry.id === id);
  if (!record) return null;
  record.revokedAt = record.revokedAt ?? new Date().toISOString();
  writeStore(filePath, store);
  return toPublicRecord(record);
}

export function deleteAiAccessKey(filePath: string, id: string): boolean {
  const store = readStore(filePath);
  const nextKeys = store.keys.filter((entry) => entry.id !== id);
  if (nextKeys.length === store.keys.length) return false;
  writeStore(filePath, { ...store, keys: nextKeys });
  return true;
}

export function validateAiAccessKey(
  filePath: string,
  key: string,
  options: { touchLastUsed?: boolean } = {}
): PublicAiAccessKeyRecord | null {
  const normalized = String(key ?? "").trim();
  if (!normalized) return null;

  const store = readStore(filePath);
  const keyHash = hashKey(normalized);
  const record = store.keys.find((entry) => equalHash(entry.keyHash, keyHash));
  if (!record || record.revokedAt || !record.scopes.includes(AI_ACCESS_KEY_SCOPE)) return null;

  if (options.touchLastUsed) {
    record.lastUsedAt = new Date().toISOString();
    writeStore(filePath, store);
  }

  return toPublicRecord(record);
}
