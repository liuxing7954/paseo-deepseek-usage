import type { PluginPopoverProps, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings, useTranslation } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SidebarRow,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { setLocale } from "../shared/i18n";
import { PRICES, clockLabel, countdownLabel, pricingState } from "../shared/pricing";
import { pricingSettings } from "../shared/settings";
import { messages } from "./messages";

/** Re-renders on a fixed tick so the row and its countdown stay true without a reload. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * Keeps the daemon's usage-report language in step with the app language. Mounted even when the
 * sidebar row is hidden, so a language change updates the next report without a reload.
 */
function LocaleReporter() {
  const { locale } = useTranslation(messages);
  const setLocaleRpc = useRpc(setLocale);

  useEffect(() => {
    void setLocaleRpc({ locale }).catch(() => {});
  }, [locale, setLocaleRpc]);

  return null;
}

/** The row's own popover: the schedule and both price tiers, so the card can stay lean. */
export function PricingDetails({ close }: PluginPopoverProps) {
  const { t } = useTranslation(messages);
  const now = useNow();
  const state = pricingState(now);
  const offPeak = state.phase === "offPeak";
  const phase = offPeak ? t("pricing.phaseOffPeak") : t("pricing.phasePeak");
  const reason = {
    weekdayWindow: t("pricing.reasonWeekdayWindow"),
    outsideWindow: t("pricing.reasonOutsideWindow"),
    weekend: t("pricing.reasonWeekend"),
    holiday: t("pricing.reasonHoliday"),
  }[state.reason];
  const flips = t("pricing.flip", {
    time: clockLabel(state.nextChangeAt, now),
    countdown: countdownLabel(state.nextChangeAt.getTime() - now),
  });

  return (
    <SettingsSection
      title={offPeak ? t("pricing.titleOffPeak") : t("pricing.titlePeak")}
      info={t("pricing.info")}
    >
      <SettingsCard>
        <SettingsRow label={t("pricing.current")} hint={t("pricing.currentHint", { phase, reason })} />
        <SettingsRow
          label={offPeak ? t("pricing.startPeak") : t("pricing.startOffPeak")}
          hint={flips}
        />
        {PRICES.map((price) => (
          <SettingsRow
            key={price.model}
            label={price.model}
            hint={t("pricing.priceRow", {
              offCacheHit: price.offPeak.cacheHit,
              offCacheMiss: price.offPeak.cacheMiss,
              offOutput: price.offPeak.output,
              peakCacheHit: price.peak.cacheHit,
              peakCacheMiss: price.peak.cacheMiss,
              peakOutput: price.peak.output,
            })}
          />
        ))}
        <SettingsAction label={t("pricing.close")} actionLabel={t("pricing.close")} onPress={close} />
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
  return (
    <>
      <LocaleReporter />
      {settings.status === "ready" && settings.values.sidebarRow ? (
        <PricingRow openPopover={openPopover} />
      ) : null}
    </>
  );
}

function PricingRow({ openPopover }: Pick<PluginSidebarItemProps, "openPopover">) {
  const { t } = useTranslation(messages);
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
          ? t("sidebar.offPeak")
          : t("sidebar.peak", { countdown: countdownLabel(state.nextChangeAt.getTime() - now) })
      }
      onPress={() => openPopover(PricingDetails)}
    />
  );
}
