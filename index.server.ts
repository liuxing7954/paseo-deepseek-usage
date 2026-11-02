import type { PluginServerContext } from "@getpaseo/plugin/server";
import { addAccount, listAccounts, removeAccount, updateAccount } from "./shared/accounts.js";
import { setLocale } from "./shared/i18n.js";
import { inputSchema } from "./shared/input.js";
import { budgetMap, budgetSettings, pricingSettings } from "./shared/settings.js";
import { addAccountView, listAccountViews, removeAccountView, updateAccountView } from "./server/accounts.js";
import { setReportLocale } from "./server/locale.js";
import { createFetchUsage, discover, discoverForSession, type Budgets } from "./server/usage.js";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(budgetSettings);
  server.registerSettings(pricingSettings);

  /**
   * Rejection here means "show no percentage", not "fail the report": an unreadable settings document
   * must never take the balance down with it.
   */
  const readBudgets = async (): Promise<Budgets> => {
    try {
      const state = await settings.read();
      return state.status === "ready" ? budgetMap(state.values) : {};
    } catch {
      return {};
    }
  };

  // The client reports its app language; usage report strings are resolved on the daemon.
  server.handle(setLocale, async ({ locale }) => ({ locale: setReportLocale(locale) }));

  // Key management. The handlers own the account file; the client only ever sees masked hints.
  server.handle(listAccounts, async () => listAccountViews());
  server.handle(addAccount, addAccountView);
  server.handle(updateAccount, updateAccountView);
  server.handle(removeAccount, removeAccountView);

  server.registerUsageSource({
    id: "deepseek",
    label: "DeepSeek",
    icon: "icon.svg",
    input: inputSchema,
    discover: (scope) => (scope.kind === "global" ? discover() : discoverForSession(scope)),
    fetch: createFetchUsage(readBudgets),
  });

  return () => {};
}
