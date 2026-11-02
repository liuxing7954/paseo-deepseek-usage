import { z } from "zod";

/**
 * Stores this source can read. `manual` is not a file on disk: it is the plugin's own list, managed
 * from Settings, and its locator is a random id rather than a path.
 */
export const autoStoreIdSchema = z.enum(["env", "dsh", "opencode", "deepseek-cli"]);
export const storeIdSchema = z.enum(["env", "dsh", "opencode", "deepseek-cli", "manual"]);

export type AutoStoreId = z.infer<typeof autoStoreIdSchema>;
export type StoreId = z.infer<typeof storeIdSchema>;

/**
 * A credential store locator, never a credential.
 *
 * The daemon treats this as opaque and only uses it to address a report, so it must stay stable for
 * a given login: the same store locator is the same report, and `fetch()` re-reads it every time.
 * For `manual`, the locator is the id of the entry in the plugin's own account file.
 */
export const inputSchema = z
  .object({
    /** Which store the key was found in. */
    store: storeIdSchema,
    /** Env var name for `env`, absolute path for the file stores, entry id for `manual`. */
    locator: z.string().min(1),
    /** Normalized official API base URL, without a trailing slash. */
    baseURL: z.string().min(1),
  })
  .strict();

export type UsageInput = z.infer<typeof inputSchema>;
