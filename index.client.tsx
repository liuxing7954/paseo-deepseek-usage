import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DeepSeekSettingsScreen } from "./client/settings-screen";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "budget",
    title: "DeepSeek",
    icon: "Coins",
    Component: DeepSeekSettingsScreen,
  });
  return () => {};
}
