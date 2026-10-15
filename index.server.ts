import type { PluginServerContext } from "@getpaseo/plugin/server";
import { inputSchema } from "./shared/input.js";
import { budgetMap, budgetSettings } from "./shared/settings.js";
import { createFetchUsage, discover, discoverForSession, type Budgets } from "./server/usage.js";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(budgetSettings);

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
