import { z } from "zod";
import {
  balanceToneFromRemaining,
  hashAccountKey,
  toneFromUsedPct,
  unavailable,
  windowFromUsedPct,
  type UsageAccount,
  type UsageBalance,
  type UsageDetail,
  type UsageReport,
  type UsageScope,
  type UsageWindow,
} from "@getpaseo/plugin/server/usage";
import { inputSchema, type UsageInput } from "../shared/input.js";
import { translate } from "../shared/locales.js";
import { countdownLabel, pricingState } from "../shared/pricing.js";
import { getReportLocale } from "./locale.js";
import { readManualAccount, readManualAccounts } from "./manual-accounts.js";
import {
  credentialStores,
  officialBaseURL,
  readLogin,
  storeById,
  OFFICIAL_BASE_URL,
  type CredentialStore,
} from "./stores.js";

/**
 * `GET /user/balance`. Amounts arrive as decimal strings, one entry per currency, and the endpoint
 * reports whether the account may call the API at all.
 */
const BalanceInfoSchema = z.object({
  currency: z.string(),
  total_balance: z.string(),
  granted_balance: z.string().optional(),
  topped_up_balance: z.string().optional(),
});

const BalanceResponseSchema = z.object({
  is_available: z.boolean().optional(),
  balance_infos: z.array(BalanceInfoSchema),
});

const CURRENCY_SYMBOL: Record<string, string> = { CNY: "¥", USD: "$" };

/** Currency code → budget denominator, as configured on the host. Missing = no gauge. */
export type Budgets = Record<string, number>;

/** Reads the configured budgets. Called per fetch, so a settings change applies without a restart. */
export type BudgetLookup = () => Promise<Budgets>;

/** Account key and input for one store, or `undefined` when that store holds no usable login. */
async function accountFor(store: CredentialStore): Promise<UsageAccount | undefined> {
  const login = await readLogin(store).catch(() => undefined);
  if (!login) return undefined;
  const baseURL = officialBaseURL(login.baseURL);
  if (!baseURL) return undefined;
  const input: UsageInput = { store: store.id, locator: store.locator, baseURL };
  const harness = translate(getReportLocale(), store.harnessKey);
  return {
    // The key never leaves the daemon: only its hash identifies the account, and hashing makes the
    // same key found in several stores collapse into one account card.
    key: hashAccountKey(login.key),
    label: harness,
    harness,
    input,
  };
}

/** Account key and input for one manually added key. The key itself stays in the server-side file. */
function accountForManual(account: { id: string; label: string; key: string }): UsageAccount {
  const input: UsageInput = { store: "manual", locator: account.id, baseURL: OFFICIAL_BASE_URL };
  const harness = translate(getReportLocale(), "stores.manual");
  return {
    key: hashAccountKey(account.key),
    label: account.label,
    harness,
    input,
  };
}

/**
 * Every key the plugin can monitor, in preference order: keys the user added explicitly first, then
 * the read-only harness stores. The same key in several places is one account, so the explicit label
 * wins over the harness name.
 */
export async function discover(): Promise<UsageAccount[]> {
  const accounts: UsageAccount[] = [];
  const seen = new Set<string>();

  let manual: Awaited<ReturnType<typeof readManualAccounts>> = [];
  try {
    manual = await readManualAccounts();
  } catch (error) {
    // A broken manual file must not hide keys that are still readable from other tools.
    console.error(
      "DeepSeek manual accounts could not be read:",
      error instanceof Error ? error.message : error,
    );
  }

  for (const entry of manual) {
    const account = accountForManual(entry);
    if (seen.has(account.key)) continue;
    seen.add(account.key);
    accounts.push(account);
  }

  for (const store of credentialStores()) {
    const account = await accountFor(store);
    if (!account || seen.has(account.key)) continue;
    seen.add(account.key);
    accounts.push(account);
  }
  return accounts;
}

/** The read-only harness stores that currently hold a key, after manual duplicates are merged out. */
export async function discoverAutoAccounts(): Promise<UsageAccount[]> {
  const accounts = await discover();
  return accounts.filter((account) => {
    const parsed = inputSchema.safeParse(account.input);
    return parsed.success && parsed.data.store !== "manual";
  });
}

/**
 * Session discovery answers "which login does this agent spend?" and must not fall back to guessing:
 * it selects the store belonging to the harness that launched the session, and returns `[]` for every
 * other provider.
 */
export async function discoverForSession(
  scope: Extract<UsageScope, { kind: "session" }>,
): Promise<UsageAccount[]> {
  const provider = scope.provider.toLowerCase();
  const model = scope.model ?? "";

  // Same shape as the built-in Codex route (`pi`, `opencode`, `omp` on an `openai/…` model): an
  // OpenCode session on an official DeepSeek model spends OpenCode's own `provider.deepseek` key.
  const store =
    provider === "opencode" && model.startsWith("deepseek/")
      ? storeById("opencode")
      : // The DeepSeek Harness owns its credential file, like Codex owns $CODEX_HOME/auth.json.
        provider === "deepseek-harness-native" || provider === "dsh"
        ? storeById("dsh")
        : undefined;

  if (!store) return [];
  const account = await accountFor(store);
  return account ? [account] : [];
}

/**
 * Builds the source's `fetch()` bound to a budget lookup.
 *
 * The denominators come from the plugin's host settings rather than a constant, and are read on every
 * fetch — the report itself is cached by the daemon for five minutes, so a budget change shows up on
 * the next cache miss or when the user hits Refresh on the card.
 */
export function createFetchUsage(readBudgets: BudgetLookup) {
  return async function fetchUsage(value: unknown): Promise<UsageReport> {
    const input = inputSchema.parse(value);
    const locale = getReportLocale();
    const t = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);

    // Never trust the input's host: a report is addressed by a locator, and only the official host
    // has the `/user/balance` contract. This also stops a tampered input from exfiltrating the key.
    const baseURL = officialBaseURL(input.baseURL);
    if (!baseURL) throw new Error(t("usage.errorHost"));

    let key: string;
    if (input.store === "manual") {
      const account = await readManualAccount(input.locator);
      if (!account) throw new Error(t("usage.manualRemoved"));
      key = account.key;
    } else {
      const store = storeById(input.store);
      if (!store) throw new Error(t("usage.errorUnknownStore", { store: input.store }));

      const login = await readLogin(store);
      if (!login) throw new Error(t("usage.errorStoreMissing"));
      // The store may have been re-pointed after discovery; do not send its key anywhere else.
      if (!officialBaseURL(login.baseURL)) {
        throw new Error(t("usage.errorStoreHost"));
      }
      key = login.key;
    }

    const response = await fetch(new URL("/user/balance", baseURL), {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 401 || response.status === 403) {
      return unavailable({ kind: "rejected", status: response.status });
    }
    if (!response.ok) throw new Error(t("usage.errorBalanceStatus", { status: response.status }));

    const body = BalanceResponseSchema.parse(await response.json());
    if (body.balance_infos.length === 0) {
      return unavailable({ kind: "no_quota", detail: t("usage.noQuota") });
    }

    const budgets = await readBudgets();
    const usable = body.is_available !== false;
    /**
     * Saved pins are matched by `(sourceId, windowId)` across every account of a source, so the account
     * is part of a window's quota scope: without it here, pinning one DeepSeek account's gauge pins the
     * others too. This is the same hash that identifies the account card, so it rotates with the card.
     */
    const accountScope = hashAccountKey(key).slice(0, 8);
    const windows: UsageWindow[] = [];
    const balances: UsageBalance[] = [];
    const details: UsageDetail[] = [
      {
        id: "status",
        label: t("usage.status"),
        value: usable ? t("usage.available") : t("usage.disabled"),
        tone: usable ? "ok" : "danger",
      },
    ];
    const now = Date.now();
    const pricing = pricingState(now);
    const offPeak = pricing.phase === "offPeak";
    // Keep the card timezone-neutral: the daemon may be remote, so an absolute wall-clock label would
    // be in the daemon's zone. A relative countdown is correct wherever the report is read, and the
    // client-side sidebar formats its own local time.
    const nextChangeIn = countdownLabel(pricing.nextChangeAt.getTime() - now);
    details.push(
      {
        id: "pricing",
        label: t("usage.pricingNow"),
        value: offPeak
          ? t("usage.pricingOffPeak", { countdown: nextChangeIn })
          : t("usage.pricingPeak", { countdown: nextChangeIn }),
        tone: offPeak ? "ok" : "warning",
      },
      {
        id: "peak-hours",
        label: t("usage.peakHours"),
        value: t("usage.peakHoursValue"),
      },
    );

    for (const info of body.balance_infos) {
      const parsed = Number.parseFloat(info.total_balance);
    const remaining = Number.isFinite(parsed) ? parsed : null;
    balances.push({
      id: `total:${info.currency}`,
      label: t("usage.balance", { currency: info.currency }),
      remaining,
      // The contract has no CNY unit, so the amount rides on `credits` and the label carries the
      // currency; every exact figure is repeated in `details` with its symbol.
      unit: "credits",
      tone: usable ? balanceToneFromRemaining(remaining) : "danger",
    });
    details.push({
      id: `total:${info.currency}`,
      label: t("usage.totalBalance", { currency: info.currency }),
      value: formatAmount(info.currency, info.total_balance),
    });

    // The budget gauge: a percentage the pinned-summary surfaces can show, measured against a
    // denominator the user configured rather than a limit the provider never reported.
    const budget = budgets[info.currency];
    if (remaining !== null && budget !== undefined && budget > 0) {
      const usedPct = clampPct(100 - (remaining / budget) * 100);
      windows.push(
        windowFromUsedPct({
          id: `budget:${info.currency}:${accountScope}`,
          label: t("usage.windowBudget", { budget }),
          shortLabel: CURRENCY_SYMBOL[info.currency] ?? info.currency,
          summary: true,
          utilizationPct: usedPct,
          tone: usable ? toneFromUsedPct(usedPct) : "danger",
        }),
      );
      details.push({
        id: `budget:${info.currency}`,
        label: t("usage.budgetBasis"),
        value: formatAmount(info.currency, String(budget)),
      });
    }
    if (info.topped_up_balance !== undefined) {
      details.push({
        id: `topped_up:${info.currency}`,
        label: t("usage.toppedUp"),
        value: formatAmount(info.currency, info.topped_up_balance),
      });
    }
    if (info.granted_balance !== undefined) {
      details.push({
        id: `granted:${info.currency}`,
        label: t("usage.granted"),
        value: formatAmount(info.currency, info.granted_balance),
      });
    }
  }

    return {
      status: "available",
      planLabel: usable ? t("usage.plan") : t("usage.planDisabled"),
      windows,
      balances,
      details,
    };
  };
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatAmount(currency: string, amount: string): string {
  const symbol = CURRENCY_SYMBOL[currency];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}
