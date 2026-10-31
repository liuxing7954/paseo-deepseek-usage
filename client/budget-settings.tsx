import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsInput, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { budgetSettings } from "../shared/settings";

/** Parses one field: blank means "no gauge for this currency", anything else must be a number >= 0. */
function parseBudget(text: string, label: string): number | string {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return `${label} must be a number ≥ 0`;
  return value;
}

export function BudgetSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(budgetSettings);
  const [cny, setCny] = useState<string>();
  const [usd, setUsd] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSave = async () => {
    if (settings.status !== "ready") return;
    const nextCny = parseBudget(cny ?? String(settings.values.cny), "CNY budget");
    if (typeof nextCny === "string") return setProblem(nextCny);
    const nextUsd = parseBudget(usd ?? String(settings.values.usd), "USD budget");
    if (typeof nextUsd === "string") return setProblem(nextUsd);

    setProblem(null);
    setSaved(await settings.save({ cny: nextCny, usd: nextUsd }, settings.revision));
  };

  if (settings.status === "loading") {
    return (
      <SettingsSection title="Budget denominators">
        <SettingsCard>
          <SettingsRow label="Loading…" />
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (settings.status === "invalid" || settings.status === "error") {
    const message = settings.status === "invalid" ? settings.error : settings.error;
    return (
      <SettingsSection title="Budget denominators">
        <SettingsCard>
          <SettingsRow
            label="Settings could not be read"
            error={message}
            hint="Resetting restores the defaults (CNY 100)"
          />
          <SettingsAction
            label="Reset"
            actionLabel={settings.saving ? "Resetting…" : "Reset"}
            onPress={() => void settings.reset()}
            disabled={settings.saving}
          />
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection
        title="Budget denominators"
        info="The balance endpoint reports no quota, so a percentage can only be measured against a denominator you choose"
      >
        <SettingsCard>
          <SettingsInput
            label="CNY budget"
            hint="Denominator for the CNY balance percentage, for example 100. Empty or 0 hides the percentage."
            initialValue={String(settings.values.cny)}
            placeholder="100"
            onChangeText={(text) => {
              setCny(text);
              setSaved(false);
            }}
          />
          <SettingsInput
            label="USD budget"
            hint="Denominator for the USD balance. Empty or 0 hides the percentage."
            initialValue={String(settings.values.usd)}
            placeholder="0"
            onChangeText={(text) => {
              setUsd(text);
              setSaved(false);
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Save">
        <SettingsCard>
          <SettingsAction
            label={saved ? "Saved" : "Save budget"}
            hint="Usage reports are cached for five minutes; press Refresh on the usage card to see a change immediately."
            error={problem ?? settings.saveError ?? undefined}
            actionLabel={settings.saving ? "Saving…" : "Save"}
            onPress={() => void onSave()}
            disabled={settings.saving}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Currently applied">
        <SettingsCard>
          <SettingsRow
            label="CNY"
            hint={
              settings.values.cny > 0
                ? `Percentage measured against ¥${settings.values.cny}`
                : "Not set, no percentage shown"
            }
          />
          <SettingsRow
            label="USD"
            hint={
              settings.values.usd > 0
                ? `Percentage measured against $${settings.values.usd}`
                : "Not set, no percentage shown"
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
