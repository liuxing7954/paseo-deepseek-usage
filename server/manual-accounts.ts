import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ManualAccountView } from "../shared/accounts.js";
import { translate } from "../shared/locales.js";
import { getReportLocale } from "./locale.js";

/**
 * The plugin's own credential list for keys no local tool has stored.
 *
 * This is deliberately not a settings document: Paseo settings are ordinary host-side JSON that every
 * authorized client reads, while a settings screen only needs the masked hint. The key stays in this
 * file on the daemon and is re-read by `fetch()` so replacing it works without a plugin reload.
 */

const MAX_ACCOUNTS = 20;
const MAX_LABEL = 64;
const MAX_KEY = 512;

function t(key: string, vars?: Record<string, string | number>): string {
  return translate(getReportLocale(), key, vars);
}

const manualAccountSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(MAX_LABEL),
    key: z.string().min(1).max(MAX_KEY),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

const documentSchema = z
  .object({
    version: z.literal(1),
    accounts: z.array(manualAccountSchema),
  })
  .strict();

export type ManualAccount = z.infer<typeof manualAccountSchema>;
type ManualAccountsDocument = z.infer<typeof documentSchema>;

export interface AddManualAccountInput {
  label: string;
  key: string;
}

export interface UpdateManualAccountInput {
  id: string;
  label?: string;
  key?: string;
}

/**
 * `PASEO_HOME` when the daemon was started with a custom home, otherwise the default. The file is
 * private to the daemon host; it is never packaged, committed, or sent to a client.
 */
export function manualAccountsPath(): string {
  const home = process.env.PASEO_HOME?.trim() || join(homedir(), ".paseo");
  return join(home, "deepseek-usage", "accounts.json");
}

/**
 * Read-modify-write calls are serialized so two clients adding a key at the same time cannot drop one
 * of them. Reads stay lock-free: the file is replaced atomically, so a reader sees a whole document.
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(work, work);
  writeQueue = next.catch(() => undefined);
  return next;
}

async function readDocument(): Promise<ManualAccountsDocument> {
  let text: string;
  try {
    text = await readFile(manualAccountsPath(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { version: 1, accounts: [] };
    }
    throw new Error(t("manualAccounts.readFailed", { error: errorMessage(error) }));
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text);
  } catch {
    throw new Error(t("manualAccounts.invalidJson"));
  }

  const parsed = documentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new Error(
      t("manualAccounts.invalidShape", {
        error: parsed.error.issues[0]?.message ?? t("manualAccounts.unknownError"),
      }),
    );
  }
  return parsed.data;
}

async function writeDocument(document: ManualAccountsDocument): Promise<void> {
  const path = manualAccountsPath();
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);

  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await chmod(temporary, 0o600).catch(() => undefined);
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw new Error(t("manualAccounts.writeFailed", { error: errorMessage(error) }));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeLabel(label: string): string {
  const trimmed = label.trim();
  return trimmed === "" ? t("manualAccounts.defaultLabel") : trimmed.slice(0, MAX_LABEL);
}

function normalizeKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") throw new Error(t("manualAccounts.emptyKey"));
  if (/\s/.test(trimmed)) throw new Error(t("manualAccounts.whitespaceKey"));
  if (trimmed.length > MAX_KEY) throw new Error(t("manualAccounts.longKey"));
  return trimmed;
}

/** A hint safe for the settings screen: never enough to reconstruct the key. */
export function maskKey(key: string): string {
  return key.length <= 8 ? "••••" : `${key.slice(0, 3)}…${key.slice(-4)}`;
}

function toView(account: ManualAccount): ManualAccountView {
  return {
    id: account.id,
    label: account.label,
    keyHint: maskKey(account.key),
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

/** Every manually added account, including keys. Server-only: never return this through an RPC. */
export async function readManualAccounts(): Promise<ManualAccount[]> {
  return (await readDocument()).accounts;
}

/** Reads the current key for one entry. `fetch()` calls this so a replaced key is used immediately. */
export async function readManualAccount(id: string): Promise<ManualAccount | undefined> {
  return (await readDocument()).accounts.find((account) => account.id === id);
}

export async function listManualAccountViews(): Promise<ManualAccountView[]> {
  return (await readManualAccounts()).map(toView);
}

export async function addManualAccount(input: AddManualAccountInput): Promise<ManualAccountView> {
  return serialize(async () => {
    const document = await readDocument();
    if (document.accounts.length >= MAX_ACCOUNTS) {
      throw new Error(t("manualAccounts.tooMany", { max: MAX_ACCOUNTS }));
    }

    const key = normalizeKey(input.key);
    if (document.accounts.some((account) => account.key === key)) {
      throw new Error(t("manualAccounts.duplicate"));
    }

    const now = new Date().toISOString();
    const account: ManualAccount = {
      id: randomUUID(),
      label: normalizeLabel(input.label),
      key,
      createdAt: now,
      updatedAt: now,
    };
    document.accounts.push(account);
    await writeDocument(document);
    return toView(account);
  });
}

export async function updateManualAccount(input: UpdateManualAccountInput): Promise<ManualAccountView> {
  return serialize(async () => {
    const document = await readDocument();
    const index = document.accounts.findIndex((account) => account.id === input.id);
    if (index === -1) throw new Error(t("manualAccounts.notFound"));

    const current = document.accounts[index]!;
    const nextKey = input.key?.trim() ? normalizeKey(input.key) : current.key;
    if (
      nextKey !== current.key &&
      document.accounts.some((account, other) => other !== index && account.key === nextKey)
    ) {
      throw new Error(t("manualAccounts.duplicate"));
    }

    const now = new Date().toISOString();
    const account: ManualAccount = {
      // A replacement key gets a new locator so the daemon cannot serve the previous balance from
      // its five-minute cache: the input is part of the cache key.
      id: nextKey === current.key ? current.id : randomUUID(),
      label: input.label === undefined ? current.label : normalizeLabel(input.label),
      key: nextKey,
      createdAt: current.createdAt,
      updatedAt: now,
    };
    document.accounts[index] = account;
    await writeDocument(document);
    return toView(account);
  });
}

export async function removeManualAccount(id: string): Promise<boolean> {
  return serialize(async () => {
    const document = await readDocument();
    const next = document.accounts.filter((account) => account.id !== id);
    if (next.length === document.accounts.length) return false;
    document.accounts = next;
    await writeDocument(document);
    return true;
  });
}
