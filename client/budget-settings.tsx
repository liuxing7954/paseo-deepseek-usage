import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings, useTranslation } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsInput,
  SettingsSection,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { budgetSettings, pricingSettings } from "../shared/settings";
import { messages } from "./messages";

/** Parses one field: blank means "no gauge for this currency", anything else must be a number >= 0. */
function parseBudget(
  text: string,
  label: string,
  invalid: (label: string) => string,
): number | string {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return invalid(label);
  return value;
}

export function BudgetSettingsSection(_props: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
  const settings = useSettings(budgetSettings);
  const pricing = useSettings(pricingSettings);
  const [cny, setCny] = useState<string>();
  const [usd, setUsd] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const invalid = (label: string) => t("settings.budget.invalid", { label });

  const onSave = async () => {
    if (settings.status !== "ready") return;
    const nextCny = parseBudget(
      cny ?? String(settings.values.cny),
      t("settings.budget.cny"),
      invalid,
    );
    if (typeof nextCny === "string") return setProblem(nextCny);
    const nextUsd = parseBudget(
      usd ?? String(settings.values.usd),
      t("settings.budget.usd"),
      invalid,
    );
    if (typeof nextUsd === "string") return setProblem(nextUsd);

    setProblem(null);
    setSaved(await settings.save({ cny: nextCny, usd: nextUsd }, settings.revision));
  };

  if (settings.status === "loading") {
    return (
      <SettingsSection title={t("settings.sections.budget")}>
        <SettingsCard>
          <SettingsRow label={t("settings.common.loading")} />
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (settings.status === "invalid" || settings.status === "error") {
    const message = settings.status === "invalid" ? settings.error : settings.error;
    return (
      <SettingsSection title={t("settings.sections.budget")}>
        <SettingsCard>
          <SettingsRow
            label={t("settings.common.readFailed")}
            error={message}
            hint={t("settings.common.resetHint")}
          />
          <SettingsAction
            label={t("settings.common.reset")}
            actionLabel={
              settings.saving ? t("settings.common.resetting") : t("settings.common.reset")
            }
            onPress={() => void settings.reset()}
            disabled={settings.saving}
          />
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection title={t("settings.sections.pricing")} info={t("settings.pricing.info")}>
        <SettingsCard>
          {pricing.status === "ready" ? (
            <SettingsSwitch
              label={t("settings.pricing.sidebarRow")}
              hint={t("settings.pricing.sidebarRowHint")}
              value={pricing.values.sidebarRow}
              onValueChange={(sidebarRow) => void pricing.save({ sidebarRow }, pricing.revision)}
              disabled={pricing.saving}
              error={pricing.saveError ?? undefined}
            />
          ) : pricing.status === "loading" ? (
            <SettingsRow label={t("settings.common.loading")} />
          ) : (
            <SettingsRow label={t("settings.pricing.readFailed")} error={pricing.error} />
          )}
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.sections.budget")} info={t("settings.budget.info")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.budget.cny")}
            hint={t("settings.budget.cnyHint")}
            initialValue={String(settings.values.cny)}
            placeholder="100"
            onChangeText={(text) => {
              setCny(text);
              setSaved(false);
            }}
          />
          <SettingsInput
            label={t("settings.budget.usd")}
            hint={t("settings.budget.usdHint")}
            initialValue={String(settings.values.usd)}
            placeholder="0"
            onChangeText={(text) => {
              setUsd(text);
              setSaved(false);
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.sections.save")}>
        <SettingsCard>
          <SettingsAction
            label={saved ? t("settings.budget.saved") : t("settings.budget.save")}
            hint={t("settings.budget.saveHint")}
            error={problem ?? settings.saveError ?? undefined}
            actionLabel={
              settings.saving ? t("settings.budget.saving") : t("settings.budget.saveAction")
            }
            onPress={() => void onSave()}
            disabled={settings.saving}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.sections.applied")}>
        <SettingsCard>
          <SettingsRow
            label="CNY"
            hint={
              settings.values.cny > 0
                ? t("settings.budget.appliedCny", { amount: settings.values.cny })
                : t("settings.budget.notSet")
            }
          />
          <SettingsRow
            label="USD"
            hint={
              settings.values.usd > 0
                ? t("settings.budget.appliedUsd", { amount: settings.values.usd })
                : t("settings.budget.notSet")
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
