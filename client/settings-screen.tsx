import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc, useTranslation } from "@getpaseo/plugin/client";
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
import { LocaleReporter } from "./locale-reporter";
import { messages } from "./messages";

const STORE_HINT: Record<AutoAccountView["store"], string> = {
  env: "DEEPSEEK_API_KEY",
  dsh: "~/.dsh/.credentials.yaml",
  opencode: "~/.config/opencode/opencode.json",
  "deepseek-cli": "~/.deepseek/config.toml",
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(locale);
}

/**
 * The key manager. The client only ever receives labels and masked hints: adding sends a key once,
 * and editing can replace it, but the current key never comes back to the app.
 */
function AccountsSection() {
  const { t, locale } = useTranslation(messages);
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

  const storeLabel = (store: AutoAccountView["store"]) =>
    ({
      env: t("stores.env"),
      dsh: t("stores.dsh"),
      opencode: t("stores.opencode"),
      "deepseek-cli": t("stores.deepseekCli"),
    })[store];

  const add = async () => {
    if (addBusy) return;
    const key = addKey.trim();
    if (key === "") {
      setAddError(t("settings.keys.keyRequired"));
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
      setNotice(t("settings.keys.noticeAdded"));
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
      setNotice(t("settings.keys.saved"));
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
      setNotice(result.removed ? t("settings.keys.deleted") : t("settings.keys.gone"));
      await load();
    } catch (error) {
      setEditError(describeError(error));
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <>
      <SettingsSection title={t("settings.sections.keys")} info={t("settings.keys.info")}>
        <SettingsCard>
          {notice ? <SettingsRow label={notice} /> : null}
          {loading && !view ? <SettingsRow label={t("settings.common.loading")} /> : null}
          {listError ? (
            <>
              <SettingsRow label={t("settings.keys.readFailed")} error={listError} />
              <SettingsAction
                label={t("settings.keys.retry")}
                actionLabel={t("settings.keys.retry")}
                onPress={() => void load()}
              />
            </>
          ) : null}
          {view && view.manual.length === 0 ? (
            <SettingsRow label={t("settings.keys.empty")} hint={t("settings.keys.emptyHint")} />
          ) : null}
          {view?.manual.map((account) => (
            <SettingsAction
              key={account.id}
              label={account.label}
              hint={t("settings.keys.updated", {
                hint: account.keyHint,
                date: formatDate(account.updatedAt, locale),
              })}
              actionLabel={t("settings.keys.edit")}
              onPress={() => beginEdit(account)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>

      {editing ? (
        <SettingsSection
          title={t("settings.sections.editKey", { label: editing.label })}
          info={t("settings.keys.editInfo")}
        >
          <SettingsCard>
            <SettingsInput
              key={`edit-label-${editing.id}-${formKey}`}
              label={t("settings.keys.name")}
              initialValue={editing.label}
              onChangeText={setEditLabel}
            />
            <SettingsInput
              key={`edit-key-${editing.id}-${formKey}`}
              label={t("settings.keys.replaceKey")}
              hint={t("settings.keys.replaceKeyHint")}
              placeholder="sk-..."
              secureTextEntry
              onChangeText={setEditKey}
            />
            <SettingsAction
              label={t("settings.keys.save")}
              actionLabel={editBusy ? t("settings.keys.saving") : t("settings.keys.saveAction")}
              error={editError ?? undefined}
              onPress={() => void saveEdit()}
              disabled={editBusy}
            />
            <SettingsAction
              label={t("settings.keys.delete")}
              hint={t("settings.keys.deleteHint")}
              actionLabel={
                confirmDelete ? t("settings.keys.confirmDelete") : t("settings.keys.deleteAction")
              }
              onPress={() => void deleteEditing()}
              disabled={editBusy}
            />
            <SettingsAction
              label={t("settings.common.cancel")}
              actionLabel={t("settings.common.cancel")}
              onPress={cancelEdit}
              disabled={editBusy}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection title={t("settings.sections.addKey")} info={t("settings.keys.addInfo")}>
        <SettingsCard>
          <SettingsInput
            key={`add-label-${formKey}`}
            label={t("settings.keys.addName")}
            hint={t("settings.keys.addNameHint")}
            placeholder={t("settings.keys.addNamePlaceholder")}
            onChangeText={setAddLabel}
          />
          <SettingsInput
            key={`add-key-${formKey}`}
            label={t("settings.keys.addKey")}
            hint={t("settings.keys.addKeyHint")}
            placeholder="sk-..."
            secureTextEntry
            onChangeText={setAddKey}
          />
          <SettingsAction
            label={t("settings.keys.addAction")}
            actionLabel={addBusy ? t("settings.keys.adding") : t("settings.keys.add")}
            error={addError ?? undefined}
            onPress={() => void add()}
            disabled={addBusy}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title={t("settings.sections.autoKeys")} info={t("settings.keys.autoInfo")}>
        <SettingsCard>
          {view?.auto.map((account) => (
            <SettingsRow
              key={account.store}
              label={storeLabel(account.store)}
              hint={STORE_HINT[account.store]}
            />
          ))}
          {view && view.auto.length === 0 ? (
            <SettingsRow
              label={t("settings.keys.autoEmpty")}
              hint={t("settings.keys.autoEmptyHint")}
            />
          ) : null}
          <SettingsAction
            label={t("settings.keys.refresh")}
            hint={t("settings.keys.refreshHint")}
            actionLabel={
              loading ? t("settings.keys.refreshing") : t("settings.keys.refreshAction")
            }
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
      <LocaleReporter />
      <AccountsSection />
      <BudgetSettingsSection {...props} />
    </>
  );
}
