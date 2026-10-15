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
  if (!Number.isFinite(value) || value < 0) return `${label} 需要填一个 ≥ 0 的数字`;
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
    const nextCny = parseBudget(cny ?? String(settings.values.cny), "CNY 预算");
    if (typeof nextCny === "string") return setProblem(nextCny);
    const nextUsd = parseBudget(usd ?? String(settings.values.usd), "USD 预算");
    if (typeof nextUsd === "string") return setProblem(nextUsd);

    setProblem(null);
    setSaved(await settings.save({ cny: nextCny, usd: nextUsd }, settings.revision));
  };

  if (settings.status === "loading") {
    return (
      <SettingsSection title="预算分母">
        <SettingsCard>
          <SettingsRow label="读取中…" />
        </SettingsCard>
      </SettingsSection>
    );
  }

  if (settings.status === "invalid" || settings.status === "error") {
    const message = settings.status === "invalid" ? settings.error : settings.error;
    return (
      <SettingsSection title="预算分母">
        <SettingsCard>
          <SettingsRow label="设置读不出来" error={message} hint="重置会把它恢复成默认值（CNY 300）" />
          <SettingsAction label="重置" actionLabel={settings.saving ? "重置中…" : "重置"} onPress={() => void settings.reset()} disabled={settings.saving} />
        </SettingsCard>
      </SettingsSection>
    );
  }

  return (
    <>
      <SettingsSection title="预算分母" info="余额接口不返回额度上限，百分比只能相对一个你选定的分母">
        <SettingsCard>
          <SettingsInput
            label="CNY 预算"
            hint="人民币余额的百分比分母，例如 300。留空或填 0 = 不显示百分比。"
            initialValue={String(settings.values.cny)}
            placeholder="300"
            onChangeText={(text) => {
              setCny(text);
              setSaved(false);
            }}
          />
          <SettingsInput
            label="USD 预算"
            hint="美元余额的分母。留空或填 0 = 不显示百分比。"
            initialValue={String(settings.values.usd)}
            placeholder="0"
            onChangeText={(text) => {
              setUsd(text);
              setSaved(false);
            }}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="保存">
        <SettingsCard>
          <SettingsAction
            label={saved ? "已保存" : "保存预算"}
            hint="用量报告有 5 分钟缓存；保存后想立刻看到，点用量卡片上的刷新按钮。"
            error={problem ?? settings.saveError ?? undefined}
            actionLabel={settings.saving ? "保存中…" : "保存"}
            onPress={() => void onSave()}
            disabled={settings.saving}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="当前生效">
        <SettingsCard>
          <SettingsRow
            label="CNY"
            hint={settings.values.cny > 0 ? `相对 ¥${settings.values.cny} 计算百分比` : "未设置，不显示百分比"}
          />
          <SettingsRow
            label="USD"
            hint={settings.values.usd > 0 ? `相对 $${settings.values.usd} 计算百分比` : "未设置，不显示百分比"}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
