import type { PluginPopoverProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SidebarRow,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { PRICES, clockLabel, countdownLabel, pricingState } from "../shared/pricing";
import { pricingSettings } from "../shared/settings";

/** Re-renders on a fixed tick so the row and its countdown stay true without a reload. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const REASON_LABEL = {
  weekdayWindow: "工作日高峰时段",
  outsideWindow: "两个高峰时段之间",
  weekend: "周末",
  holiday: "中国法定节假日",
} as const;

/** The row's own popover: the schedule and both price tiers, so the card can stay lean. */
export function PricingDetails({ close }: PluginPopoverProps) {
  const now = useNow();
  const state = pricingState(now);
  const offPeak = state.phase === "offPeak";
  const flips = `${clockLabel(state.nextChangeAt, now)}（${countdownLabel(state.nextChangeAt.getTime() - now)}后切换）`;

  return (
    <SettingsSection
      title={offPeak ? "低谷价格" : "高峰价格"}
      info={`高峰时段为 UTC 周一至周五 01:00-04:00、06:00-10:00；周末与中国法定节假日全天低谷，低谷价格是高峰的一半。下面为每 100 万 token 的美元价目；节假日表目前是 2026 年国务院安排。`}
    >
      <SettingsCard>
        <SettingsRow
          label="当前"
          hint={`${offPeak ? "低谷" : "高峰"}（${REASON_LABEL[state.reason]}）`}
        />
        <SettingsRow label={offPeak ? "高峰开始" : "低谷开始"} hint={flips} />
        {PRICES.map((price) => (
          <SettingsRow
            key={price.model}
            label={price.model}
            hint={`低谷 命中 ${price.offPeak.cacheHit} · 未命中 ${price.offPeak.cacheMiss} · 输出 ${price.offPeak.output}\n高峰 命中 ${price.peak.cacheHit} · 未命中 ${price.peak.cacheMiss} · 输出 ${price.peak.output}`}
          />
        ))}
        <SettingsAction label="关闭" actionLabel="关闭" onPress={close} />
      </SettingsCard>
    </SettingsSection>
  );
}

/**
 * The sidebar row, shown only when the host setting asks for it. The item stays registered either way,
 * so the row can appear without a reload and Settings keeps listing it while hidden.
 */
export function PricingSidebarItem({ openPopover }: PluginSidebarItemProps) {
  const settings = useSettings(pricingSettings);
  if (settings.status !== "ready" || !settings.values.sidebarRow) return null;
  // Mount the clock only when the row is visible: the hidden item would otherwise tick every 30s.
  return <PricingRow openPopover={openPopover} />;
}

function PricingRow({ openPopover }: Pick<PluginSidebarItemProps, "openPopover">) {
  const now = useNow();
  const state = pricingState(now);
  const offPeak = state.phase === "offPeak";
  /**
   * The value rides on the label rather than `trailing`: trailing content is not themed by the host,
   * and a bare string there renders unreadably dark against the sidebar.
   */
  return (
    <SidebarRow
      icon={offPeak ? "MoonStar" : "Sun"}
      label={
        offPeak
          ? "DeepSeek 低谷 · −50%"
          : `DeepSeek 高峰 · 还剩 ${countdownLabel(state.nextChangeAt.getTime() - now)}`
      }
      onPress={() => openPopover(PricingDetails)}
    />
  );
}
