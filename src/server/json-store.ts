import "server-only";
import fs from "node:fs/promises";
import path from "node:path";

const dataDir = path.join(process.cwd(), ".data");

async function ensureDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

export function dataFile(name: string) {
  return path.join(dataDir, name);
}

export async function readJson<T>(
  file: string,
  seed: () => T,
  isValid: (value: unknown) => value is T,
): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) return parsed;
  } catch {
    // Missing or corrupt store: fall through and reseed.
  }
  const initial = seed();
  await writeJson(file, initial);
  return initial;
}

export async function writeJson(file: string, value: unknown) {
  await ensureDir();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

const queues = new Map<string, Promise<unknown>>();

/** Serialises read-modify-write cycles within this server process. */
export function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}
