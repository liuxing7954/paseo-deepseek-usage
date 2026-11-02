# deepseek-usage

[English](#english) | [中文](#中文)

<a id="english"></a>
## English

Paseo's **DeepSeek official balance** usage source. Once installed, Paseo's Usage panel gets a DeepSeek card with the live `api.deepseek.com` balance. The plugin UI and usage-report labels follow the Paseo app language (English or Simplified Chinese). Requires **Paseo ≥ 0.14.0** (runtime translations). The server provides the usage source, credential management, and settings; the client provides the settings screen, the optional pricing sidebar row, and the language reporter.

Switching the app language updates the plugin UI immediately; usage-report labels update on the next report, or immediately after pressing Refresh on the usage card.

> Unofficial project, not affiliated with DeepSeek. The icon uses the whale path from DeepSeek's official wordmark only to identify the account it displays.

### Credential sources

Auto-discovered stores are scanned in order; manually added keys take precedence. The same key found in several places is one account.

| store | location | notes |
| --- | --- | --- |
| `env` | `DEEPSEEK_API_KEY` | Must be on the **daemon process** (plugin subprocesses inherit the daemon environment); optional `DEEPSEEK_BASE_URL` |
| `dsh` | `~/.dsh/.credentials.yaml` | DeepSeek Harness credentials, `refs.DEEPSEEK_API_KEY` |
| `opencode` | `~/.config/opencode/opencode.json` | `provider.deepseek.options.apiKey` (and its `baseURL`) |
| `deepseek-cli` | `~/.deepseek/config.toml` | Older DeepSeek CLI `api_key` |
| `manual` | Settings → Plugins → DeepSeek | Keys added by hand, stored in `~/.paseo/deepseek-usage/accounts.json` (0600), see below |

Rules:

- **Auto-discovered stores are read-only.** Every `fetch()` re-reads the store, so a CLI token rotation is picked up immediately. The plugin never writes those files and never redeems refresh tokens. Manually added keys live in the plugin's own file and never touch these stores.
- **Credentials never enter the input or report.** The input carries a store locator (for manual keys, a random entry id); account identity is `hashAccountKey(key)`, so **the same key found in multiple stores collapses into one card**.
- **Official host only.** A store pointed at a host other than `api.deepseek.com` is skipped, and `fetch()` rejects a non-official input host. A gateway that speaks the chat API has no `/user/balance` contract.

### Add a key manually

If the key is not in any of the stores above, add it in **Settings → Plugins → DeepSeek → Monitored keys**:

- Fill in a name (optional) and the API key, then press Add. The same key from several sources still produces one card; the manual label wins.
- Keys are stored on the daemon under the Paseo data directory, by default `~/.paseo/deepseek-usage/accounts.json`, with directory mode `0700` and file mode `0600`. They are **not** written to plugin settings (Paseo settings are ordinary host-side JSON, not a credential vault), and never appear in the input or report.
- Only official `api.deepseek.com` keys are accepted; the plugin does not send a key to a third-party gateway.
- Manual keys are local to this daemon. Add them again on another machine.
- After adding, replacing, or deleting a key, open the Usage panel; reports are cached for five minutes, or press Refresh on the usage card to update immediately. Replacing a key creates a new account card.
- The Auto-discovered keys section lists accounts found in local tools and the file each one came from. Those files are read-only to the plugin.

### Session discovery

The composer usage popover answers "which login does this agent actually spend?" and picks the store by harness:

- `opencode` with a `deepseek/*` model → the OpenCode store
- `deepseek-harness-native` (DSH) → the DSH credential store

Every other provider returns `[]`; the plugin does not guess. Manually added keys are not used for session discovery: the plugin cannot tell which harness a manual key belongs to, so it only appears in the global Usage surface.

### Field mapping

`GET /user/balance` returns one balance entry per currency:

- `balances`: one row per currency, `remaining = total_balance`. The contract's `unit` only has `usd | credits | requests | tokens`, with **no CNY**, so amounts ride on `credits` and the currency is carried by the label and `details`.
- `windows`: the **budget percentage** (see below).
- `details`: balance breakdown (with `¥` / `$` as returned), account status, budget, and the `Pricing now` / `Peak hours` rows.
- When `is_available: false`, the balance still shows but the status turns red.

### Budget percentage

The official endpoint has **no quota limit**, so the balance cannot produce a percentage by itself. Paseo's persistent sidebar summary only shows windows with a percentage (client logic: `windows.filter(w => displayPercent(w, displayAs) !== null)`, then `summary: true` for the default pin), so the plugin adds a **display-only denominator** that you set in **Settings → Plugins → DeepSeek → Budget denominators**:

- `remainingPct = balance / budget × 100`, with `summary: true`, so it enters the sidebar summary by default.
- Empty or `0` means no window for that currency; the exact balance still shows.
- The denominator applies to **every monitored account**; multiple accounts share the same CNY/USD denominator.
- Tone uses the SDK's `toneFromUsedPct`: yellow at ≥70% used, red above 90%.
- **This denominator is not provider data** and is never presented as an official limit.
- Reports are cached for five minutes; a change applies within five minutes, or immediately after pressing Refresh on the card.

For the sidebar itself, turn on **Summary in sidebar** in the Usage panel (the hint is *Pinned windows show in the sidebar footer*) and choose `Percentages: Used / Remaining`.

### Peak and off-peak pricing

DeepSeek bills at half price outside peak hours. The usage card always says which side of the boundary you are on: a `Pricing now` row shows the current phase and a relative countdown to the next change, and `Peak hours` shows the schedule (01:00-04:00 and 06:00-10:00 UTC, Monday to Friday). The countdown is independent of the daemon's time zone; the sidebar and its popover format their own local time. These rows travel with the usage report, so they are at most five minutes stale, or current after pressing Refresh.

Turning on **Sidebar row** in **Settings → Plugins → DeepSeek → Pricing window** adds a footer row: a moon icon and `DeepSeek off-peak · −50%`, or a sun icon and the time until off-peak returns. Pressing it opens the schedule and the USD price per million tokens for both tiers. The sidebar row updates every 30 seconds and never touches the network.

Chinese public holidays come from the table in `shared/pricing.ts`, currently the 2026 State Council schedule. A date not in the table is treated as an ordinary weekday until the table is extended. Nothing here reads your token usage.

### Install

Published on npm (currently `0.1.1`; the `0.2.0` described here is local and not published yet):

```bash
paseo plugin add npm:paseo-plugin-deepseek-usage
```

Or install directly from the repository:

```bash
paseo plugin add git:liuxing7954/paseo-deepseek-usage
```

### Development

```bash
npm install
npm run typecheck
npm test              # pricing edges, long holidays, and i18n key/placeholder parity
npm run probe         # discover() + fetch() without the daemon (includes manual keys)
npm run probe -- 500  # try a different percentage denominator
```

`probe` reads the manual key file. Point `PASEO_HOME` at a temporary directory to test without touching your real account file:

```bash
PASEO_HOME=/tmp/paseo-test npm run probe
```

For local development install the directory (`paseo plugin add /absolute/path/to/deepseek-usage`). Run `paseo plugin reload deepseek-usage` after a change; after editing client code, reopen Paseo once so the app fetches the new client bundle.

<a id="zh"></a>
## 中文

Paseo 的 **DeepSeek 官方余额**用量源（usage source）插件。装好后，Paseo 的用量面板会多出一张 DeepSeek 卡片，显示 `api.deepseek.com` 账号的实时余额。插件界面与用量报告文案跟随 Paseo App 语言（英文 / 简体中文）。

需要 **Paseo ≥ 0.14.0**（运行时翻译 API）。server 侧提供用量源、凭据管理与设置，client 侧贡献设置页、可选的侧边栏价格行，以及语言上报。

切换 App 语言会立即更新插件界面；用量报告文案在下次报告时更新，或点用量卡片上的刷新按钮立即更新。

> 非官方项目，与 DeepSeek 无关联。图标取自 DeepSeek 官方 wordmark 中的鲸鱼路径，仅用于标识本插件展示的是 DeepSeek 账号。

### 它读哪些凭据仓库

自动仓库按顺序扫描，手动 Key 优先于自动发现；同一把 key 命中多处只算一个账号：

| store | 位置 | 说明 |
| --- | --- | --- |
| `env` | `DEEPSEEK_API_KEY` | 必须是 **daemon 进程**的环境变量（插件子进程继承 daemon 环境），可选 `DEEPSEEK_BASE_URL` |
| `dsh` | `~/.dsh/.credentials.yaml` | DeepSeek Harness 的凭据文件，取 `refs.DEEPSEEK_API_KEY` |
| `opencode` | `~/.config/opencode/opencode.json` | `provider.deepseek.options.apiKey`（并用它的 `baseURL`） |
| `deepseek-cli` | `~/.deepseek/config.toml` | 旧版 DeepSeek CLI 的 `api_key` |
| `manual` | 设置 → Plugins → DeepSeek | 手动添加的官方 Key，存在 `~/.paseo/deepseek-usage/accounts.json`（0600），见下 |

规则：

- **自动发现的仓库只读。** 每次 `fetch()` 重新读仓库，所以 CLI 轮换 token 后能立刻跟上；绝不写回、绝不兑换 refresh token。手动 Key 写在插件自己的文件里，不碰这些仓库。
- **凭据不进 input / report。** input 里只有仓库地址（手动 Key 是随机 entry id）；账号身份是 `hashAccountKey(key)`，所以**同一把 key 出现在多个仓库时会合并成一张卡片**。
- **只认官方域名。** `baseURL` 不是 `api.deepseek.com` 的仓库会被跳过，`fetch()` 也会拒绝非官方 host —— 第三方网关没有 `/user/balance` 契约。

### 手动添加要监控的 Key

如果 Key 不在上面任何仓库里，可以在 **设置 → Plugins → DeepSeek → 监控的 Key** 里手动添加：

- 填名称（可选）和 API Key，点「添加」。同一把 Key 在多个来源出现时只生成一张卡片，手动添加的标签优先。
- Key 保存在 daemon 的 Paseo 数据目录，默认 `~/.paseo/deepseek-usage/accounts.json`，目录 `0700`、文件 `0600`。它**不写进插件 settings**（Paseo 的 settings 是普通 host 侧 JSON，不是密码库），也不会出现在 input / report 里。
- 只接受 `api.deepseek.com` 的官方 Key，插件不会把 Key 发到第三方网关。
- 手动 Key 只在这台 daemon 上生效；换机器要重新添加。
- 添加、替换或删除后，打开 Usage 面板即可；报告仍有 5 分钟缓存，点用量卡片上的刷新按钮可以立即更新。替换 Key 会生成新的账号卡片。
- 「自动发现的 Key」区域会列出当前从本机工具里读到的账号，以及各自来自哪个文件；这些文件插件只读不写。

### 会话级发现

用量弹窗（composer pill）只显示「这个 agent 实际花的那个账号」，按 harness 选仓库：

- `opencode` + 模型 `deepseek/*` → opencode 仓库
- `deepseek-harness-native`（DSH）→ DSH 凭据仓库

其它 provider 一律返回 `[]`，不会去猜。手动添加的 Key 不参与会话级发现：插件无法从一个 session 判断某个手动 Key 属于哪个 harness，因此它只出现在全局 Usage 面板。

### 字段映射

`GET /user/balance` 返回按币种分的余额条目：

- `balances`：每个币种一行，`remaining = total_balance`。契约里的 `unit` 只有 `usd | credits | requests | tokens`，**没有 CNY**，所以金额挂在 `credits` 上、币种由 label 与 `details` 承载。
- `windows`：**预算百分比**（见下）。
- `details`：`总余额 / 充值余额 / 赠送余额`（带 `¥` / `$` 符号，原样呈现）+ 账号状态 + 预算值 + `当前时段` / `高峰时段`。
- `is_available: false` 时余额照常显示，但状态与色调标红。

### 预算百分比

官方接口**没有额度上限**，所以余额本身算不出百分比。Paseo 的侧边栏常驻摘要又只认「有百分比的 window」（客户端逻辑：`windows.filter(w => displayPercent(w, displayAs) !== null)`，再取 `summary: true` 的作为默认 pin），因此这里引入了一个**显示用**的分母，由你在 **设置 → Plugins → DeepSeek → 预算分母** 里填：

```ts
// shared/settings.ts
schema: z.object({
  cny: z.number().min(0).default(100),
  usd: z.number().min(0).default(0),
})
```

- `remainingPct = 余额 / 预算 × 100`，`summary: true` → 默认就进侧边栏摘要
- 填 0 或留空 = 该币种不生成 window（精确余额照常显示）
- 这个分母对**所有监控账号**生效；多个账号共用同一个人民币/美元分母
- 色调走 SDK 的 `toneFromUsedPct`：已用 ≥70% 变黄、>90% 变红
- **这个分母不是 provider 数据**，永远不会被当作官方额度上限展示
- 报告有 5 分钟缓存：改完最多 5 分钟生效，或点用量卡片上的刷新按钮立即生效

侧边栏要真正显示，还得在 **Usage 面板**里打开 `Summary in sidebar` 开关（提示语：*Pinned windows show in the sidebar footer*），并按喜好选择 `Percentages: Used / Remaining`。

### 高峰 / 低谷时段

DeepSeek 在高峰时段的价格是低谷的两倍，插件可以把这个状态显示出来：

- **用量卡片**：`当前时段`（现在是高峰还是低谷、下次切换的倒计时）+ `高峰时段`（具体时段）
- **侧边栏**（可选）：底部多一行 `DeepSeek 低谷` / `DeepSeek 高峰`，点开是完整价目表

卡片那两行默认就有；侧边栏那行是可选的，在 **设置 → Plugins → DeepSeek → 价格时段** 里打开「侧边栏显示」开关即可。侧边栏每 30 秒按本地时钟重算，不走网络；卡片那两行跟着用量报告刷新（5 分钟缓存，点卡片上的刷新按钮立即生效）。卡片里的倒计时与 daemon 时区无关；侧边栏和弹层里的具体时间按客户端本地时区显示。

高峰时段是 UTC 周一至周五 **01:00-04:00 与 06:00-10:00**，中国法定节假日除外；其余时间都是低谷，周末与法定节假日全天低谷。节假日表写在 `shared/pricing.ts`，目前是 2026 年的安排，下一次国务院通知发布后需要补上。

### 安装

已发布到 npm（当前 0.1.1；本文对应的 0.2.0 还在本地，尚未发布）：

```bash
paseo plugin add npm:paseo-plugin-deepseek-usage
```

或直接从仓库装：

```bash
paseo plugin add git:liuxing7954/paseo-deepseek-usage
```

### 开发

```bash
npm install
npm run typecheck
npm test              # 高峰/低谷时段、长假边界、i18n key 与占位符一致性
npm run probe         # 脱离 daemon，直接跑 discover() + fetch() 并打印结果（含手动 Key）
npm run probe -- 500  # 指定百分比分母试算
```

`probe` 会读取手动 Key 文件；把 `PASEO_HOME` 指向一个临时目录，就能在不碰真实账号文件的情况下试：

```bash
PASEO_HOME=/tmp/paseo-test npm run probe
```

开发时用本地目录装（`paseo plugin add /absolute/path/to/deepseek-usage`），改完 `paseo plugin reload deepseek-usage` 生效；改到 client 侧代码时，App 可能需要重开一次以拉取新的客户端 bundle。
