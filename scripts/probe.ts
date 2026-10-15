/**
 * Standalone probe: runs this plugin's own `discover()` against the local credential stores and
 * prints the report `fetch()` returns, without involving the Paseo daemon.
 *
 *   npm run probe
 *
 * Pass budget denominators as arguments to see the gauge with a different denominator:
 *
 *   npm run probe -- 300
 */
import { budgetMap, budgetSettings } from "../shared/settings.js";
import { inputSchema } from "../shared/input.js";
import { createFetchUsage, discover } from "../server/usage.js";

const cny = process.argv[2] ? Number(process.argv[2]) : budgetSettings.schema.parse({}).cny;
const budgets = budgetMap({ cny, usd: 0 });
const fetchUsage = createFetchUsage(async () => budgets);

console.log(`预算分母: ${JSON.stringify(budgets)}\n`);

const accounts = await discover();
console.log(`发现 ${accounts.length} 个账号\n`);

for (const account of accounts) {
  const input = inputSchema.parse(account.input);
  console.log(`- ${account.label}  harness=${account.harness ?? "-"}`);
  console.log(`  key(hash)=${account.key}`);
  console.log(`  store=${input.store} locator=${input.locator}`);
}

for (const account of accounts) {
  console.log(`\n===== fetch: ${account.label} =====`);
  try {
    console.log(JSON.stringify(await fetchUsage(account.input), null, 2));
  } catch (error) {
    console.log("ERROR:", error instanceof Error ? error.message : error);
  }
}

if (accounts.length === 0) {
  console.log("没有发现任何官方 DeepSeek key（DEEPSEEK_API_KEY / ~/.dsh / opencode / ~/.deepseek）");
}
