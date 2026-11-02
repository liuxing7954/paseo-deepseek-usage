import type { PluginClientContext } from "@getpaseo/plugin/client";
import { PricingSidebarItem } from "./client/pricing-item";
import { DeepSeekSettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "budget",
    title: "DeepSeek",
    icon: "Coins",
    Component: DeepSeekSettingsScreen,
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
