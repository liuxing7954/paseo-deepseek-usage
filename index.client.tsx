import type { PluginClientContext } from "@getpaseo/plugin/client";
import { BudgetSettingsScreen } from "./client/budget-settings";
import { PricingSidebarItem } from "./client/pricing-item";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "budget",
    title: "DeepSeek",
    icon: "Coins",
    Component: BudgetSettingsScreen,
  });
  /**
   * Registered unconditionally: the row renders `null` while the settings say "card rows only", so the
   * surface can be switched without a plugin reload.
   */
  client.addSidebarFooterItem({
    id: "pricing",
    title: "DeepSeek pricing",
    Component: PricingSidebarItem,
  });
  return () => {};
}
