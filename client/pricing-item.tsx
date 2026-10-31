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
  weekdayWindow: "a weekday peak window",
  outsideWindow: "between the peak windows",
  weekend: "the weekend",
  holiday: "a Chinese public holiday",
} as const;

/** The row's own popover: the schedule and both price tiers, so the card can stay lean. */
export function PricingDetails({ close }: PluginPopoverProps) {
  const now = useNow();
  const state = pricingState(now);
  const offPeak = state.phase === "offPeak";
  const flips = `${clockLabel(state.nextChangeAt, now)} (in ${countdownLabel(state.nextChangeAt.getTime() - now)})`;

  return (
    <SettingsSection
      title={offPeak ? "Off-peak pricing" : "Peak pricing"}
      info={`Peak hours are 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday. Weekends and Chinese public holidays are off-peak all day, and off-peak costs half the peak price.`}
    >
      <SettingsCard>
        <SettingsRow
          label="Currently"
          hint={`${offPeak ? "Off-peak" : "Peak"}, because it is ${REASON_LABEL[state.reason]}`}
        />
        <SettingsRow label={offPeak ? "Peak starts" : "Off-peak starts"} hint={flips} />
        {PRICES.map((price) => (
          <SettingsRow
            key={price.model}
            label={price.model}
            hint={`off-peak ${price.offPeak.cacheHit} hit · ${price.offPeak.cacheMiss} miss · ${price.offPeak.output} out\npeak ${price.peak.cacheHit} hit · ${price.peak.cacheMiss} miss · ${price.peak.output} out`}
          />
        ))}
        <SettingsAction label="Close" actionLabel="Close" onPress={close} />
      </SettingsCard>
    </SettingsSection>
  );
}

/**
 * The sidebar row, shown only when the host setting asks for it. The item stays registered either way,
 * so the row can appear without a reload and Settings keeps listing it while hidden.
 *
 * The value rides on the label rather than `trailing`: trailing content is not themed by the host, and
 * a bare string there renders unreadably dark against the sidebar.
 */
export function PricingSidebarItem({ openPopover }: PluginSidebarItemProps) {
  const settings = useSettings(pricingSettings);
  const now = useNow();
  if (settings.status !== "ready" || !settings.values.sidebarRow) return null;

  const state = pricingState(now);
  const offPeak = state.phase === "offPeak";
  return (
    <SidebarRow
      icon={offPeak ? "MoonStar" : "Sun"}
      label={
        offPeak
          ? "DeepSeek off-peak · −50%"
          : `DeepSeek peak · ${countdownLabel(state.nextChangeAt.getTime() - now)} left`
      }
      onPress={() => openPopover(PricingDetails)}
    />
  );
}
