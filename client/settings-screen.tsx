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
  env: "Environment variable DEEPSEEK_API_KEY",
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
      setAddError("Please enter an API key");
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
      setNotice("Added. Open the Usage panel, or press Refresh on the usage card to see it.");
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
      setNotice("Changes saved.");
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
      setNotice(result.removed ? "Removed from the monitored list." : "This key is no longer there.");
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
        title="Monitored keys"
        info="Manually added keys are stored on the daemon under the Paseo data directory (by default ~/.paseo/deepseek-usage/accounts.json, mode 0600). They are not written to plugin settings and never appear in usage reports."
      >
        <SettingsCard>
          {notice ? <SettingsRow label={notice} /> : null}
          {loading && !view ? <SettingsRow label="Loading…" /> : null}
          {listError ? (
            <>
              <SettingsRow label="Could not read the list" error={listError} />
              <SettingsAction label="Retry" actionLabel="Retry" onPress={() => void load()} />
            </>
          ) : null}
          {view && view.manual.length === 0 ? (
            <SettingsRow
              label="No manually added keys yet"
              hint="Add an official API key in the Add key section below."
            />
          ) : null}
          {view?.manual.map((account) => (
            <SettingsAction
              key={account.id}
              label={account.label}
              hint={`${account.keyHint} · updated ${formatDate(account.updatedAt)}`}
              actionLabel="Edit"
              onPress={() => beginEdit(account)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>

      {editing ? (
        <SettingsSection
          title={`Edit "${editing.label}"`}
          info="Replacing the key creates a new account card; leave it blank to change only the name."
        >
          <SettingsCard>
            <SettingsInput
              key={`edit-label-${editing.id}-${formKey}`}
              label="Name"
              initialValue={editing.label}
              onChangeText={setEditLabel}
            />
            <SettingsInput
              key={`edit-key-${editing.id}-${formKey}`}
              label="Replace key (optional)"
              hint="Blank = keep the current key. Filling it replaces the old key."
              placeholder="sk-..."
              secureTextEntry
              onChangeText={setEditKey}
            />
            <SettingsAction
              label="Save changes"
              actionLabel={editBusy ? "Saving…" : "Save"}
              error={editError ?? undefined}
              onPress={() => void saveEdit()}
              disabled={editBusy}
            />
            <SettingsAction
              label="Delete this key"
              hint="Removes it from this plugin only; the DeepSeek account is not touched."
              actionLabel={confirmDelete ? "Confirm delete" : "Delete"}
              onPress={() => void deleteEditing()}
              disabled={editBusy}
            />
            <SettingsAction
              label="Cancel"
              actionLabel="Cancel"
              onPress={cancelEdit}
              disabled={editBusy}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title="Add key"
        info="Only official api.deepseek.com keys are accepted. The same key from several sources still produces one card."
      >
        <SettingsCard>
          <SettingsInput
            key={`add-label-${formKey}`}
            label="Name (optional)"
            hint={'Shown on the usage card so multiple accounts are easy to tell apart. Blank shows "Manual key".'}
            placeholder="e.g. Backup account"
            onChangeText={setAddLabel}
          />
          <SettingsInput
            key={`add-key-${formKey}`}
            label="API Key"
            hint="Sent only to api.deepseek.com; never written to plugin settings."
            placeholder="sk-..."
            secureTextEntry
            onChangeText={setAddKey}
          />
          <SettingsAction
            label="Add to monitored keys"
            actionLabel={addBusy ? "Adding…" : "Add"}
            error={addError ?? undefined}
            onPress={() => void add()}
            disabled={addBusy}
          />
        </SettingsCard>
      </SettingsSection>


      <SettingsSection
        title="Auto-discovered keys"
        info="Read from tools already configured on this machine. The plugin never writes to those files. If a key duplicates a manual one, only the manual entry is shown."
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
              label="No auto-discovered keys"
              hint="Add one manually, or configure the environment variable / an existing tool's credential file as described in the README."
            />
          ) : null}
          <SettingsAction
            label="Refresh list"
            hint="Also refreshes automatically after adding or deleting."
            actionLabel={loading ? "Loading…" : "Refresh"}
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
