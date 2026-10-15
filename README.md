# deepseek-usage

Paseo 的 **DeepSeek 官方余额**用量源（usage source）插件。装好后，Paseo 的用量面板会多出一张 DeepSeek 卡片，显示 `api.deepseek.com` 账号的实时余额。

需要 **Paseo ≥ 0.11.0**（用量源 API 是 0.11 引入的）。只贡献 server 侧代码，没有 client 入口，因此不受 app 版本匹配限制。

## 它读哪些凭据仓库

按顺序扫描，命中即算一个账号：

| store | 位置 | 说明 |
| --- | --- | --- |
| `env` | `DEEPSEEK_API_KEY` | 必须是 **daemon 进程**的环境变量（插件子进程继承 daemon 环境），可选 `DEEPSEEK_BASE_URL` |
| `dsh` | `~/.dsh/.credentials.yaml` | DeepSeek Harness 的凭据文件，取 `refs.DEEPSEEK_API_KEY` |
| `opencode` | `~/.config/opencode/opencode.json` | `provider.deepseek.options.apiKey`（并用它的 `baseURL`） |
| `deepseek-cli` | `~/.deepseek/config.toml` | 旧版 DeepSeek CLI 的 `api_key` |

规则与内置源一致：

- **只读**。每次 `fetch()` 重新读仓库，所以 CLI 轮换 token 后能立刻跟上；绝不写回、绝不兑换 refresh token。
- **凭据不进 input / report**。input 里只有仓库地址；账号身份是 `hashAccountKey(key)`，所以**同一把 key 出现在多个仓库时会合并成一张卡片**。
- **只认官方域名**。`baseURL` 不是 `api.deepseek.com` 的仓库会被跳过 —— 第三方网关没有 `/user/balance` 契约。

## 会话级发现

用量弹窗（composer pill）只显示「这个 agent 实际花的那个账号」，按 harness 选仓库：

- `opencode` + 模型 `deepseek/*` → opencode 仓库
- `deepseek-harness-native`（DSH）→ DSH 凭据仓库

其它 provider 一律返回 `[]`，不会去猜。

## 字段映射

`GET /user/balance` 返回按币种分的余额条目：

- `balances`：每个币种一行，`remaining = total_balance`。契约里的 `unit` 只有 `usd | credits | requests | tokens`，**没有 CNY**，所以金额挂在 `credits` 上、币种由 label 与 `details` 承载。
- `windows`：**预算百分比**（见下）。
- `details`：`总余额 / 充值余额 / 赠送余额`（带 `¥` / `$` 符号，原样呈现）+ 账号状态 + 预算值。
- `is_available: false` 时余额照常显示，但状态与色调标红。

### 预算百分比（可在 App 里设置）

官方接口**没有额度上限**，所以余额本身算不出百分比。Paseo 的侧边栏常驻摘要又只认「有百分比的 window」（客户端逻辑：`windows.filter(w => displayPercent(w, displayAs) !== null)`，再取 `summary: true` 的作为默认 pin），因此这里引入了一个**显示用**的分母，由你在 **设置 → Plugins → DeepSeek 预算** 里填：

```ts
// shared/settings.ts
schema: z.object({
  cny: z.number().min(0).default(300),
  usd: z.number().min(0).default(0),
})
```

- `remainingPct = 余额 / 预算 × 100`，`summary: true` → 默认就进侧边栏摘要
- 填 0 或留空 = 该币种不生成 window（精确余额照常显示）
- 色调走 SDK 的 `toneFromUsedPct`：已用 ≥70% 变黄、>90% 变红
- **这个分母不是 provider 数据**，永远不会被当作官方额度上限展示
- 报告有 5 分钟缓存：改完最多 5 分钟生效，或点用量卡片上的刷新按钮立即生效

侧边栏要真正显示，还得在 **Usage 面板**里打开 `Summary in sidebar` 开关（提示语：*Pinned windows show in the sidebar footer*），并按喜好选择 `Percentages: Used / Remaining`。


## 开发

```bash
npm install
npm run typecheck
npm run probe        # 脱离 daemon，直接跑 discover() + fetch() 并打印结果
npm run probe -- 500 # 指定百分比分母试算
```

安装到本机 daemon：

```bash
paseo plugin add /absolute/path/to/deepseek-usage
paseo plugin logs deepseek-usage
```

改代码后 `paseo plugin reload deepseek-usage` 即可生效（改到 client 侧代码时，App 可能需要重开一次以拉取新的客户端 bundle）。
