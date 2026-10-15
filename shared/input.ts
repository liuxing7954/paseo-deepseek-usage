import { z } from "zod";

/**
 * A credential store locator, never a credential.
 *
 * The daemon treats this as opaque and only uses it to address a report, so it must stay stable for
 * a given login: the same store locator is the same report, and `fetch()` re-reads it every time.
 */
export const inputSchema = z
  .object({
    /** Which store the key was found in. */
    store: z.enum(["env", "dsh", "opencode", "deepseek-cli"]),
    /** Env var name for `env`, otherwise the absolute path of the store file. */
    locator: z.string().min(1),
    /** Normalized official API base URL, without a trailing slash. */
    baseURL: z.string().min(1),
  })
  .strict();

export type UsageInput = z.infer<typeof inputSchema>;
