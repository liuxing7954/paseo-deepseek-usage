import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Credential stores this source knows how to read. A store is a *place*, not a credential: `discover()`
 * reports which stores hold a key, and `fetch()` re-reads the chosen store so a rotated key is picked up.
 */
export type StoreId = "env" | "dsh" | "opencode" | "deepseek-cli";

export interface CredentialStore {
  id: StoreId;
  /** Env var name for `env`, absolute file path otherwise. */
  locator: string;
  /** Display name of the harness that owns the store; used as the account label and error harness. */
  harness: string;
  /** Base URL to prefer when the store itself does not carry one. */
  baseURL: string;
}

export interface DeepSeekLogin {
  key: string;
  baseURL: string;
}

export const OFFICIAL_BASE_URL = "https://api.deepseek.com";

export function credentialStores(): CredentialStore[] {
  const home = homedir();
  return [
    {
      id: "env",
      locator: "DEEPSEEK_API_KEY",
      harness: "环境变量",
      baseURL: process.env.DEEPSEEK_BASE_URL ?? OFFICIAL_BASE_URL,
    },
    {
      // The DeepSeek Harness keeps its own credential file: `refs:` maps env-style names to secrets.
      id: "dsh",
      locator: join(home, ".dsh", ".credentials.yaml"),
      harness: "DeepSeek Harness",
      baseURL: OFFICIAL_BASE_URL,
    },
    {
      // OpenCode's provider entry for the official API, e.g. provider.deepseek.options.{apiKey,baseURL}.
      id: "opencode",
      locator: join(home, ".config", "opencode", "opencode.json"),
      harness: "OpenCode",
      baseURL: OFFICIAL_BASE_URL,
    },
    {
      id: "deepseek-cli",
      locator: join(home, ".deepseek", "config.toml"),
      harness: "DeepSeek CLI",
      baseURL: OFFICIAL_BASE_URL,
    },
  ];
}

export function storeById(id: StoreId): CredentialStore | undefined {
  return credentialStores().find((store) => store.id === id);
}

/**
 * Only the official host is accepted: `provider.deepseek.options.baseURL` is user-editable, and a
 * gateway that merely speaks the same chat API has no `/user/balance` contract. A store pointed
 * somewhere else is skipped rather than reported as the official balance.
 */
export function officialBaseURL(raw: string): string | undefined {
  try {
    return new URL(raw).hostname === "api.deepseek.com" ? OFFICIAL_BASE_URL : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the login a store currently holds, or `undefined` when the store has none. */
export async function readLogin(store: CredentialStore): Promise<DeepSeekLogin | undefined> {
  switch (store.id) {
    case "env": {
      const key = process.env[store.locator];
      return key ? { key, baseURL: store.baseURL } : undefined;
    }
    case "dsh": {
      const key = firstGroup(await readText(store.locator), /^\s*DEEPSEEK_API_KEY:\s*["']?([^"'\s]+)["']?\s*$/m);
      return key ? { key, baseURL: store.baseURL } : undefined;
    }
    case "opencode": {
      const options = parseJson(await readText(store.locator))?.provider?.deepseek?.options;
      const key = typeof options?.apiKey === "string" ? options.apiKey : undefined;
      if (!key) return undefined;
      const baseURL = typeof options?.baseURL === "string" ? options.baseURL : store.baseURL;
      return { key, baseURL };
    }
    case "deepseek-cli": {
      const key = firstGroup(await readText(store.locator), /^\s*api_key\s*=\s*["']([^"']+)["']/m);
      return key ? { key, baseURL: store.baseURL } : undefined;
    }
  }
}

async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

function firstGroup(text: string, pattern: RegExp): string | undefined {
  return pattern.exec(text)?.[1];
}

interface OpenCodeConfig {
  provider?: Record<string, { options?: { apiKey?: unknown; baseURL?: unknown } }>;
}

function parseJson(text: string): OpenCodeConfig | undefined {
  try {
    return JSON.parse(text) as OpenCodeConfig;
  } catch {
    return undefined;
  }
}
