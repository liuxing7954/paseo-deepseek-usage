import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useState } from "react";
import {
  addAccount,
  listAccounts,
  removeAccount,
  updateAccount,
  type AccountsView,
  type AutoAccountView,
  type ManualAccountView,
} from "../shared/accounts";
import { BudgetSettingsSection } from "./budget-settings";

const STORE_LABEL: Record<AutoAccountView["store"], string> = {
  env: "环境变量 DEEPSEEK_API_KEY",
  dsh: "~/.dsh/.credentials.yaml",
  opencode: "~/.config/opencode/opencode.json",
  "deepseek-cli": "~/.deepseek/config.toml",
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/**
 * The key manager. The client only ever receives labels and masked hints: adding sends a key once,
 * and editing can replace it, but the current key never comes back to the app.
 */
function AccountsSection() {
  const listRpc = useRpc(listAccounts);
  const addRpc = useRpc(addAccount);
  const updateRpc = useRpc(updateAccount);
  const removeRpc = useRpc(removeAccount);

  const [view, setView] = useState<AccountsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [addLabel, setAddLabel] = useState("");
  const [addKey, setAddKey] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editing, setEditing] = useState<ManualAccountView | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editKey, setEditKey] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Remounts the "add" inputs after a save so their internal text is cleared.
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      setView(await listRpc({}));
    } catch (error) {
      setListError(describeError(error));
    } finally {
      setLoading(false);
    }
  }, [listRpc]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (addBusy) return;
    const key = addKey.trim();
    if (key === "") {
      setAddError("请填写 API Key");
      return;
    }

    setAddBusy(true);
    setAddError(null);
    setNotice(null);
    try {
      await addRpc({ label: addLabel, key });
      setFormKey((value) => value + 1);
      setAddLabel("");
      setAddKey("");
      setNotice("已添加。打开 Usage 面板，或点用量卡片上的刷新按钮即可看到。");
      await load();
    } catch (error) {
      setAddError(describeError(error));
    } finally {
      setAddBusy(false);
    }
  };

  const beginEdit = (account: ManualAccountView) => {
    setEditing(account);
    setEditLabel(account.label);
    setEditKey("");
    setEditError(null);
    setConfirmDelete(false);
    setNotice(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditKey("");
    setEditError(null);
    setConfirmDelete(false);
  };

  const saveEdit = async () => {
    if (!editing || editBusy) return;
    setEditBusy(true);
    setEditError(null);
    setNotice(null);
    try {
      await updateRpc({ id: editing.id, label: editLabel, key: editKey.trim() || undefined });
      setFormKey((value) => value + 1);
      setEditing(null);
      setEditKey("");
      setConfirmDelete(false);
      setNotice("已保存修改。");
      await load();
    } catch (error) {
      setEditError(describeError(error));
    } finally {
      setEditBusy(false);
    }
  };

  const deleteEditing = async () => {
    if (!editing || editBusy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setEditBusy(true);
    setEditError(null);
    setNotice(null);
    try {
      const result = await removeRpc({ id: editing.id });
      setEditing(null);
      setEditKey("");
      setConfirmDelete(false);
      setNotice(result.removed ? "已从监控列表删除。" : "这个 Key 已经不在了。");
      await load();
    } catch (error) {
      setEditError(describeError(error));
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <>
      <SettingsSection
        title="监控的 Key"
        info="手动添加的 Key 保存在 daemon 的 Paseo 数据目录（默认 ~/.paseo/deepseek-usage/accounts.json，权限 0600），不写进插件设置，也不会出现在用量报告里。"
      >
        <SettingsCard>
          {notice ? <SettingsRow label={notice} /> : null}
          {loading && !view ? <SettingsRow label="读取中…" /> : null}
          {listError ? (
            <>
              <SettingsRow label="读取失败" error={listError} />
              <SettingsAction label="重试" actionLabel="重试" onPress={() => void load()} />
            </>
          ) : null}
          {view && view.manual.length === 0 ? (
            <SettingsRow
              label="还没有手动添加的 Key"
              hint="在下面的「添加 Key」里填一个官方 API Key 就能加入监控。"
            />
          ) : null}
          {view?.manual.map((account) => (
            <SettingsAction
              key={account.id}
              label={account.label}
              hint={`${account.keyHint} · 更新于 ${formatDate(account.updatedAt)}`}
              actionLabel="编辑"
              onPress={() => beginEdit(account)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>

      {editing ? (
        <SettingsSection
          title={`编辑「${editing.label}」`}
          info="替换 Key 会生成一张新的账号卡片；留空表示只改名称。"
        >
          <SettingsCard>
            <SettingsInput
              key={`edit-label-${editing.id}-${formKey}`}
              label="名称"
              initialValue={editing.label}
              onChangeText={setEditLabel}
            />
            <SettingsInput
              key={`edit-key-${editing.id}-${formKey}`}
              label="替换 Key（可选）"
              hint="留空 = 不改；填了会用新 Key 替换旧 Key。"
              placeholder="sk-..."
              secureTextEntry
              onChangeText={setEditKey}
            />
            <SettingsAction
              label="保存修改"
              actionLabel={editBusy ? "保存中…" : "保存"}
              error={editError ?? undefined}
              onPress={() => void saveEdit()}
              disabled={editBusy}
            />
            <SettingsAction
              label="删除这个 Key"
              hint="只从插件列表移除，不会动 DeepSeek 账号本身。"
              actionLabel={confirmDelete ? "确认删除" : "删除"}
              onPress={() => void deleteEditing()}
              disabled={editBusy}
            />
            <SettingsAction
              label="不修改了"
              actionLabel="取消"
              onPress={cancelEdit}
              disabled={editBusy}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="添加 Key"
        info="只接受 api.deepseek.com 的官方 Key；同一把 Key 出现在多个来源时只会生成一张卡片。"
      >
        <SettingsCard>
          <SettingsInput
            key={`add-label-${formKey}`}
            label="名称（可选）"
            hint="显示在用量卡片上，方便区分多个账号。留空会显示「自定义 Key」。"
            placeholder="例如：备用账号"
            onChangeText={setAddLabel}
          />
          <SettingsInput
            key={`add-key-${formKey}`}
            label="API Key"
            hint="只发送给 api.deepseek.com，不会写进插件设置。"
            placeholder="sk-..."
            secureTextEntry
            onChangeText={setAddKey}
          />
          <SettingsAction
            label="添加到监控"
            actionLabel={addBusy ? "添加中…" : "添加"}
            error={addError ?? undefined}
            onPress={() => void add()}
            disabled={addBusy}
          />
        </SettingsCard>
      </SettingsSection>


      <SettingsSection
        title="自动发现的 Key"
        info="从本机已有工具的配置里读取，插件只读，不会修改这些文件。与手动 Key 重复时只显示手动那一条。"
      >
        <SettingsCard>
          {view?.auto.map((account) => (
            <SettingsRow
              key={`${account.store}-${account.harness}`}
              label={account.harness}
              hint={STORE_LABEL[account.store]}
            />
          ))}
          {view && view.auto.length === 0 ? (
            <SettingsRow
              label="没有自动发现 Key"
              hint="可以手动添加，或按 README 配置环境变量 / 已有工具的凭据文件。"
            />
          ) : null}
          <SettingsAction
            label="刷新列表"
            hint="添加或删除后也会自动刷新。"
            actionLabel={loading ? "读取中…" : "刷新"}
            onPress={() => void load()}
            disabled={loading}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

export function DeepSeekSettingsScreen(props: PluginSurfaceProps) {
  return (
    <>
      <AccountsSection />
      <BudgetSettingsSection {...props} />
    </>
  );
}
