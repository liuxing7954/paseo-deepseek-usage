import type { PluginClientContext } from "@getpaseo/plugin/client";
import { messages } from "./client/messages";
import { PricingSidebarItem } from "./client/pricing-item";
import { DeepSeekSettingsScreen } from "./client/settings-screen";
import { setLocale } from "./shared/i18n";

export default function contribute(client: PluginClientContext) {
  // Usage report labels are rendered by the host, so tell the daemon which language to use there.
  void client.rpc(setLocale, { locale: client.i18n.locale }).catch(() => {});

  client.addSettingsScreen({
    id: "budget",
    title: messages.message("settings.title"),
    icon: "Coins",
    Component: DeepSeekSettingsScreen,
  });
  /**
   * Registered unconditionally: the row renders `null` while the settings say "card rows only", so the
   * surface can be switched without a plugin reload.
   */
  client.addSidebarFooterItem({
    id: "pricing",
    title: messages.message("sidebar.title"),
    Component: PricingSidebarItem,
  });
  return () => {};
}
