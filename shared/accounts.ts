import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { autoStoreIdSchema } from "./input.js";

/**
 * What a client may know about a manually added key: a label, a masked hint, and timestamps. The key
 * itself stays on the daemon and is never part of an RPC response.
 */
export const manualAccountViewSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    keyHint: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

/** An account the plugin found in another tool's credential store. Read-only, no key material. */
export const autoAccountViewSchema = z
  .object({
    store: autoStoreIdSchema,
  })
  .strict();

export const accountsViewSchema = z
  .object({
    manual: z.array(manualAccountViewSchema),
    auto: z.array(autoAccountViewSchema),
  })
  .strict();

export type ManualAccountView = z.infer<typeof manualAccountViewSchema>;
export type AutoAccountView = z.infer<typeof autoAccountViewSchema>;
export type AccountsView = z.infer<typeof accountsViewSchema>;

const emptyInput = z.object({}).strict();

export const listAccounts = defineRpc({
  name: "deepseek.accounts.list",
  input: emptyInput,
  output: accountsViewSchema,
});

export const addAccount = defineRpc({
  name: "deepseek.accounts.add",
  input: z
    .object({
      label: z.string().max(64).default(""),
      key: z.string().min(1).max(512),
    })
    .strict(),
  output: z.object({ account: manualAccountViewSchema }).strict(),
});

export const updateAccount = defineRpc({
  name: "deepseek.accounts.update",
  input: z
    .object({
      id: z.string().min(1).max(64),
      /** Absent keeps the current label; an empty string resets it to the default. */
      label: z.string().max(64).optional(),
      /** Blank or absent keeps the current key. A replacement rotates the entry id. */
      key: z.string().max(512).optional(),
    })
    .strict(),
  output: z.object({ account: manualAccountViewSchema }).strict(),
});

export const removeAccount = defineRpc({
  name: "deepseek.accounts.remove",
  input: z.object({ id: z.string().min(1).max(64) }).strict(),
  output: z.object({ removed: z.boolean() }).strict(),
});
