import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BudgetSettingsScreen } from "./client/budget-settings";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "budget",
    title: "DeepSeek 预算",
    icon: "Coins",
    Component: BudgetSettingsScreen,
  });
  return () => {};
}
