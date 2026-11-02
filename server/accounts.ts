import type { RpcInput } from "@getpaseo/plugin";
import {
  addAccount,
  removeAccount,
  updateAccount,
  type AccountsView,
} from "../shared/accounts.js";
import { inputSchema } from "../shared/input.js";
import {
  addManualAccount,
  listManualAccountViews,
  removeManualAccount,
  updateManualAccount,
} from "./manual-accounts.js";
import { discoverAutoAccounts } from "./usage.js";

/** The settings screen's read model: masked manual entries plus the read-only harness stores. */
export async function listAccountViews(): Promise<AccountsView> {
  const [manual, discovered] = await Promise.all([
    listManualAccountViews(),
    discoverAutoAccounts(),
  ]);

  const auto: AccountsView["auto"] = [];
  for (const account of discovered) {
    const parsed = inputSchema.safeParse(account.input);
    if (!parsed.success || parsed.data.store === "manual") continue;
    auto.push({ store: parsed.data.store, harness: account.harness ?? "Unknown source" });
  }
  return { manual, auto };
}

export async function addAccountView(input: RpcInput<typeof addAccount>) {
  return { account: await addManualAccount(input) };
}

export async function updateAccountView(input: RpcInput<typeof updateAccount>) {
  return { account: await updateManualAccount(input) };
}

export async function removeAccountView(input: RpcInput<typeof removeAccount>) {
  return { removed: await removeManualAccount(input.id) };
}
