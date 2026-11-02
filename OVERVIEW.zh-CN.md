# DeepSeek 余额

在 Paseo 的用量面板里显示 DeepSeek 官方账号余额，和 Claude、Codex 等已有配额放在一起。插件界面与用量报告文案跟随 Paseo App 语言（英文 / 简体中文）。

## 它读什么

插件从本机已有 DeepSeek 工具写下的凭据仓库里读取 API Key，再调用 `GET https://api.deepseek.com/user/balance`。它不会写回这些仓库。来源按优先级排列：

- 在 设置 → Plugins → DeepSeek 里手动添加的 Key（存在 daemon 上插件自己的文件里）
- daemon 环境变量 `DEEPSEEK_API_KEY`
- `~/.dsh/.credentials.yaml`，DeepSeek Harness 的凭据文件
- `~/.config/opencode/opencode.json`，OpenCode 的 `deepseek` provider 配置
- `~/.deepseek/config.toml`，旧版 DeepSeek CLI 配置

指向 `api.deepseek.com` 以外 host 的仓库会被跳过，因为只兼容聊天 API 的网关没有余额契约。手动添加的 Key 也遵守同一条规则。

每把 Key 生成一张账号卡片；同一把 Key 出现在两个来源时只算一个账号，不会重复计数。卡片用 Key 的 hash 标识，从不使用 Key 本身。Key 只会作为余额请求的 Authorization 头发给 `api.deepseek.com`，不会进入报告，也不会进入 Paseo 回传给客户端的其他内容。

## 安装

在 Paseo 安装插件后打开 Usage。如果没有发现 Key，可以在 设置 → Plugins → DeepSeek 里手动添加，或者给 daemon 设置 `DEEPSEEK_API_KEY`，或用上面任一工具登录一次。插件界面跟随 App 语言；切换语言后，下一次用量报告会使用新语言。

手动添加的 Key 保存在 daemon 的 Paseo 数据目录（默认 `~/.paseo/deepseek-usage/accounts.json`），权限仅限当前用户。设置页只显示掩码提示，Key 不会回传给 App。插件 settings 文档不用于保存凭据。

## 预算百分比

余额接口返回的是钱，不是配额，本身没有百分比。Paseo 的侧边栏摘要只显示带百分比的 window，所以插件提供了一个相对「你设定的预算」计算的百分比。

在 设置 → Plugins → DeepSeek 的预算分母里填 CNY 和 USD 两个字段。这个分母对所有监控账号生效。某个币种留空或填 0 就不生成该币种的百分比，精确余额仍然显示。已用 ≥70% 变黄、>90% 变红，和 Paseo 对 provider 配额的阈值一致。

百分比永远相对你自己的数字，不会冒充官方额度上限。改完最多 5 分钟生效，或点用量卡片上的刷新按钮立即生效。

要让百分比常驻侧边栏，在 Usage 面板打开 Summary in sidebar 并 pin 对应的 window。

## 高峰 / 低谷时段

DeepSeek 在高峰时段之外按半价计费。用量卡片会显示当前处于哪一侧：一行显示当前时段和距离下次切换的相对倒计时，下一行是具体时段（UTC 周一至周五 01:00-04:00、06:00-10:00）。倒计时与 daemon 时区无关；侧边栏和它的弹层按客户端本地时间显示具体时刻。这些行跟着用量报告刷新，最多落后 5 分钟，点卡片上的刷新按钮可立即更新。

在 设置 → Plugins → DeepSeek 打开侧边栏显示后，侧边栏底部会多一行：低谷时是月亮图标和 −50%，高峰时是太阳图标和距离低谷的时间。点开可以看到完整时段和两档每百万 token 的价格。侧边栏每 30 秒按本地时钟重算，不访问网络。

中国法定节假日来自 `shared/pricing.ts` 里的表，目前是 2026 年国务院安排；下一年通知发布后需要补上。在这之前，表里没有的日期按普通工作日处理。这里不读取你的 token 用量。

## 限制

- 只有余额。DeepSeek 这个接口不提供逐请求花费，所以没有用量历史或消耗速率。
- 同一台机器上的两个账号显示成两张卡片。pin 按 source 和 window 存储，两个账号各有自己的 window，可以分别 pin。
- 手动添加的 Key 只出现在全局 Usage 面板，无法归属到某个 agent session，因为 session scope 只知道启动它的 harness。
- 更换 API Key 会改变账号 hash，旧卡片和它的 pin 会退役。
